import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function browserPath() {
  const candidates = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const path of candidates.filter(Boolean)) {
    try { await access(path); return path; } catch {}
  }
  throw new Error('Browser smoke requires Chrome/Chromium. Set CHROME_PATH; no browser is installed by this script.');
}

/** Fresh browser profile and owned Vite process; never touches a running MARK. */
export async function launchBrowser({ width = 1200, height = 820 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'mark-reader-smoke-'));
  const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  const port = await unusedPort();
  const chromePath = await browserPath();
  let vite, chrome, socket, nextId = 0;
  const pending = new Map();
  const exceptions = [];
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', {
      expression: typeof expression === 'function' ? `(${expression})()` : expression,
      awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await pause(80);
    }
    throw new Error('Browser condition timed out: ' + expression);
  };
  const close = async () => {
    try { if (socket?.readyState === WebSocket.OPEN) await cdp('Browser.close'); } catch {}
    socket?.close();
    chrome?.kill();
    vite?.kill();
  };
  try {
    vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    vite.stdout.on('data', data => log += data);
    vite.stderr.on('data', data => log += data);
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {}
      if (i === 100) throw new Error('Vite start failed: ' + log);
      await pause(80);
    }
    chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', '--user-data-dir=' + join(dir, 'profile'), 'about:blank'], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let debugPort;
    for (let i = 0; ; i++) {
      try {
        debugPort = Number((await readFile(join(dir, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]);
        if (debugPort) break;
      } catch {}
      if (i === 100) throw new Error('Chrome start failed');
      await pause(80);
    }
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
        }
      }
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    });
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}` });
    await waitFor('!!document.querySelector(".empty-state")');
    return {
      dir, cdp, evaluate, waitFor, exceptions, close,
      async reload() {
        // Page.reload can return before the old DOM/context disappears.
        // A selector alone can accidentally satisfy the wait on that old page.
        await evaluate(() => { window.__markSmokeBeforeReload = true; });
        await cdp('Page.reload');
        await waitFor('!window.__markSmokeBeforeReload && !!document.querySelector(".notes-btn")');
      },
      async click(selector) {
        const point = await evaluate(`(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          if (!node) throw new Error('Missing click target');
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height || node.closest('[hidden]')) throw new Error('Click target is hidden');
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`);
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
      },
      async drop(name, source) {
        await evaluate(`(() => {
          const data = new DataTransfer();
          data.items.add(new File([${JSON.stringify(source)}], ${JSON.stringify(name)}, { type: 'text/markdown' }));
          window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
        })()`);
        await waitFor(`document.querySelector('.file-name')?.textContent === ${JSON.stringify(name)}`);
        await pause(120);
      },
      async select(prefix, phrase) {
        await evaluate(`(() => {
          const p = [...document.querySelectorAll('article p')].find(p => p.textContent.startsWith(${JSON.stringify(prefix)}));
          if (!p) throw new Error('Missing selection paragraph');
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode()) && !node.textContent.includes(${JSON.stringify(phrase)})) {}
          if (!node) throw new Error('Missing selection phrase');
          const r = document.createRange();
          const start = node.textContent.indexOf(${JSON.stringify(phrase)});
          r.setStart(node, start); r.setEnd(node, start + ${phrase.length});
          const selection = window.getSelection();
          selection.removeAllRanges(); selection.addRange(r);
          p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        })()`);
      },
      async screenshot(name) {
        const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
        const path = join(dir, name + '.png');
        await writeFile(path, Buffer.from(data, 'base64'));
        return path;
      },
    };
  } catch (error) { await close(); throw error; }
}
