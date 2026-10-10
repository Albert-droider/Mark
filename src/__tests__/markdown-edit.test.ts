import { describe, expect, it } from "vitest";
import { editMarkdown, INSERT_ACTIONS } from "../markdown-edit";

describe("Markdown document controls", () => {
  it("makes selected text bold without replacing surrounding text", () => {
    expect(editMarkdown("Keep this idea here", 5, 14, "bold")).toEqual({
      text: "Keep **this idea** here", start: 7, end: 16,
    });
  });
  it("toggles formatting without losing the selected explanation", () => {
    expect(editMarkdown("Keep **this idea** here", 7, 16, "bold")).toEqual({ text: "Keep this idea here", start: 5, end: 14 });
  });
  it("formats complete lines while keeping unrelated paragraphs", () => {
    expect(editMarkdown("Intro\n\nfirst\nsecond\n\nEnd", 7, 19, "ordered").text).toBe("Intro\n\n1. first\n2. second\n\nEnd");
  });
  it("puts a table between paragraphs, escaping selected pipes", () => {
    const edited = editMarkdown("Before a|b after", 7, 10, "table");
    expect(edited.text).toContain("Before \n\n| Column 1 | Column 2 |");
    expect(edited.text).toContain("| a\\|b | value |\n\n after");
  });
  it("does not prematurely close a code block containing fences", () => {
    const code = "```js\nalert('not run')\n```";
    expect(editMarkdown(code, 0, code.length, "code").text).toBe("````text\n" + code + "\n````");
  });
  it("uses a unique footnote label", () => {
    expect(editMarkdown("Existing[^note-1]\n\n[^note-1]: Already here.", 0, 0, "footnote").text).toContain("[^note-2]: Footnote text.");
  });
  it.each(INSERT_ACTIONS)("exposes a usable %s insertion", (action) => {
    const result = editMarkdown("", 0, 0, action);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.start).toBeGreaterThanOrEqual(0);
    expect(result.end).toBeLessThanOrEqual(result.text.length);
  });
});
