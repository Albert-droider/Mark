import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser, pause } from './browser-harness.mjs';

const browser = await launchBrowser();
const checks = [];
const check = async (name, expression) => { assert.ok(await browser.evaluate(expression), name); checks.push(name); };
const key = async () => {
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
};
let sequence = 0;
async function download(trigger, action, extension) {
  const destination = join(browser.dir, `download-${++sequence}`); await mkdir(destination);
  await browser.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destination });
  await browser.click(trigger); await browser.click(`.reader-share-actions:not([hidden]) ${action}`);
  for (let n = 0; n < 80; n++) {
    const fresh = (await readdir(destination)).find(name => name.endsWith(extension));
    if (fresh) return readFile(join(destination, fresh), 'utf8');
    await pause(75);
  }
  throw new Error(`No actual ${extension} download produced`);
}
try {
  const legacy = { id: 'legacy-anchor', group: 'legacy-group', color: 'pink', text: 'worth keeping', prefix: 'A passage ', suffix: '.', note: '    const answer = 42;\n\nMy own insight.\n' };
  await browser.evaluate(`(async () => {
    localStorage.setItem('mark.highlights.v1', JSON.stringify({ 'attention.md': [${JSON.stringify(legacy)}] }));
    const { DraftStore, newDraft } = await import('/src/drafts.ts');
    new DraftStore().save(newDraft('attention.md', 'legacy-group', [], 'A legacy draft that must not disappear.'));
    window.__legacyHighlights = localStorage.getItem('mark.highlights.v1'); window.__legacyDrafts = localStorage.getItem('mark.drafts.v1');
    window.__unexpectedDialogs = 0;
    window.confirm = () => { window.__unexpectedDialogs++; return false; };
  })()`);
  await browser.drop('attention.md', '# Attention\n\nA passage worth keeping.\n');
  await check('Existing passage annotation remains readable without an editor pane', `document.querySelector('article mark.hl.has-note')?.textContent === 'worth keeping' && document.querySelector('.note-editor').hidden`);
  await browser.click('article mark.hl.has-note');
  await check('Ordinary legacy mark has no misleading Attach action', `getComputedStyle(document.querySelector('.sel-relink')).display === 'none'`);
  await browser.click('.sel-note-btn');
  await check('Editing a legacy note uses the floating reader control', `document.activeElement.matches('.reader-note-input') && document.activeElement.value === ${JSON.stringify(legacy.note)} && document.querySelector('.note-editor').hidden`);
  await key(); await browser.waitFor(`document.querySelector('.file-meta').dataset.documentState === 'saved'`);
  await check('Conversion to file-owned notes preserves original legacy annotation and draft bytes', `localStorage.getItem('mark.highlights.v1') === window.__legacyHighlights && localStorage.getItem('mark.drafts.v1') === window.__legacyDrafts && !!document.querySelector('.reader-note-mark')`);
  await browser.click('.notes-btn');
  await check('File note and old draft remain discoverable in the recovery list', `document.querySelector('.annotation-recovery').textContent.includes('A legacy draft') && !!document.querySelector('[data-file-note]')`);
  await browser.click('[aria-label="Close recovery"]');

  await browser.evaluate(`localStorage.setItem('mark.highlights.v1', JSON.stringify({ 'orphan.md': [{ ...${JSON.stringify(legacy)}, text: 'Removed passage.', prefix: '', suffix: '' }] }))`);
  await browser.drop('orphan.md', '# Revised\n\nA replacement passage in a changed book.\n');
  await browser.click('.file-menu-btn'); await browser.click('.annotation-toggle');
  await check('File actions yield to recovery without replacing reader content', `document.querySelector('#file-actions').hidden && !document.querySelector('.annotation-recovery').hidden`);
  await browser.click('.recovery-item:not([data-draft-id]):not([data-file-note]) .recovery-actions button:last-child');
  await browser.select('A replacement', 'replacement passage');
  await check('Attach appears only during explicit orphan relinking', `!document.querySelector('.sel-relink').hidden`);
  await key(); await browser.select('A replacement', 'replacement passage');
  await check('Escape cancels Attach and preserves the orphan note', `document.querySelector('.sel-relink').hidden && JSON.parse(localStorage.getItem('mark.highlights.v1'))['orphan.md'][0].note === ${JSON.stringify(legacy.note)}`);
  await browser.click('.file-menu-btn'); await browser.click('.annotation-toggle');
  await browser.click('.recovery-item:not([data-draft-id]):not([data-file-note]) .recovery-actions button:last-child');
  await browser.select('A replacement', 'replacement passage'); await browser.click('.sel-relink');
  await check('Real Attach click preserves identity, color and exact note text', `document.querySelector('article mark.has-note')?.textContent === 'replacement passage' && (() => { const h = JSON.parse(localStorage.getItem('mark.highlights.v1'))['orphan.md'][0]; return h.group === 'legacy-group' && h.color === 'pink' && h.note === ${JSON.stringify(legacy.note)}; })()`);

  await browser.drop('SAMPLE.md', await readFile(new URL('../SAMPLE.md', import.meta.url), 'utf8'));
  await browser.waitFor('!!document.querySelector("article .artifact-mermaid svg")');
  await check('Reader still renders math, Mermaid, and both code blocks', `document.querySelectorAll('article .katex').length > 0 && document.querySelectorAll('article .code-block').length === 2`);
  await browser.click('.view-menu-btn'); await browser.click('[data-layout="book"]'); await pause(250);
  const folio = await browser.evaluate(() => document.querySelector('.folio').textContent);
  await browser.click('[aria-label="Next pages"]');
  assert.notEqual(await browser.evaluate(() => document.querySelector('.folio').textContent), folio); checks.push('Book layout still turns pages');
  await browser.click('.view-menu-btn'); await browser.click('[data-layout="scroll"]');

  const source = '# Shared evidence\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| formula | =1+1 |\r\n| answer | 42 |\r\n\r\n```ts\r\nconst answer = 42;\r\n```\r\n';
  await browser.drop('evidence.md', source);
  const markdown = await download('.table-block .share-trigger', '.share-markdown', '.md');
  assert.equal(markdown, source.split('\r\n').slice(2, 6).join('\r\n') + '\r\n'); checks.push('Table download preserves exact Markdown and CRLF');
  assert.ok((await download('.table-block .share-trigger', '.share-csv', '.csv')).includes("\"'=1+1\"")); checks.push('CSV neutralizes spreadsheet formulas');
  const context = JSON.parse(await download('.table-block .share-trigger', '.share-context', '.json'));
  assert.equal(context.format, 'mark-context'); assert.equal(context.source.name, 'evidence.md'); assert.equal(context.includesFullSource, false);
  assert.equal(context.source.startLine, 3); assert.equal(context.source.endLine, 6); assert.equal(context.block.markdown, markdown);
  assert.match(context.source.sourceTextSha256, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(context).includes('const answer'));
  checks.push('Agent context contains only the selected table and its provenance');
  assert.equal(await download('.code-block .share-trigger', '.share-markdown', '.md'), '```ts\r\nconst answer = 42;\r\n```\r\n'); checks.push('Code sharing retains its original fence');
  await browser.click('.view-menu-btn'); await browser.click('[data-layout="book"]'); await browser.click('.table-block .share-trigger');
  await check('Book sharing menu is outside columns and fits the viewport', `(() => { const menu = document.querySelector('.reader-share-actions:not([hidden])'); const r = menu.getBoundingClientRect(); return menu.parentElement === document.body && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`);
  await key(); await browser.click('.view-menu-btn'); await browser.click('[data-layout="scroll"]');
  await browser.evaluate(() => {
    const native = document.createElement('div'); native.className = 'window-controls';
    for (const label of ['Minimize', 'Maximize', 'Close']) { const button = document.createElement('button'); button.className = 'win-btn'; button.textContent = label[0]; button.setAttribute('aria-label', label); native.append(button); }
    document.querySelector('.chrome').append(native);
  });
  for (const [width, height] of [[1200, 820], [800, 600], [460, 340]]) {
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await check(`Header and native-control footprint fit ${width}×${height}`, `document.querySelector('.chrome').scrollWidth <= innerWidth && document.querySelector('.window-controls button:last-child').getBoundingClientRect().right <= innerWidth`);
    await browser.screenshot(`reader-${width}`);
  }
  await check('Normal reading exposes neither raw editor nor standalone document creation', `!document.querySelector('.edit-markdown-btn,.new-note-btn') && document.querySelector('.note-editor').hidden`);
  assert.equal(await browser.evaluate(() => window.__unexpectedDialogs), 0);
  assert.equal(browser.exceptions.length, 0); checks.push('No unexpected dialog or unhandled browser exception');
  const path = join(browser.dir, 'results.json'); await writeFile(path, JSON.stringify({ checks, passed: true, exceptions: browser.exceptions }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, path }, null, 2));
} catch (error) {
  const screenshot = await browser.screenshot('reader-failure');
  await writeFile(join(browser.dir, 'failure.json'), JSON.stringify({ checks, error: String(error), exceptions: browser.exceptions, screenshot }, null, 2)); throw error;
} finally { await browser.close(); }
