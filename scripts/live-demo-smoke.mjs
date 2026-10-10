import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser, pause } from './browser-harness.mjs';

const browser = await launchBrowser();
const checks = [];
const source = await readFile(new URL('../SAMPLE.md', import.meta.url), 'utf8');
const fixture = { name: 'SAMPLE.md', path: '', kind: 'markdown', source };
const check = async (name, expression) => { assert.ok(await browser.evaluate(expression), name); checks.push(name); };
const click = async selector => {
  await browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center', inline: 'nearest' })`);
  await browser.click(selector);
};
const key = async (key, code, windowsVirtualKeyCode) => {
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
};
const type = async (selector, text) => {
  await click(selector);
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await browser.cdp('Input.insertText', { text });
};
const binding = () => browser.evaluate(`window.__markSmokeStore.open(${JSON.stringify(fixture)})`);
const stored = async () => (await binding()).source;
const history = async () => browser.evaluate(`window.__markSmokeStore.versions(${JSON.stringify((await binding()).id)})`);
let exportSequence = 0;
async function download(trigger, action, extension) {
  // CDP's allow mode can overwrite an earlier same-name download. Isolate every request.
  const destination = join(browser.dir, `download-${++exportSequence}`);
  await mkdir(destination);
  await browser.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destination });
  await click(trigger); await click(action);
  for (let n = 0; n < 80; n++) {
    const fresh = (await readdir(destination)).find(name => name.endsWith(extension));
    if (fresh) return readFile(join(destination, fresh), 'utf8');
    await pause(75);
  }
  throw new Error(`No actual ${extension} download produced`);
}

