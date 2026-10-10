import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser } from './browser-harness.mjs';

const fixture = { name: 'Long-history.md', source: '# Study\n\n' + 'Owned synthetic study paragraph.\n\n'.repeat(32_000) };
const changes = 256;
const samples = 25;
const latencyReport = JSON.parse(await readFile(new URL('../specs/verifications/e01s03-reader-latency.json', import.meta.url), 'utf8'));
const historyBudgetMs = latencyReport.budgets.historyMs;
const distribution = values => {
  const sorted = [...values].sort((left, right) => left - right);
  return { p50Ms: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maxMs: sorted.at(-1) };
};
const browser = await launchBrowser();
try {
  const storage = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    const store = new BrowserDocumentStore();
    const original = ${JSON.stringify(fixture.source)};
    const binding = await store.open({ name: ${JSON.stringify(fixture.name)}, path: '', kind: 'markdown', source: original });
    const indexGetAll = IDBIndex.prototype.getAll;
    const objectGetAll = IDBObjectStore.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.objectStore.name === 'versions') throw new Error('History must not scan snapshot bodies');
      return indexGetAll.apply(this, args);
    };
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'versions') throw new Error('History must not scan snapshot bodies');
      return objectGetAll.apply(this, args);
    };
    let current = original;
    const saveMs = [], listMs = [];
    try {
      for (let revision = 1; revision <= ${changes}; revision++) {
        const source = original + '\\nRevision ' + revision + '\\n';
        const start = performance.now();
        await store.save(binding.id, { expected: current, source });
        saveMs.push(performance.now() - start);
        current = source;
      }
      let versions;
      for (let sample = 0; sample < ${samples}; sample++) {
        const start = performance.now();
        versions = await store.versions(binding.id);
        listMs.push(performance.now() - start);
      }
      const oldestExact = await store.read(binding.id, versions.at(-1).id) === original;
      const latestExact = await store.read(binding.id, versions[0].id) === current;
      const storedBytes = await new Promise((resolve, reject) => {
        const open = indexedDB.open('mark-documents');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('version-metadata');
          const request = tx.objectStore('version-metadata').index('document').getAll(binding.id);
          request.onsuccess = () => resolve(request.result.reduce((total, version) => total + version.storedBytes, 0));
          tx.oncomplete = () => db.close();
          tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });
      return { versions: versions.length, sourceBytes: new TextEncoder().encode(original).length, storedSnapshotBytes: storedBytes, oldestExact, latestExact, saveMs, listMs };
    } finally {
      IDBIndex.prototype.getAll = indexGetAll;
      IDBObjectStore.prototype.getAll = objectGetAll;
    }
  })()`);
  assert.equal(storage.versions, changes + 1);
  assert.equal(storage.oldestExact, true);
  assert.equal(storage.latestExact, true);

  await browser.drop(fixture.name, fixture.source);
  const uiMs = [];
  for (let sample = 0; sample < samples; sample++) {
    await browser.click('.file-menu-btn');
    await browser.evaluate(`(() => {
      window.__historyUiMs = null;
      let start;
      const observer = new MutationObserver(() => {
        if (document.querySelectorAll('.version-item').length !== ${changes + 1}) return;
        window.__historyUiMs = performance.now() - start;
        observer.disconnect();
      });
      observer.observe(document.querySelector('.version-list'), { childList: true });
      document.querySelector('.version-history-btn').addEventListener('click', () => { start = performance.now(); }, { capture: true, once: true });
    })()`);
    await browser.click('.version-history-btn');
    await browser.waitFor('window.__historyUiMs !== null');
    uiMs.push(await browser.evaluate('window.__historyUiMs'));
    await browser.click('.version-close');
  }
  assert.equal(browser.exceptions.length, 0);
  const result = {
    type: 'performance_evidence',
    context: 'e01s03 actual Chrome IndexedDB and full reader history dialog; 256 generated edits, no retention-policy change',
    measuredAt: new Date().toISOString(), node: process.version, samples,
    historyBudgetMs, budgetSource: 'specs/verifications/e01s03-reader-latency.json',
    versions: storage.versions, sourceBytes: storage.sourceBytes, storedSnapshotBytes: storage.storedSnapshotBytes,
    oldestExact: storage.oldestExact, latestExact: storage.latestExact,
    save: distribution(storage.saveMs), metadataList: distribution(storage.listMs), readerHistoryDialog: distribution(uiMs),
    limits: [
      'Owned synthetic roughly 1-MiB book, not private real-book fixtures.',
      '257 same-day versions do not model thirty days or five-second continuous edits.',
      'Measured dialog DOM readiness excludes raster and physical display latency.',
      'Compressed snapshot bytes exclude working source, metadata and database overhead; this is not a total storage budget.',
      'Chrome/Vite evidence does not prove packaged native startup or native history latency.',
    ],
  };
  result.passed = result.metadataList.p95Ms < historyBudgetMs && result.readerHistoryDialog.p95Ms < historyBudgetMs;
  await writeFile(new URL('../specs/verifications/e01s03-long-history.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(browser.dir, 'long-history-results.json'), JSON.stringify({ ...result, saveMs: storage.saveMs, listMs: storage.listMs, uiMs }, null, 2));
  console.log(JSON.stringify({ ...result, artifacts: browser.dir }, null, 2));
  assert.equal(result.passed, true, 'Long-history latency uses the existing reader history budget');
} catch (error) {
  await writeFile(join(browser.dir, 'long-history-failure.json'), JSON.stringify({ error: String(error), exceptions: browser.exceptions }, null, 2));
  throw error;
} finally { await browser.close(); }
