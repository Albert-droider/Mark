export const INSERT_ACTIONS = [
  ["table", "Table"], ["code", "Code block"], ["list", "Bullet list"], ["ordered", "Numbered list"],
  ["task", "Checklist"], ["quote", "Quote"], ["link", "Link"], ["image", "Image"],
  ["rule", "Divider"], ["math", "Math"], ["footnote", "Footnote"], ["callout", "Callout"],
  ["details", "Collapsible details"], ["mermaid", "Mermaid diagram"], ["chart", "Chart"], ["plan", "Progress plan"],
  ["strike", "Strikethrough"], ["mark", "Highlight"], ["inline-code", "Inline code"],
  ["subscript", "Subscript"], ["superscript", "Superscript"], ["definition", "Definition list"],
  ["abbreviation", "Abbreviation"], ["emoji", "Emoji"],
] as const;
export type MarkdownAction = "bold" | "italic" | "heading" | typeof INSERT_ACTIONS[number][0];
export interface MarkdownEdit { text: string; start: number; end: number }

/** Plain Markdown edits: preserve surrounding text, return the new selection. */
export function editMarkdown(text: string, start: number, end: number, action: MarkdownAction): MarkdownEdit {
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(start, Math.min(end, text.length));
  const selected = text.slice(start, end);
  const replace = (value: string, offset = 0, length = value.length - offset): MarkdownEdit => ({
    text: text.slice(0, start) + value + text.slice(end), start: start + offset, end: start + offset + length,
  });
  const wrap = (before: string, after = before, placeholder = "text"): MarkdownEdit => {
    if (text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
      return { text: text.slice(0, start - before.length) + selected + text.slice(end + after.length), start: start - before.length, end: end - before.length };
    }
    const value = selected || placeholder;
    return replace(before + value + after, before.length, value.length);
  };
  const block = (value: string): MarkdownEdit => {
    const left = text.slice(0, start), right = text.slice(end);
    const prefix = !left || left.endsWith("\n\n") ? "" : left.endsWith("\n") ? "\n" : "\n\n";
    const suffix = !right || right.startsWith("\n\n") ? "" : right.startsWith("\n") ? "\n" : "\n\n";
    return replace(prefix + value + suffix, prefix.length, value.length);
  };
  const lines = (prefix: (index: number) => string): MarkdownEdit => {
    const from = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const found = text.indexOf("\n", last), to = found < 0 ? text.length : found;
    const value = text.slice(from, to).split("\n").map((line, i) => prefix(i) + (line || "text")).join("\n");
    return { text: text.slice(0, from) + value + text.slice(to), start: from, end: from + value.length };
  };
  switch (action) {
    case "bold": return wrap("**");
    case "italic": return wrap("*");
    case "strike": return wrap("~~");
    case "mark": return wrap("==");
    case "inline-code": {
      const fence = "`".repeat(Math.max(1, ...[...selected.matchAll(/`+/g)].map(m => m[0].length + 1)));
      const padded = selected.includes("`") ? ` ${selected} ` : selected || "code";
      return replace(fence + padded + fence, fence.length, padded.length);
    }
    case "subscript": return wrap("~");
    case "superscript": return wrap("^");
    case "heading": return lines(() => "## ");
    case "list": return lines(() => "- ");
    case "ordered": return lines(i => `${i + 1}. `);
    case "task": return lines(() => "- [ ] ");
    case "quote": return lines(() => "> ");
    case "link": return replace(`[${selected || "label"}](https://example.com)`, 1, (selected || "label").length);
    case "image": return replace(`![${selected || "description"}](image.png)`);
    case "table": return block(`| Column 1 | Column 2 |\n| --- | --- |\n| ${(selected || "value").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")} | value |`);
    case "code": {
      const fence = "`".repeat(Math.max(3, ...[...selected.matchAll(/`+/g)].map(m => m[0].length + 1)));
      return block(`${fence}text\n${selected || "code goes here"}\n${fence}`);
    }
    case "rule": return block("---");
    case "math": return block(`$$\n${selected || "x^2 + y^2 = z^2"}\n$$`);
    case "footnote": {
      const used = [...text.matchAll(/\[\^note-(\d+)\]/g)].map(m => Number(m[1]));
      const name = `note-${Math.max(0, ...used) + 1}`;
      const value = `${selected}[\^${name}]`;
      return { text: text.slice(0, start) + value + text.slice(end) + `\n\n[^${name}]: Footnote text.\n`, start: start, end: start + value.length };
    }
    case "callout": return block(`:::note\n${selected || "A useful observation."}\n:::`);
    case "details": return block(`:::details More\n${selected || "Details go here."}\n:::`);
    case "mermaid": return block("```mermaid\ngraph LR\n  A[Source] --> B[Insight]\n```");
    case "chart": return block("```chart\nbar\ntitle Comparison\nReading | 12\nNotes | 7\n```");
    case "plan": return block("```plan\ntitle Study plan\nRead | 80\nNotes | 45\n```");
    case "definition": return block(`${selected || "Term"}\n: Definition.`);
    case "abbreviation": return block(`${selected || "HTML"}\n\n*[${selected || "HTML"}]: Hyper Text Markup Language`);
    case "emoji": return replace(`${selected} :sparkles:`);
  }
}
