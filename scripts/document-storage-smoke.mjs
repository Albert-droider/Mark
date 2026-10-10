import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser } from './browser-harness.mjs';
import { verifyDocumentBudget } from './document-budget-checks.mjs';

const browser = await launchBrowser();
const checks = [];
try {
  const result = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    const store = new BrowserDocumentStore();
    const original = '学习 and hé.\\r\\n'.repeat(20_000);
    const file = { name: 'Compressed-study.md', path: '', kind: 'markdown', source: original };
    const binding = await store.open(file);
    const edited = original + '- [x] Read\\r\\n';
    await store.save(binding.id, { expected: original, source: edited });
    const versions = await store.versions(binding.id);
    const restored = await store.read(binding.id, versions[0].id);
    const record = await new Promise((resolve, reject) => {
      const open = indexedDB.open('mark-documents');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('versions');
        const request = tx.objectStore('versions').get(binding.id + ':' + versions[0].id);
        request.onsuccess = () => resolve({ codec: request.result.codec, bytes: request.result.bytes, storedBytes: request.result.payload?.length, databaseVersion: db.version });
        tx.oncomplete = () => db.close();
      };
    });
    return { ...record, exact: restored === edited, versions: versions.length, originalExact: await store.read(binding.id, versions[1].id) === original };
  })()`);
  assert.equal(result.codec, 'gzip', 'New browser versions must be compressed');
  checks.push('new version is compressed');
  assert.ok(result.storedBytes < result.bytes / 10);
  checks.push('compression reduces the stored source bytes');
  assert.equal(result.exact, true);
  checks.push('read restores exact Markdown and Unicode');
  assert.equal(result.originalExact, true);
  checks.push('original version is still available');
  assert.equal(result.databaseVersion, 2);
  checks.push('metadata schema is active');
  const safety = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    const first = new BrowserDocumentStore(), second = new BrowserDocumentStore();
    const file = { name: 'Concurrent.md', path: '', kind: 'markdown', source: 'Original' };
    const binding = await first.open(file);
    const getAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.objectStore.name === 'versions') throw new Error('Full snapshot-body scan is forbidden');
      return getAll.apply(this, args);
    };
    let conflict = '', quota = '';
    try {
      await first.save(binding.id, { expected: 'Original', source: 'First writer' });
      await first.versions(binding.id);
      try { await second.save(binding.id, { expected: 'Original', source: 'Second writer' }); }
      catch (error) { conflict = error.message; }
    } finally { IDBIndex.prototype.getAll = getAll; }
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'versions') throw new DOMException('Full', 'QuotaExceededError');
      return add.apply(this, args);
    };
    try { await first.save(binding.id, { expected: 'First writer', source: 'Rejected writer' }); }
    catch (error) { quota = error.name; }
    finally { IDBObjectStore.prototype.add = add; }
    const reopened = await first.open(file);
    const history = await first.versions(binding.id);
    return { conflict, quota, source: reopened.source, versions: history.length };
  })()`);
  assert.match(safety.conflict, /another MARK tab/);
  checks.push('a stale writer cannot overwrite the acknowledged source');
  assert.equal(safety.quota, 'QuotaExceededError');
  assert.equal(safety.source, 'First writer');
  assert.equal(safety.versions, 2);
  checks.push('failed version writes roll back the source and metadata');
  checks.push('save and list never scan full snapshot bodies');

  const corruption = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    const store = new BrowserDocumentStore();
    const file = { name: 'Corrupt-storage.md', path: '', kind: 'markdown', source: 'Keep this source' };
    const binding = await store.open(file);
    const version = (await store.versions(binding.id))[0];
    const key = binding.id + ':' + version.id;
    const transaction = (names, mode, work) => new Promise((resolve, reject) => {
      const open = indexedDB.open('mark-documents');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(names, mode);
        let result;
        work(tx, value => { result = value; });
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    const get = (name, recordKey) => transaction(name, 'readonly', (tx, done) => {
      const request = tx.objectStore(name).get(recordKey);
      request.onsuccess = () => done(request.result);
    });
    const put = (name, value) => transaction(name, 'readwrite', tx => tx.objectStore(name).put(value));
    const failure = async operation => {
      try { await operation(); return ''; } catch (error) { return error.message; }
    };
    const metadata = await get('version-metadata', key);
    const snapshot = await get('versions', key);
    const document = await get('documents', binding.id);
    await transaction('version-metadata', 'readwrite', tx => tx.objectStore('version-metadata').delete(key));
    const missingList = await failure(() => store.versions(binding.id));
    const missingSave = await failure(() => store.save(binding.id, { expected: file.source, source: 'Rejected missing metadata' }));
    await put('version-metadata', { ...metadata, storedBytes: -1 });
    const corruptList = await failure(() => store.versions(binding.id));
    const corruptSave = await failure(() => store.save(binding.id, { expected: file.source, source: 'Rejected corrupt metadata' }));
    await put('version-metadata', metadata);
    await put('versions', { ...snapshot, codec: 'utf8', payload: new Uint8Array([255]), bytes: 1 });
    const corruptPayload = await failure(() => store.read(binding.id, version.id));
    await put('versions', snapshot);
    await put('documents', { ...document, source: 17 });
    const corruptDocument = await failure(() => store.open(file));
    const documentUnchanged = (await get('documents', binding.id)).source === 17;
    await put('documents', document);
    return {
      missingList, missingSave, corruptList, corruptSave, corruptPayload, corruptDocument, documentUnchanged,
      source: (await store.open(file)).source,
      originalVersion: await store.read(binding.id, version.id), versions: (await store.versions(binding.id)).length,
    };
  })()`);
  assert.match(corruption.missingList, /metadata is incomplete/);
  assert.match(corruption.missingSave, /metadata is incomplete/);
  checks.push('missing metadata blocks both listing and saving without acknowledgement');
  assert.match(corruption.corruptList, /metadata is corrupt/);
  assert.match(corruption.corruptSave, /metadata is corrupt/);
  checks.push('corrupt metadata blocks both listing and saving');
  assert.ok(corruption.corruptPayload);
  checks.push('invalid UTF-8 snapshot data fails rather than returning replacement characters');
  assert.match(corruption.corruptDocument, /Existing data was not replaced/);
  assert.equal(corruption.documentUnchanged, true);
  checks.push('an unsupported working record is not silently replaced');
  assert.equal(corruption.source, 'Keep this source');
  assert.equal(corruption.originalVersion, corruption.source);
  assert.equal(corruption.versions, 1);
  checks.push('rejected corrupt-storage writes preserve source and version count');

  const budget = await verifyDocumentBudget(browser);
  checks.push(...budget.checks);

  const migration = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    const original = 'Legacy UTF-8 学习\\r\\n';
    const file = { name: 'Legacy.md', path: '', kind: 'markdown', source: original };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + '\\0' + original));
    const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const legacy = { key: id + ':10', document: id, id: '10', createdAt: 10, bytes: new TextEncoder().encode(original).length, source: original };
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('mark-documents');
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('mark-documents', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('documents', { keyPath: 'id' });
        open.result.createObjectStore('versions', { keyPath: 'key' }).createIndex('document', 'document');
      };
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['documents', 'versions'], 'readwrite');
        tx.objectStore('documents').add({ format: 'mark-document', version: 1, id, source: original, stamp: 10 });
        tx.objectStore('versions').add(legacy);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    const store = new BrowserDocumentStore();
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('mark-documents', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('versions', 'readwrite');
        tx.objectStore('versions').put({ ...legacy, bytes: -1 });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    let rejectedMigration = '';
    try { await store.open(file); } catch (error) { rejectedMigration = error.message; }
    const afterAbort = await new Promise((resolve, reject) => {
      const open = indexedDB.open('mark-documents');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('versions', 'readwrite');
        const request = tx.objectStore('versions').get(legacy.key);
        request.onsuccess = () => {
          const result = { databaseVersion: db.version, corruptBytes: request.result.bytes, source: request.result.source };
          tx.objectStore('versions').put(legacy);
          tx.oncomplete = () => { db.close(); resolve(result); };
        };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    const binding = await store.open(file);
    const recovered = await store.read(id, '10');
    const unchanged = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mark-documents');
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('versions');
        const get = tx.objectStore('versions').get(legacy.key);
        get.onsuccess = () => resolve(JSON.stringify(get.result) === JSON.stringify(legacy));
        tx.oncomplete = () => db.close();
      };
      request.onerror = () => reject(request.error);
    });
    await store.save(id, { expected: original, source: original + 'new' });
    return { source: binding.source, recovered, unchanged, current: (await store.open(file)).source, rejectedMigration, afterAbort };
  })()`);
  assert.match(migration.rejectedMigration, /Migration was cancelled/);
  assert.equal(migration.afterAbort.databaseVersion, 1);
  assert.equal(migration.afterAbort.corruptBytes, -1);
  assert.equal(migration.afterAbort.source, 'Legacy UTF-8 学习\r\n');
  checks.push('a corrupt legacy migration aborts the schema upgrade without rewriting its snapshot');
  assert.equal(migration.source, 'Legacy UTF-8 学习\r\n');
  assert.equal(migration.recovered, migration.source);
  assert.equal(migration.unchanged, true);
  assert.equal(migration.current, migration.source + 'new');
  checks.push('schema upgrade reads legacy sources without rewriting their snapshots');
  assert.equal(browser.exceptions.length, 0);
  const report = {
    type: 'storage_verification', context: 'e01s04 actual Chrome IndexedDB; approved budget and unchanged retention',
    measuredAt: new Date().toISOString(), node: process.version, checks, result, safety, corruption, budget, migration,
  };
  await writeFile(join(browser.dir, 'storage-results.json'), JSON.stringify(report, null, 2));
  await writeFile(new URL('../specs/verifications/e01s03-browser-storage.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks, result, artifacts: browser.dir }, null, 2));
} catch (error) {
  await writeFile(join(browser.dir, 'storage-failure.json'), JSON.stringify({ checks, error: String(error), exceptions: browser.exceptions }, null, 2));
  throw error;
} finally { await browser.close(); }
