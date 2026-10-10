import { describe, expect, it } from "vitest";
import { insertFileNote, readFileNote, updateFileNote, removeFileNote } from "../file-notes";
import { getRenderer } from "../renderer";

const source = "\uFEFF# Study\r\n\r\nRepeated passage.\r\n\r\nRepeated passage.\r\n\r\nAfter.\r\n";
describe("notes travel inside the Markdown file", () => {
  it("round-trips context and unsafe quote characters without closing the metadata comment", () => {
    const note = { id: "safe-note", quote: '> --><script>alert("x")</script>', text: "<b>Plain note</b>",
      anchors: [{ text: "same words", prefix: "First.\n", suffix: "\nNext." }] };
    const added = insertFileNote("Paragraph.\n", 1, note);
    const line = added.split("\n").findIndex(line => line.startsWith("<!-- mark:note ")) + 1;
    const parsed = readFileNote(added, line)!; expect(parsed).toMatchObject(note);
    expect(added.split("\n")[line - 1]).not.toContain("<script>");
    expect(getRenderer("markdown").render(added)).not.toContain("Plain note");
    expect(updateFileNote(added, parsed, "Changed")).toContain("\\u003cscript\\u003e");
  });
  it("rejects stale edits and deletes only its exact source span", () => {
    const added = insertFileNote("Paragraph.\n", 1, { id: "exact", quote: "Paragraph.", text: "Keep" });
    const line = added.split("\n").findIndex(line => line.startsWith("<!-- mark:note ")) + 1;
    const parsed = readFileNote(added, line)!;
    expect(() => updateFileNote(added.replace("> Keep", "> External"), parsed, "Mine")).toThrow("The note source changed.");
    expect(removeFileNote(added, parsed)).toBe(added.slice(0, parsed.startOffset) + added.slice(parsed.endOffset));
  });
  it("does not claim quoted marker examples or unsupported metadata as file-owned notes", () => {
    const valid = insertFileNote("", 0, { id: "example", quote: "", text: "Example" });
    const renderer = getRenderer("markdown");
    expect(renderer.renderWithSource!("```md\n" + valid + "```\n").notes).toHaveLength(0);
    expect(readFileNote(valid.replace('"version":1', '"version":9'), 1)).toBeNull();
    expect(readFileNote(valid.replace('"quote":""', '"quote":"","anchors":[{"text":7}]'), 1)).toBeNull();
  });

  it("inserts beside the chosen repeated passage, then edits without touching other source bytes", () => {
    const note = { id: "test-note", quote: "Repeated passage.", text: "My explanation\nSecond line" };
    const added = insertFileNote(source, 5, note);
    expect(added).toMatch(/^\uFEFF# Study\r\n\r\nRepeated passage\.\r\n\r\nRepeated passage\.\r\n/);
    expect(added).toContain("> [!NOTE]\r\n> My explanation\r\n> Second line");
    expect(added).toMatch(/\r\nAfter\.\r\n$/);
    const line = added.split(/\r?\n/).findIndex(line => line.startsWith("<!-- mark:note ")) + 1;
    const parsed = readFileNote(added, line)!;
    expect(parsed).toMatchObject(note);
    const changed = updateFileNote(added, parsed, "My revised explanation\n");
    expect(changed).toContain("> My revised explanation\r\n> \r\n");
    expect(changed.slice(0, added.indexOf("<!-- mark:note "))).toBe(added.slice(0, added.indexOf("<!-- mark:note ")));
    expect(changed.slice(changed.indexOf("<!-- /mark:note -->") + "<!-- /mark:note -->".length)).toBe(added.slice(added.indexOf("<!-- /mark:note -->") + "<!-- /mark:note -->".length));
  });
});
