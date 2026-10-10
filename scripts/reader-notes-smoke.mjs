import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser, pause } from './browser-harness.mjs';

const browser = await launchBrowser();
const checks = [];
const source = '# Study\n\nSame passage.\n\nSame passage.\n\nAfter.\n\n' + Array.from({ length: 25 }, (_, i) => `Paragraph ${i + 1}: quiet reading without interruptions.\n\n`).join('');
const fixture = { name: 'Study.md', path: '', kind: 'markdown', source };
const check = async (name, expression) => { assert.ok(await browser.evaluate(expression), name); checks.push(name); };
const geometry = () => browser.evaluate(() => {
  const article = document.querySelector('article');
  return { width: article.scrollWidth, height: article.scrollHeight,
    paragraphs: [...article.querySelectorAll('p')].map(p => { const r = p.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }) };
});
const selectSecond = () => browser.evaluate(() => {
  const paragraph = [...document.querySelectorAll('article > p')][1];
  const range = document.createRange(); range.selectNodeContents(paragraph);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
const key = async key => {
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
};
const hover = async () => {
  const point = await browser.evaluate(() => { const r = document.querySelector('.reader-note-mark').getBoundingClientRect(); return { x: r.left+r.width/2, y: r.top+r.height/2 }; });
  await browser.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await browser.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await browser.waitFor('!document.querySelector(".reader-note-tip").hidden');
};
try {
  await browser.drop(fixture.name, source);
  await browser.evaluate(`(async () => { const { BrowserDocumentStore } = await import('/src/browser-documents.ts'); window.__notesStore = new BrowserDocumentStore(); })()`);
  const before = await geometry();
  await selectSecond(); await browser.click('.sel-note-btn');
  await check('Selection opens only a floating note control, never a block or separate editor', `!document.querySelector('article .reader-note,article textarea') && document.querySelector('.note-editor').hidden && document.activeElement.matches('.reader-note-input')`);
  await check('Only the second identical paragraph is underlined', `!document.querySelectorAll('article > p')[0].querySelector('.reader-note-mark') && !!document.querySelectorAll('article > p')[1].querySelector('.reader-note-mark')`);
  assert.deepEqual(await geometry(), before); checks.push('Adding a note changes every paragraph position and article dimension by exactly 0px');
  await browser.cdp('Input.insertText', { text: 'My own explanation\n<script>not executable</script>' });
  await key('Escape');
  await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved'`);
  const stored = await browser.evaluate(`window.__notesStore.open(${JSON.stringify(fixture)})`);
  assert.ok(stored.source.startsWith(source)); assert.ok(stored.source.includes('> My own explanation'));
  checks.push('Five-second save acknowledges note bytes in the same working Markdown, with original prose unchanged');
  await hover();
  await check('Real mouse hover shows the note safely, outside the reading article', `document.querySelector('.reader-note-tip').textContent.includes('<script>not executable</script>') && !document.querySelector('.reader-note-tip script') && !document.querySelector('article').contains(document.querySelector('.reader-note-tip'))`);
  assert.deepEqual(await geometry(), before); checks.push('Hover changes reading geometry by exactly 0px');
  const snapshot = await browser.screenshot('subtle-note-hover');
  await browser.reload(); await browser.drop(fixture.name, source);
  await check('Reopen restores the single underline, not an inline note block', `document.querySelectorAll('.reader-note-mark').length === 1 && !document.querySelector('article .reader-note,article textarea')`);
  await browser.click('.reader-note-mark');
  await check('Click edits the stored note in the floating reader control', `document.activeElement.matches('.reader-note-input') && document.querySelector('.reader-note-input').value.includes('My own explanation') && document.querySelector('.note-editor').hidden`);
  await key('Escape');

  await browser.click('.view-menu-btn'); await browser.click('[data-layout="book"]'); await pause(200);
  const bookBefore = await geometry(), folio = await browser.evaluate(() => document.querySelector('.folio')?.textContent);
  await hover();
  assert.deepEqual(await geometry(), bookBefore); assert.equal(await browser.evaluate(() => document.querySelector('.folio')?.textContent), folio);
  checks.push('Book-mode hover does not add columns, move lines or change pagination');
  await browser.click('.reader-note-mark'); await key('Escape');
  assert.deepEqual(await geometry(), bookBefore); checks.push('Book-mode editing control never enters the columns');

  const destination = join(browser.dir, 'downloads'); await mkdir(destination);
  await browser.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destination });
  await browser.click('.file-menu-btn'); await browser.click('.export-document-btn');
  let exported;
  for (let n = 0; n < 80; n++) { const file = (await readdir(destination)).find(name => name.endsWith('.md')); if (file) { exported = await readFile(join(destination, file), 'utf8'); break; } await pause(75); }
  assert.ok(exported?.includes('> My own explanation')); assert.ok(exported?.startsWith(source));
  checks.push('Actual Markdown download contains note and unchanged source, not a hidden side-store');

  await browser.click('.view-menu-btn'); await browser.click('[data-layout="scroll"]');
  await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 460, height: 340, deviceScaleFactor: 1, mobile: false }); await pause(100);
  await browser.evaluate(() => document.querySelector('.reader-note-mark').scrollIntoView({ block: 'center' }));
  await browser.click('.reader-note-mark');
  await check('Floating input fits the minimum desktop viewport', `(() => { const r = document.querySelector('.reader-note-popup').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`);
  const compact = await browser.screenshot('subtle-note-compact'); await key('Escape');
  await browser.click('.notes-btn');
  await check('File note remains discoverable without interrupting the prose', `!document.querySelector('.annotation-recovery').hidden && document.querySelector('[data-file-note]')?.textContent.includes('My own explanation')`);
  assert.equal(browser.exceptions.length, 0); checks.push('No unhandled browser exception');
  const path = join(browser.dir, 'results.json');
  await writeFile(path, JSON.stringify({ checks, screenshot: snapshot, compact, exceptions: browser.exceptions }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, path, snapshot, compact }, null, 2));
} catch (error) {
  const screenshot = await browser.screenshot('notes-failure');
  await writeFile(join(browser.dir, 'failure.json'), JSON.stringify({ checks, error: String(error), exceptions: browser.exceptions, screenshot }, null, 2));
  throw error;
} finally { await browser.close(); }
