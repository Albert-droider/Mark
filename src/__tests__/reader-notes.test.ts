import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Viewer } from "../viewer";
import { insertFileNote } from "../file-notes";
import { InPlaceNotes } from "../in-place-notes";
import { getRenderer } from "../renderer";

const viewers: Viewer[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => { viewers.splice(0).forEach(viewer => { viewer.dispose(); viewer.root.remove(); }); vi.useRealTimers(); });
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();
function open(source: string): Viewer {
  const viewer = new Viewer(); viewers.push(viewer); document.body.append(viewer.root);
  viewer.setEditable(true);
  viewer.onSourceChange = (_file, phase) => { if (phase === "render") viewer.rerender(); };
  viewer.render({ name: "Study.md", path: "C:/fixtures/Study.md", kind: "markdown", source });
  return viewer;
}
function noteFor(paragraph: HTMLElement): void {
  const range = document.createRange(); range.selectNodeContents(paragraph);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  document.querySelector<HTMLButtonElement>(".sel-note-btn")!.click();
}
describe("subtle notes leave the reading text uninterrupted", () => {
  it("keeps a missing passage note accessible without painting a guessed location", () => {
    const source = insertFileNote("# Study\n\nDifferent passage.\n", 3, { id: "orphan", quote: "Removed passage.", text: "Keep my explanation" });
    const viewer = open(source);
    expect(viewer.root.querySelector(".reader-note-mark")).toBeNull();
    expect(viewer.root.textContent).not.toContain("Keep my explanation");
    viewer.openNotes();
    const recovery = document.querySelector<HTMLElement>(".annotation-recovery")!;
    expect(recovery.hidden).toBe(false); expect(recovery.textContent).toContain("Keep my explanation");
    recovery.querySelector<HTMLButtonElement>("[data-file-note] button")!.click();
    expect(document.querySelector<HTMLTextAreaElement>(".reader-note-input")!.value).toBe("Keep my explanation");
  });
  it("preserves inline Markdown formatting and only underlines the selected text fragments", () => {
    const viewer = open("# Study\n\nLearn **deep ideas** now.\n");
    noteFor(viewer.root.querySelector<HTMLElement>("p")!);
    expect(viewer.root.querySelector("strong")?.textContent).toBe("deep ideas");
    expect(viewer.root.querySelectorAll(".reader-note-mark")).toHaveLength(3);
    expect(viewer.root.querySelector("p")!.textContent).toBe("Learn deep ideas now.");
  });
  it("retries a rejected note change without advancing later note offsets", () => {
    let source = insertFileNote("# Study\n\nPassage.\n", 3, { id: "guarded", quote: "Passage.", text: "Original" });
    source = insertFileNote(source, source.split("\n").length, { id: "later", quote: "", text: "Second note" });
    const rendered = getRenderer("markdown").renderWithSource!(source), root = document.createElement("article");
    root.innerHTML = rendered.html; document.body.append(root);
    let current = source, accept = false;
    const notes = new InPlaceNotes(root, rendered, { current: () => current, report: vi.fn(), change: next => {
      if (!accept) throw new Error("Change rejected");
      current = next;
    } });
    try {
      notes.edit("guarded");
      const input = document.querySelector<HTMLTextAreaElement>(".reader-note-input")!;
      input.value = "A longer explanation\nWith another line";
      expect(notes.capturePending()).toBe(false); expect(current).toBe(source);
      expect(notes.entries().map(note => note.text)).toEqual(["Original", "Second note"]);
      expect(input.value).toBe("A longer explanation\nWith another line");
      accept = true; expect(notes.capturePending()).toBe(true);
      expect(current).toContain("> A longer explanation\n> With another line");
      notes.edit("later"); input.value = "Updated second note";
      expect(notes.capturePending()).toBe(true); expect(current).toContain("> Updated second note");
      expect(current).toContain("> A longer explanation\n> With another line");
    } finally { notes.dispose(); root.remove(); }
  });
  it("keeps the input open when a stale source refuses the note mutation", () => {
    const initial = insertFileNote("# Study\n\nPassage.\n", 3, { id: "guarded", quote: "Passage.", text: "Original" });
    const rendered = getRenderer("markdown").renderWithSource!(initial), root = document.createElement("article");
    root.innerHTML = rendered.html; document.body.append(root);
    let current = initial; const change = vi.fn(), report = vi.fn();
    const notes = new InPlaceNotes(root, rendered, { current: () => current, change, report });
    notes.edit("guarded"); current = "# Externally changed\n";
    const input = document.querySelector<HTMLTextAreaElement>(".reader-note-input")!;
    input.value = "Must not disappear"; input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(change).not.toHaveBeenCalled(); expect(report).toHaveBeenCalled(); expect(notes.capturePending()).toBe(false);
    expect(input.value).toBe("Must not disappear"); expect(document.querySelector<HTMLElement>(".reader-note-popup")!.hidden).toBe(false);
    notes.dispose(); root.remove();
  });
  it("deletes a source-owned note without changing the paragraph text", () => {
    const original = "# Study\n\nPassage.\n";
    const source = insertFileNote(original, 3, { id: "remove", quote: "Passage.", text: "My note" });
    const viewer = open(source); vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    viewer.root.querySelector<HTMLElement>(".reader-note-mark")!.click();
    document.querySelector<HTMLButtonElement>(".reader-note-remove")!.click(); expect(viewer.file!.source).toBe(source);
    document.querySelector<HTMLButtonElement>(".reader-note-remove")!.click();
    expect(viewer.file!.source).not.toContain("mark:note"); expect(viewer.root.querySelector(".reader-note-mark")).toBeNull();
    expect(viewer.root.querySelector("p")!.textContent).toBe("Passage.");
  });
  it("keeps a document note reachable without inserting any visible reading block", () => {
    const viewer = open("# Study\n\nPassage.\n"); viewer.openNotes();
    const input = document.querySelector<HTMLTextAreaElement>(".reader-note-input")!;
    input.value = "Whole-document insight"; input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(viewer.root.textContent).not.toContain("Whole-document insight"); expect(viewer.root.querySelector(".reader-note-mark")).toBeNull();
    viewer.openNotes(); expect(document.querySelector("[data-file-note]")?.textContent).toContain("Whole-document insight");
  });
  it("retains overlapping or duplicate source notes without crashing or rewriting the file", () => {
    let source = "# Study\n\nPassage.\n";
    source = insertFileNote(source, source.split("\n").length, { id: "duplicate", quote: "Passage.", text: "First" });
    source = insertFileNote(source, source.split("\n").length, { id: "duplicate", quote: "Passage.", text: "Second" });
    const viewer = open(source); expect(viewer.file!.source).toBe(source);
    viewer.root.querySelector<HTMLElement>(".reader-note-mark")!.click();
    expect(document.querySelector<HTMLElement>(".reader-note-popup")!.hidden).toBe(true);
    viewer.openNotes(); expect(document.querySelectorAll("[data-file-note]")).toHaveLength(2);
  });

  it("marks only the chosen repeated passage and writes to the file through a floating control", () => {
    const original = "# Study\n\nSame passage.\n\nSame passage.\n\nAfter.\n";
    const viewer = open(original);
    noteFor(viewer.root.querySelectorAll<HTMLElement>(":scope > p")[1]);
    expect(viewer.root.querySelector(".reader-note")).toBeNull();
    expect(viewer.root.querySelectorAll("p")).toHaveLength(3);
    const mark = viewer.root.querySelector<HTMLElement>(".reader-note-mark")!;
    expect(mark).not.toBeNull(); expect(mark.parentElement).toBe(viewer.root.querySelectorAll("p")[1]);
    const input = document.querySelector<HTMLTextAreaElement>(".reader-note-input")!;
    expect(viewer.root.contains(input)).toBe(false); expect(document.activeElement).toBe(input);
    expect(document.querySelector<HTMLElement>(".note-editor")?.hidden).toBe(true);
    input.value = "My own explanation\nSecond line."; input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(viewer.file!.source.startsWith(original)).toBe(true);
    expect(viewer.file!.source).toContain("> My own explanation\n> Second line.");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    viewer.rerender();
    expect(viewer.root.textContent).not.toContain("My own explanation");
    expect(viewer.root.querySelectorAll("p")).toHaveLength(3);
    expect(localStorage.getItem("mark.highlights.v1")).toBeNull();
    vi.useFakeTimers();
    viewer.root.querySelector<HTMLElement>(".reader-note-mark")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(500);
    const tip = document.querySelector<HTMLElement>(".reader-note-tip")!;
    expect(tip.hidden).toBe(false); expect(tip.textContent).toContain("My own explanation");
    expect(viewer.root.contains(tip)).toBe(false);
  });
});
