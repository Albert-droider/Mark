import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "../renderer/markdown";
import { replaceBlock, toggleTask } from "../live-markdown";
import { readMarkdownTable, writeMarkdownTable } from "../markdown-table";
import { readMarkdownFence, writeMarkdownFence } from "../markdown-fence";
import { MarkdownHistory } from "../markdown-history";

describe("live Markdown provenance", () => {
  it("preserves CRLF/frontmatter and targets nested, quoted and ordered tasks", () => {
    const source = '\uFEFF---\r\ntitle: Demo\r\n---\r\n\r\n- [ ] Parent\r\n  - [X] Nested\r\n\r\n> - [ ] Quoted\r\n\r\n1. [ ] Ordered\r\n';
    const rendered = new MarkdownRenderer().renderWithSource(source);
    expect(rendered.tasks.map(task => task.startLine)).toEqual([5, 6, 8, 10]);
    expect(rendered.tasks.map(task => task.checked)).toEqual([false, true, false, false]);
    expect(toggleTask(source, rendered.tasks[2], true)).toBe(source.replace('> - [ ]', '> - [x]'));
    expect(toggleTask(source, rendered.tasks[1], false)).toBe(source.replace('  - [X]', '  - [ ]'));
    const root = document.createElement('div'); root.innerHTML = rendered.html;
    expect([...root.querySelectorAll<HTMLInputElement>('input')].every(input => input.disabled)).toBe(true);
  });
  it("does not give raw HTML or fenced task examples write authority", () => {
    const rendered = new MarkdownRenderer().renderWithSource('```md\n- [ ] Code\n```\n\n<input type=checkbox data-mark-task=fake>\n\n- [ ] Real\n');
    expect(rendered.tasks).toHaveLength(1);
    expect(rendered.tasks[0].markdown).toBe('- [ ] Real\n');
  });
  it("rejects a stale task or block instead of guessing a new location", () => {
    const source = '- [ ] Original\n\n| A | B |\n| --- | --- |\n| one | two |\n';
    const rendered = new MarkdownRenderer().renderWithSource(source);
    expect(() => toggleTask(source.replace('Original', 'Changed'), rendered.tasks[0], true)).toThrow('out of date');
    expect(() => replaceBlock(source.replace('one', 'three'), rendered.blocks[0], '| New |\n| --- |\n')).toThrow('out of date');
    expect(() => replaceBlock(source, { ...rendered.blocks[0], startLine: 999, endLine: 999, markdown: '' }, 'wrong')).toThrow('out of date');
  });
});

describe("live table and fence round trips", () => {
  it("keeps Markdown, escaped pipes, alignment and CRLF", () => {
    const source = '| **Topic** | State |\r\n| :--- | ---: |\r\n| a\\|b | `ready` |\r\n';
    const table = readMarkdownTable(source)!;
    expect(table.rows).toEqual([['a\\|b', '`ready`']]);
    table.rows[0][1] = 'done | reviewed';
    expect(writeMarkdownTable(table)).toBe(source.replace('`ready`', 'done \\| reviewed'));
    expect(readMarkdownTable('| A | B |\n| --- | --- |\n| one | two | extra |\n')).toBeNull();
  });
  it("pads missing cells, supports single-column tables and never consumes surrounding source", () => {
    const table = readMarkdownTable('| A | B |\n| --- | --- |\n| one |\n')!;
    expect(table.rows).toEqual([['one', '']]);
    expect(readMarkdownTable('| A |\n| --- |\n| x |')).not.toBeNull();
    const source = 'Before\n\n| A | B |\n| --- | --- |\n| one | two |\n\nAfter';
    const block = new MarkdownRenderer().renderWithSource(source).blocks[0];
    expect(replaceBlock(source, block, '| A |\n| --- |\n| three |\n')).toBe('Before\n\n| A |\n| --- |\n| three |\n\nAfter');
  });
  it("preserves fence info/endings and safely encloses a body containing fences", () => {
    const source = '```ts title=demo\r\nconst x = 1;\r\n```\r\n';
    const fence = readMarkdownFence(source)!;
    expect(writeMarkdownFence(fence, fence.body)).toBe(source);
    const changed = writeMarkdownFence(fence, '```\ntext\n```\n');
    expect(changed).toBe('````ts title=demo\r\n```\r\ntext\r\n```\r\n````\r\n');
    expect(readMarkdownFence('```mermaid\ngraph LR\n')).toBeNull();
    expect(readMarkdownFence('~~~text\nbody\n~~~')?.body).toBe('body\n');
  });
});

describe("bounded Markdown history", () => {
  it("keeps exact whitespace and drops a redo branch after a new edit", () => {
    const history = new MarkdownHistory(); history.reset('  Original\n');
    history.record('  Changed\n'); history.record('  Changed\nAgain  ');
    expect(history.undo()).toBe('  Changed\n'); expect(history.undo()).toBe('  Original\n');
    expect(history.redo()).toBe('  Changed\n'); history.record('Different');
    expect(history.canRedo).toBe(false); expect(history.undo()).toBe('  Changed\n');
    history.reset('New document'); expect(history.canUndo).toBe(false);
  });
});
