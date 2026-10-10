import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser } from './browser-harness.mjs';

const browser = await launchBrowser();
const checks = [];
const check = async (name, expression) => { assert.ok(await browser.evaluate(expression), name); checks.push(name); };
const resize = (width, height) => browser.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
const input = async text => browser.evaluate(`(() => { const input = document.querySelector('.note-input'); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const downloads = async () => (await readdir(browser.dir)).filter(name => /\.(md|csv|json)$/.test(name) && name !== 'results.json');
async function download(trigger, action, extension) {
  const before = await downloads();
  await browser.click(trigger);
  await browser.click(`.reader-share-actions:not([hidden]) ${action}`);
  await browser.waitFor(`document.querySelector('.toast').textContent.includes('download requested')`);
  const timeout = Date.now() + 6000;
  while (Date.now() < timeout) {
    const fresh = (await downloads()).find(name => !before.includes(name) && name.endsWith(extension));
    if (fresh) return { name: fresh, text: await readFile(join(browser.dir, fresh), 'utf8') };
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`No actual ${extension} download produced`);
}

try {
  const filler = Array.from({ length: 16 }, (_, i) => `## Section ${i}\n\n${'A longer book paragraph for reading and study. '.repeat(10)}`).join('\n\n');
  await browser.drop('attention.md', '# Attention\n\nA passage worth keeping.\n\n' + filler);
  await browser.select('A passage', 'worth keeping');
  await check('No misleading Attach action for ordinary selections', `getComputedStyle(document.querySelector('.sel-relink')).display === 'none'`);
  await browser.click('.sel-note-btn');
  await input('    const answer = 42;\n\nMy own insight.\n');
  await browser.evaluate(() => { const workspace = document.querySelector('.workspace'); workspace.scrollTop = 150; workspace.dispatchEvent(new Event('scroll')); });
  await check('Reader scroll keeps the separate note document open', `!document.querySelector('.note-editor').hidden && document.querySelector('.note-input').value.startsWith('    const answer')`);
  await browser.click('.note-editor .sel-save');
  await check('Saved passage note retains meaningful Markdown indentation', `JSON.parse(localStorage.getItem('mark.highlights.v1'))['attention.md'][0].note === ${JSON.stringify('    const answer = 42;\n\nMy own insight.\n')}`);
  await input('My own insight.');
  await browser.evaluate(() => document.querySelector('.note-input').setSelectionRange(0, 2));
  await browser.click('.note-bold');
  await check('Word-like formatting operates on the selected note text', `document.querySelector('.note-input').value === '**My** own insight.'`);
  await browser.evaluate(() => { const input = document.querySelector('.note-input'); input.setSelectionRange(input.value.length, input.value.length); });
  await browser.click('.note-insert summary');
  await browser.click('.note-format.note-table');
  await check('Insert table uses real Markdown', `document.querySelector('.note-input').value.includes('| --- | --- |')`);
  await browser.click('.note-preview-toggle');
  await check('Sanitized note preview renders tables with contextual sharing', `!!document.querySelector('.note-preview table') && !!document.querySelector('.note-preview .share-trigger')`);
  await browser.click('.note-preview-toggle');
  await input('A draft that survives restart.');
  await browser.click('.note-close');
  await browser.reload();
  await browser.drop('attention.md', '# Attention\n\nA passage worth keeping.\n\n' + filler);
  await browser.click('.notes-btn');
  await browser.click('.note-list-entry');
  await check('A fresh app instance recovers the exact passage draft', `document.querySelector('.note-input').value === 'A draft that survives restart.'`);
  await browser.click('.note-editor .sel-save');
  await browser.click('.note-close');

  await browser.drop('attention.md', '# Revised\n\nA replacement passage in a changed book.\n\n' + filler);
  await browser.click('.file-menu-btn');
  await browser.click('.annotation-toggle');
  await check('File actions yield to the recovery pane', `document.querySelector('#file-actions').hidden && !document.querySelector('.annotation-recovery').hidden`);
  await browser.click('.recovery-item .recovery-actions button:last-child');
  await browser.select('A replacement', 'replacement passage');
  await check('Attach is genuinely available only during explicit relinking', `!document.querySelector('.sel-relink').hidden && getComputedStyle(document.querySelector('.sel-relink')).display !== 'none'`);
  const originalAnnotation = await browser.evaluate(() => JSON.parse(localStorage.getItem('mark.highlights.v1'))['attention.md'][0]);
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.select('A replacement', 'replacement passage');
  await check('Escape cancels Attach without altering the orphan note', `document.querySelector('.sel-relink').hidden && JSON.parse(localStorage.getItem('mark.highlights.v1'))['attention.md'][0].group === ${JSON.stringify(originalAnnotation.group)}`);
  await browser.click('.file-menu-btn'); await browser.click('.annotation-toggle');
  await browser.click('.recovery-item .recovery-actions button:last-child');
  await browser.select('A replacement', 'replacement passage'); await browser.click('.sel-relink');
  await check('Real click attaches the orphan while preserving note identity and color', `document.querySelector('article mark.has-note')?.textContent === 'replacement passage' && (() => { const h = JSON.parse(localStorage.getItem('mark.highlights.v1'))['attention.md'][0]; return h.note === 'A draft that survives restart.' && h.group === ${JSON.stringify(originalAnnotation.group)} && h.color === ${JSON.stringify(originalAnnotation.color)}; })()`);

  await browser.drop('SAMPLE.md', await readFile(new URL('../SAMPLE.md', import.meta.url), 'utf8'));
  await browser.waitFor("!!document.querySelector('article .artifact-mermaid svg')");
  await check('Reader still renders math, Mermaid, and code', `document.querySelectorAll('article .katex').length > 0 && document.querySelectorAll('article .code-block').length === 2`);
  await browser.click('.view-menu-btn');
  await browser.click('[data-layout="book"]');
  await browser.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)));
  const folio = await browser.evaluate(() => document.querySelector('.folio').textContent);
  await browser.click('[aria-label="Next pages"]');
  assert.notEqual(await browser.evaluate(() => document.querySelector('.folio').textContent), folio, 'Book still turns');
  checks.push('Book layout and page turning still work');
  await browser.click('.view-menu-btn');
  await browser.click('[data-layout="scroll"]');
  await browser.evaluate(() => { document.querySelector('.workspace').scrollTop = 0; });

  const source = '# Shared evidence\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| formula | =1+1 |\r\n| answer | 42 |\r\n\r\n```ts\r\nconst answer = 42;\r\n```\r\n';
  await browser.drop('evidence.md', source);
  await browser.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: browser.dir });
  const markdown = await download('.table-block .share-trigger', '.share-markdown', '.md');
  assert.equal(markdown.text, source.split('\r\n').slice(2, 6).join('\r\n') + '\r\n');
  checks.push('Table download preserves exact original Markdown and CRLF');
  const csv = await download('.table-block .share-trigger', '.share-csv', '.csv');
  assert.ok(csv.text.includes("\"'=1+1\""));
  checks.push('CSV download neutralizes spreadsheet formulas');
  const context = JSON.parse((await download('.table-block .share-trigger', '.share-context', '.json')).text);
  assert.equal(context.format, 'mark-context'); assert.equal(context.source.name, 'evidence.md');
  assert.equal(context.includesFullSource, false); assert.equal(context.source.startLine, 3); assert.equal(context.source.endLine, 6);
  assert.equal(context.block.markdown, markdown.text); assert.match(context.source.sourceTextSha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(context).includes('const answer'));
  checks.push('Agent context is the selected table plus provenance, not the full book');
  const code = await download('.code-block .share-trigger', '.share-markdown', '.md');
  assert.equal(code.text, '```ts\r\nconst answer = 42;\r\n```\r\n');
  checks.push('Code sharing includes the original fenced Markdown');
  await browser.click('.view-menu-btn');
  await browser.click('[data-layout="book"]');
  await browser.click('.table-block .share-trigger');
  await check('Book sharing menu is portalled and fits the viewport', `(() => { const menu = document.querySelector('.reader-share-actions:not([hidden])'); const r = menu.getBoundingClientRect(); return menu.parentElement === document.body && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`);
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.click('.view-menu-btn');
  await browser.click('[data-layout="scroll"]');
  await browser.click('.file-menu-btn');
  await browser.click('.edit-copy-btn');
  await check('Source copy preserves Markdown text with textarea-normalized line endings', `document.querySelector('.note-input').value === ${JSON.stringify(source.replace(/\r\n?/g, '\n'))}`);
  await input('# Edited copy\n\nMy additions.');
  await browser.click('.note-editor .sel-save');
  await check('Source-copy editing never rewrites the reading source', `document.querySelector('article').textContent.includes('const answer = 42') && !document.querySelector('article').textContent.includes('My additions.') && JSON.parse(localStorage.getItem('mark.drafts.v1')).items.some(d => d.purpose === 'document' && d.name === 'evidence-edited.md')`);
  const before = await downloads();
  await browser.click('.note-export');
  let noteFile;
  const until = Date.now() + 6000;
  while (Date.now() < until) { noteFile = (await downloads()).find(name => !before.includes(name) && name.endsWith('.md')); if (noteFile) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(noteFile, 'Edited Markdown was actually downloaded');
  assert.equal(await readFile(join(browser.dir, noteFile), 'utf8'), '# Edited copy\n\nMy additions.');
  checks.push('Edited document exports its own exact Markdown');
  await browser.screenshot('reader-and-writer');
  await browser.click('.note-close');
  await browser.reload();
  await browser.click('.notes-btn');
  await browser.click('.note-list-entry');
  await check('Standalone document drafts reopen without a source file', `document.querySelector('.note-input').value === ${JSON.stringify('# Edited copy\n\nMy additions.')}`);

  await browser.evaluate(() => {
    const native = document.createElement('div'); native.className = 'window-controls';
    for (const label of ['Minimize', 'Maximize', 'Close']) { const button = document.createElement('button'); button.className = 'win-btn'; button.textContent = label[0]; button.setAttribute('aria-label', label); native.append(button); }
    document.querySelector('.chrome').append(native);
  });
  for (const [width, height] of [[1200, 820], [800, 600], [460, 340]]) {
    await resize(width, height);
    await check(`Header and native-control footprint fit ${width}×${height}`, `document.querySelector('.chrome').scrollWidth <= innerWidth && document.querySelector('.window-controls button:last-child').getBoundingClientRect().right <= innerWidth`);
    await check(`Notes and save/export controls fit ${width}×${height}`, `(() => { const pane = document.querySelector('.note-editor').getBoundingClientRect(), save = document.querySelector('.note-editor .sel-save').getBoundingClientRect(), exp = document.querySelector('.note-export').getBoundingClientRect(), input = document.querySelector('.note-input').getBoundingClientRect(); return pane.right <= innerWidth && pane.bottom <= innerHeight && save.bottom <= pane.bottom && exp.bottom <= pane.bottom && input.height >= 48; })()`);
    await browser.screenshot(`notes-${width}`);
  }
  await browser.evaluate(() => { document.querySelector('.audio-bar').hidden = false; const quote = document.querySelector('.note-source-quote'); quote.hidden = false; quote.textContent = 'An attached source passage.'; });
  await check('Compact writer remains usable with an audio-strip footprint', `document.querySelector('.note-input').getBoundingClientRect().height >= 48 && document.querySelector('.note-editor').getBoundingClientRect().bottom <= document.querySelector('.audio-bar').getBoundingClientRect().top`);
  await browser.screenshot('notes-audio-footprint-460');
  assert.equal(browser.exceptions.length, 0, 'No unhandled browser errors');
  checks.push('No unhandled browser exceptions');
} catch (error) {
  process.exitCode = 1; console.error(error.stack);
  await browser.screenshot('failure');
  console.error('Failure state:', await browser.evaluate(() => ({ name: document.querySelector('.file-name')?.textContent, folio: document.querySelector('.folio')?.textContent, editorOpen: !document.querySelector('.note-editor')?.hidden })));
} finally {
  await writeFile(join(browser.dir, 'results.json'), JSON.stringify({ checks, passed: !process.exitCode, errors: browser.exceptions }, null, 2));
  console.log(`${checks.length} browser checks. Evidence:`, browser.dir);
  await browser.close();
}
