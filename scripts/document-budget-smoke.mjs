import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchBrowser, pause } from './browser-harness.mjs';

const browser = await launchBrowser();
const checks = [];
try {
  await browser.evaluate(`(async () => {
    const { updateSettings } = await import('/src/store.ts');
    updateSettings({ documentBudgetMiB: 64 });
    const bytes = new Uint8Array(16 * 1024 * 1024 - 256);
    for (let offset = 0; offset < bytes.length; offset += 65536) {
      crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, bytes.length)));
    }
    const alphabet = new TextEncoder().encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
    for (let i = 0; i < bytes.length; i++) bytes[i] = alphabet[bytes[i] & 63];
    const source = '# Budget safety\\n\\n- [ ] Keep this checkpoint\\n\\n<!--' + new TextDecoder().decode(bytes) + '-->\\n';
    window.__budgetFixture = { name: 'Budget-safety.md', path: '', kind: 'markdown', source };
    const data = new DataTransfer();
    data.items.add(new File([source], 'Budget-safety.md', { type: 'text/markdown' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  })()`);
  await browser.waitFor(`document.querySelector('.file-name')?.textContent === 'Budget-safety.md' && document.querySelector('.file-meta')?.dataset.documentState === 'saved'`);
  await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    window.__budgetStore = new BrowserDocumentStore(() => 64 * 1024 * 1024);
    window.__budgetBinding = await window.__budgetStore.open(window.__budgetFixture);
  })()`);
  assert.equal(await browser.evaluate(`window.__budgetBinding.storage.limitBytes`), 64 * 1024 * 1024);
  checks.push('the actual reader uses the configured byte limit');

  await browser.click('article input[type="checkbox"]');
  await browser.waitFor(`(async () => document.querySelector('.file-meta')?.dataset.documentState === 'saved' && (await window.__budgetStore.versions(window.__budgetBinding.id)).length === 2)()`);
  await browser.click('article input[type="checkbox"]');
  await browser.waitFor(`document.querySelector('.file-meta')?.dataset.documentState === 'saved' && document.querySelector('.file-meta').textContent.includes('Storage ')`);
  const warning = await browser.evaluate(`(async () => {
    const opened = await window.__budgetStore.open(window.__budgetFixture);
    const versions = await window.__budgetStore.versions(opened.id);
    window.__budgetBeforeRefusal = versions;
    window.__budgetSavedSource = opened.source;
    const toast = document.querySelector('.toast');
    return { storage: opened.storage, versions: versions.length, label: document.querySelector('.file-meta').textContent,
      message: document.querySelector('.file-meta').title, notice: toast.textContent, visible: !toast.hidden,
      originalExact: await window.__budgetStore.read(opened.id, versions[versions.length - 1].id) === window.__budgetFixture.source };
  })()`);
  assert.equal(warning.storage.warning, true);
  assert.ok(warning.storage.usedBytes <= warning.storage.limitBytes);
  assert.match(warning.label, /Saved locally.*Storage \d+%/);
  assert.match(warning.notice, /Document storage is \d+% full/);
  assert.equal(warning.visible, true);
  assert.equal(warning.originalExact, true);
  assert.equal(warning.versions, 3);
  checks.push('a visible warning precedes the limit while both protected versions remain intact');

  await browser.click('article input[type="checkbox"]');
  await browser.waitFor(`document.querySelector('.file-meta')?.dataset.documentState === 'error'`);
  const refusal = await browser.evaluate(`(async () => {
    const opened = await window.__budgetStore.open(window.__budgetFixture);
    const versions = await window.__budgetStore.versions(opened.id);
    return { label: document.querySelector('.file-meta').textContent, message: document.querySelector('.file-meta').title,
      pendingChecked: document.querySelector('article input[type="checkbox"]').checked,
      sourceUnchanged: opened.source === window.__budgetSavedSource,
      historyUnchanged: JSON.stringify(versions) === JSON.stringify(window.__budgetBeforeRefusal),
      originalsExact: await window.__budgetStore.read(opened.id, versions[versions.length - 1].id) === window.__budgetFixture.source,
      latestExact: await window.__budgetStore.read(opened.id, versions[0].id) === window.__budgetSavedSource };
  })()`);
  assert.match(refusal.label, /Not saved/);
  assert.match(refusal.message, /storage budget exceeded/);
  for (const key of ['pendingChecked', 'sourceUnchanged', 'historyUnchanged', 'originalsExact', 'latestExact']) assert.equal(refusal[key], true, key);
  checks.push('an over-budget autosave retains the pending reader edit, acknowledged source, original and latest snapshots');

  const destination = join(browser.dir, 'budget-export');
  await mkdir(destination);
  await browser.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destination });
  await browser.click('.file-menu-btn'); await browser.click('.export-document-btn');
  let exported;
  for (let n = 0; n < 80; n++) {
    const filename = (await readdir(destination)).find(name => name.endsWith('.md'));
    if (filename) { exported = await readFile(join(destination, filename), 'utf8'); break; }
    await pause(75);
  }
  assert.ok(exported, 'An actual Markdown download must be produced');
  assert.ok(exported.includes('- [x] Keep this checkpoint'));
  const expectedHash = await browser.evaluate(`(async () => {
    const source = window.__budgetFixture.source.replace('- [ ] Keep this checkpoint', '- [x] Keep this checkpoint');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
    return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
  })()`);
  assert.equal(createHash('sha256').update(exported).digest('hex'), expectedHash);
  checks.push('an actual new-file Markdown export preserves every byte of the unsaved source after refusal');

  await browser.evaluate(`(async () => { const { updateSettings } = await import('/src/store.ts'); updateSettings({ documentBudgetMiB: 128 }); })()`);
  await browser.waitFor(`document.querySelector('.file-meta')?.dataset.documentState === 'saved'`);
  const retry = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    const store = new BrowserDocumentStore(() => 128 * 1024 * 1024);
    const opened = await store.open(window.__budgetFixture);
    return { exact: opened.source === window.__budgetFixture.source.replace('- [ ] Keep this checkpoint', '- [x] Keep this checkpoint'), versions: (await store.versions(opened.id)).length,
      storage: opened.storage, label: document.querySelector('.file-meta').textContent };
  })()`);
  assert.equal(retry.exact, true); assert.equal(retry.versions, 4);
  assert.equal(retry.storage.limitBytes, 128 * 1024 * 1024);
  assert.equal(retry.storage.warning, false); assert.doesNotMatch(retry.label, /Not saved|Storage \d+%/);
  checks.push('raising the limit lets the five-second retry acknowledge the exact source without deleting history');
  assert.deepEqual(browser.exceptions, []);
  const report = { type: 'browser_evidence', context: 'e01s04 owner-approved budget: warning, refusal, pending export and retry in the actual reader',
    generatedAt: new Date().toISOString(), runtime: { node: process.version }, passed: true, checks, warning, refusal, retry,
    limits: ['Owned Chromium profile with a synthetic near-16-MiB document; not packaged native acceptance.',
      'Counts managed source, snapshot and metadata data, not database/filesystem allocation or temporary export overhead.'] };
  await writeFile(join(browser.dir, 'budget-results.json'), JSON.stringify(report, null, 2));
  await writeFile(new URL('../specs/verifications/e01s04-document-budget.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ dir: browser.dir, checks: checks.length, usedBytesAtWarning: warning.storage.usedBytes, limitBytes: warning.storage.limitBytes, warning: warning.label, retryVersions: retry.versions }, null, 2));
} catch (error) {
  const diagnostic = await browser.evaluate(`(async () => ({
    state: document.querySelector('.file-meta')?.dataset.documentState,
    label: document.querySelector('.file-meta')?.textContent, message: document.querySelector('.file-meta')?.title,
    usage: window.__budgetStore ? (await window.__budgetStore.open(window.__budgetFixture)).storage : null,
    versions: window.__budgetStore ? (await window.__budgetStore.versions(window.__budgetBinding.id)).length : null
  }))()`);
  console.error(JSON.stringify({ dir: browser.dir, diagnostic }, null, 2));
  throw error;
} finally { await browser.close(); }
