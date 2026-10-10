import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { launchBrowser } from './browser-harness.mjs';

const started = performance.now();
const browser = await launchBrowser();
const coldDevReadyMs = performance.now() - started;
const cases = [];
const budgets = { handlerP95Ms: 16, openMs: 5000, historyMs: 1000 };
const summary = samples => {
  const sorted = samples.toSorted((a, b) => a - b);
  return { p50Ms: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)] };
};
try {
  for (const mebibytes of [1, 5, 16]) {
    const header = '# Generated study book\n\n| Topic | State |\n| --- | --- |\n| Study | Pending |\n\n';
    const paragraph = 'Reading links a source to an idea. Study the argument, keep an example, and apply it to your own work. '.repeat(10) + '\n\n';
    const bytes = mebibytes * 1024 * 1024 - 64; // Reserve room for the measured edit below the source limit.
    const source = header + paragraph.repeat(Math.ceil((bytes - header.length) / paragraph.length)).slice(0, bytes - header.length);
    const name = `Latency-${mebibytes}.md`;
    const opening = performance.now();
    await browser.drop(name, source);
    await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved' && !!document.querySelector('article table')`);
    const openMs = performance.now() - opening;
    await browser.evaluate(`(() => {
      const cell = document.querySelector('article tbody td');
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      window.__readerLatency = [];
      let start = 0;
      cell.addEventListener('input', () => { start = performance.now(); }, true);
      window.addEventListener('input', event => {
        if (event.target === cell) window.__readerLatency.push(performance.now() - start);
      });
    })()`);
    for (let n = 0; n < 20; n++) await browser.cdp('Input.insertText', { text: String(n % 10) });
    const samples = await browser.evaluate('window.__readerLatency');
    assert.equal(samples.length, 20, 'Measure actual browser input events');
    await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved'`);
    const persisted = await browser.evaluate(`(async () => {
      const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
      const store = new BrowserDocumentStore();
      const binding = await store.open({ name: ${JSON.stringify(name)}, path: '', kind: 'markdown', source: ${JSON.stringify(source)} });
      const start = performance.now(); const history = await store.versions(binding.id);
      return { historyMs: performance.now() - start, versions: history.length, exactEdit: binding.source.split('\\n')[4].includes('01234567890123456789') };
    })()`);
    assert.equal(persisted.exactEdit, true, 'Typed source is acknowledged in real IndexedDB');
    const handlers = summary(samples);
    cases.push({ mebibytes, sourceBytes: bytes, openMs, handlers, ...persisted, passed: handlers.p95Ms < budgets.handlerP95Ms && openMs < budgets.openMs && persisted.historyMs < budgets.historyMs });
  }
  assert.equal(browser.exceptions.length, 0);
  const result = { type: 'performance_evidence', context: 'e01s03 actual Chrome full reader input, rendering and IndexedDB; generated paragraph books', measuredAt: new Date().toISOString(), node: process.version, coldDevReadyMs, budgets, cases, limits: ['Development Vite/browser cold readiness is not packaged native startup.', 'Handler latency excludes raster and physical display latency.', 'History has initial and edited versions, not a thirty-day corpus.', 'Generated books are not private real-book fixtures.'] };
  await writeFile(new URL('../specs/verifications/e01s03-reader-latency.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(browser.dir, 'latency-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, artifacts: browser.dir }, null, 2));
  assert.ok(cases.every(test => test.passed), 'Reader latency budgets');
} catch (error) {
  await writeFile(join(browser.dir, 'latency-failure.json'), JSON.stringify({ cases, error: String(error), exceptions: browser.exceptions }, null, 2));
  console.error(JSON.stringify({ error: String(error), cases, artifacts: browser.dir }, null, 2));
  throw error;
} finally { await browser.close(); }
