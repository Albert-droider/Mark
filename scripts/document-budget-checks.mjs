import assert from 'node:assert/strict';

export async function verifyDocumentBudget(browser) {
  const result = await browser.evaluate(`(async () => {
    const { BrowserDocumentStore } = await import('/src/browser-documents.ts');
    let limit = 1024 * 1024 * 1024;
    const store = new BrowserDocumentStore(() => limit);
    const file = { name: 'Budget-refusal.md', path: '', kind: 'markdown', source: 'Original source' };
    const binding = await store.open(file);
    const before = await store.versions(binding.id);
    limit = 1;
    let failure = '';
    try { await store.save(binding.id, { expected: file.source, source: 'Keep my pending edit' }); }
    catch (error) { failure = error.message; }
    const reopened = await store.open(file);
    const after = await store.versions(binding.id);
    return { failure, source: reopened.source, unchangedHistory: JSON.stringify(before) === JSON.stringify(after),
      originalVersion: await store.read(binding.id, before[0].id) };
  })()`);
  assert.match(result.failure, /storage budget/i);
  assert.equal(result.source, 'Original source');
  assert.equal(result.originalVersion, result.source);
  assert.equal(result.unchangedHistory, true);
  return { checks: ['over-budget saves preserve the acknowledged source and all existing history'], result };
}