try {
  await browser.drop(fixture.name, source);
  await browser.evaluate(`(async () => { const { BrowserDocumentStore } = await import('/src/browser-documents.ts'); window.__markSmokeStore = new BrowserDocumentStore(); })()`);
  await browser.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: browser.dir });
  await check('Primary reader owns enabled checkpoints without a live-copy route', `Array.from(document.querySelectorAll('article input[type=checkbox]')).every(input => !input.disabled) && !document.querySelector('.live-copy-btn,.edit-copy-btn') && document.querySelector('.note-editor').hidden`);
  assert.equal(await stored(), source); checks.push('Initial working document is acknowledged in real IndexedDB');
  assert.equal((await history()).length, 1); checks.push('Opening captures one initial version');
  const pendingSelector = () => browser.evaluate(() => { const input = [...document.querySelectorAll('article input[data-mark-task]')].find(input => input.parentElement.textContent.trim() === 'Pending task'); return `article input[data-mark-task="${input.dataset.markTask}"]`; });
  let pending = await pendingSelector();
  await click(pending);
  const toggled = source.replace('- [ ] Pending task', '- [x] Pending task');
  await check('Reader task click retains keyboard focus and shows pending changes', `document.activeElement?.matches('input[type=checkbox]') && document.querySelector('.file-meta').dataset.documentState === 'pending'`);
  assert.equal(await stored(), source); checks.push('No per-keystroke or task-click write is claimed as saved');
  await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved'`);
  assert.equal(await stored(), toggled); checks.push('Five-second autosave writes the checked Markdown');
  assert.equal((await history()).length, 2); checks.push('Changed source adds a version');
  await pause(5200);
  assert.equal((await history()).length, 2); checks.push('Idle save intervals do not add duplicate snapshots');

  const cell = 'article .table-block tbody tr:first-child td:first-child';
  await click(cell);
  const point = await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(cell)}).getBoundingClientRect(); return { x: r.left+r.width/2, y:r.top+r.height/2 }; })()`);
  await browser.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 2, ...point });
  await browser.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 2, ...point });
  await check('Double-click edits the actual cell, without a form or second table', `document.querySelector(${JSON.stringify(cell)}).isContentEditable && document.querySelectorAll('article table').length === 1 && !document.querySelector('article textarea,.live-table-editor') && document.querySelector('.note-editor').hidden`);
  await type(cell, 'Joint attention | shared'); await key('Enter', 'Enter', 13);
  await check('Typing stays in the same table and Enter finishes editing', `document.querySelector(${JSON.stringify(cell)}).textContent === 'Joint attention | shared' && !document.querySelector(${JSON.stringify(cell)}).isContentEditable`);
  await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved'`);
  const edited = await stored();
  assert.ok(edited.includes('Joint attention \\| shared')); checks.push('Cell text is persisted as escaped Markdown');
  assert.equal(edited.slice(0, edited.indexOf('| Feature')), toggled.slice(0, toggled.indexOf('| Feature')));
  assert.equal(edited.slice(edited.indexOf('## Math')), toggled.slice(toggled.indexOf('## Math')));
  checks.push('In-place table editing leaves unrelated Markdown unchanged');
  await check('Code has one compact clipboard SVG exactly in the former Copy slot', `Array.from(document.querySelectorAll('article .code-block')).every(block => block.querySelectorAll('.share-trigger').length === 1 && !!block.querySelector('.code-bar .share-trigger svg') && !block.querySelector('.code-copy,:scope > .block-actions'))`);
  await check('Table clipboard is below the content', `document.querySelector('article .table-block').lastElementChild.classList.contains('block-actions')`);
  await browser.screenshot('in-place-reader');

  const md = await download('article .table-block .share-trigger', '.reader-share-actions:not([hidden]) .share-markdown', '.md');
  assert.ok(md.includes('Joint attention \\| shared')); checks.push('Real table Markdown download includes the current edit');
  const csv = await download('article .table-block .share-trigger', '.reader-share-actions:not([hidden]) .share-csv', '.csv');
  assert.ok(csv.includes('"Joint attention | shared"')); checks.push('Real CSV download includes current cell text');
  const context = JSON.parse(await download('article .table-block .share-trigger', '.reader-share-actions:not([hidden]) .share-context', '.json'));
  assert.equal(context.block.markdown, md); assert.equal(context.includesFullSource, false);
  assert.equal(context.source.sourceTextSha256, createHash('sha256').update(edited).digest('hex'));
  assert.ok(!JSON.stringify(context).includes('function greet')); checks.push('Agent context binds the edited block to the same current-source hash, excluding the book');
  assert.equal(await download('.file-menu-btn', '.export-document-btn', '.md'), edited);
  checks.push('Whole-document export contains current task and cell changes');
  await browser.reload(); await browser.drop(fixture.name, source);
  await browser.evaluate(`(async () => { const { BrowserDocumentStore } = await import('/src/browser-documents.ts'); window.__markSmokeStore = new BrowserDocumentStore(); })()`);
  pending = await pendingSelector();
  await check('A fresh app recovers checked and cell-edited working Markdown from the original upload identity', `document.querySelector('article .table-block').textContent.includes('Joint attention') && document.querySelector(${JSON.stringify(pending)}).checked && document.querySelector('.note-editor').hidden`);
  assert.equal(await stored(), edited);

  await click('.file-menu-btn'); await click('.version-history-btn');
  await browser.waitFor(`document.querySelectorAll('.version-item').length >= 3`);
  await click('.version-item:last-child'); await browser.waitFor(`!document.querySelector('.version-restore').disabled`);
  await check('History previews the original Markdown without changing the reader', `document.querySelector('.version-preview').readOnly && document.querySelector('.version-preview').value === ${JSON.stringify(source.replace(/\r\n?/g, '\n'))} && document.querySelector('article table').textContent.includes('Joint attention')`);
  await browser.evaluate(() => { window.__restoreAsked = false; window.confirm = () => { window.__restoreAsked = true; return false; }; });
  await click('.version-restore'); assert.equal(await stored(), edited);
  checks.push('Cancelled restore keeps the current document');
  await browser.evaluate(() => { window.confirm = () => { window.__restoreAsked = true; return true; }; });
  await click('.version-restore'); await browser.waitFor(`document.querySelector('.document-history').hidden`);
  assert.equal(await stored(), source); checks.push('Confirmed restore becomes a new saved version, not a history deletion');
  assert.equal((await history()).length, 4); checks.push('Restore retains original, checked and cell-edited versions');

  await check('The normal reader has no raw-editor or standalone-note creation command', `!document.querySelector('.edit-markdown-btn,.new-note-btn') && document.querySelector('.note-editor').hidden`);

  await browser.evaluate(`(async () => { const { BrowserDocumentStore } = await import('/src/browser-documents.ts'); window.__originalSave = BrowserDocumentStore.prototype.save; BrowserDocumentStore.prototype.save = async () => { throw new DOMException('Test storage full', 'QuotaExceededError'); }; })()`);
  pending = await pendingSelector();
  await click(pending); await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'error'`);
  await check('Failed writes are visible and the changed task remains on screen', `document.querySelector('.file-meta').textContent.includes('Not saved') && document.querySelector('.file-meta').title.includes('QuotaExceededError') && document.querySelector(${JSON.stringify(pending)}).checked`);
  assert.equal(await stored(), source); checks.push('Failed autosave does not acknowledge or replace the persisted document');
  const pendingExport = await download('.file-menu-btn', '.export-document-btn', '.md');
  assert.equal(pendingExport, source.replace('- [ ] Pending task', '- [x] Pending task')); checks.push('Current Markdown can still be exported after a failed save');
  await browser.evaluate(() => { const data = new DataTransfer(); data.items.add(new File(['# Must not replace a dirty reader'], 'must-not-switch.md')); window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })); });
  await pause(250);
  await check('A failed save prevents file switching and retains unsaved source', `document.querySelector('.file-name').textContent === 'SAMPLE.md' && document.querySelector(${JSON.stringify(pending)}).checked`);
  await browser.evaluate(`(async () => { const { BrowserDocumentStore } = await import('/src/browser-documents.ts'); BrowserDocumentStore.prototype.save = window.__originalSave; })()`);
  await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved'`);
  assert.equal(await stored(), pendingExport); checks.push('Next interval retries the same document and acknowledges its exact source');

  await click('.view-menu-btn'); await click('[data-layout="book"]');
  const firstFolio = await browser.evaluate(() => document.querySelector('.folio').textContent);
  await click('[aria-label="Next pages"]'); await click('[aria-label="Next pages"]');
  assert.notEqual(await browser.evaluate(() => document.querySelector('.folio').textContent), firstFolio);
  checks.push('Book still turns pages with editable checkpoints and table content');
  await browser.screenshot('book-direct-reader');
  await click('.view-menu-btn'); await click('[data-layout="scroll"]');
  for (const [width, height] of [[1200, 820], [800, 600], [460, 340]]) {
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await browser.waitFor(`innerWidth === ${width} && innerHeight === ${height}`); await pause(150);
    await click('.file-menu-btn'); await click('.version-history-btn');
    await check(`Version history and close/restore controls fit ${width}×${height}`, `(() => { const panel = document.querySelector('.document-history').getBoundingClientRect(), close = document.querySelector('.version-close').getBoundingClientRect(); return panel.left >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight && close.bottom <= innerHeight; })()`);
    await click('.version-close');
    await check(`Reader chrome fits ${width}×${height} without an editor pane`, `document.querySelector('.chrome').scrollWidth <= innerWidth && document.querySelector('.note-editor').hidden`);
    await browser.screenshot(`direct-reader-${width}`);
  }
  assert.equal(await readFile(new URL('../SAMPLE.md', import.meta.url), 'utf8'), source); checks.push('Browser smoke never rewrites the public source file');
  assert.equal(browser.exceptions.length, 0); checks.push('No unhandled browser exceptions');
  await writeFile(join(browser.dir, 'results.json'), JSON.stringify({ checks, count: checks.length, exceptions: browser.exceptions }, null, 2));
  console.log(JSON.stringify({ dir: browser.dir, passed: checks.length, checks }, null, 2));
} catch (error) {
  await browser.screenshot('in-place-failure');
  await writeFile(join(browser.dir, 'failure.json'), JSON.stringify({ checks, error: String(error), exceptions: browser.exceptions }, null, 2));
  console.error('Evidence:', browser.dir, '\nPassed:', checks.length); throw error;
} finally { await browser.close(); }
