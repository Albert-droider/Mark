import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_HOVER_MS, Viewer } from "../viewer";
import { addHighlight, getHighlights, setGroupNote } from "../highlights";
import type { LoadedFile } from "../types";
import * as backup from "../backup";
import { BACKUP_KEY, LEGACY_KEYS, clearStorageIssue, reportStorageIssue, storageIssues } from "../reader-storage";
import { canonicalPath } from "../util";

const KEY = "C:/docs/h05.md";
const QUOTE = "het interactieve dualisme";
const viewers = new Set<Viewer>();

// jsdom has no layout engine, so Range has no client rect. The viewer only needs
// *a* rect to place the toolbar; real browsers (and WebView2) provide one.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

function open(): { viewer: Viewer; para: Text } {
  const file: LoadedFile = {
    path: KEY,
    name: "h05.md",
    source: `# Hoofdstuk 5\n\nRené Descartes en ${QUOTE}.\n`,
    kind: "markdown",
  };
  const viewer = new Viewer();
  viewers.add(viewer);
  document.body.append(viewer.root);
  viewer.render(file);
  const walker = document.createTreeWalker(viewer.root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node && !node.data.includes(QUOTE)) node = walker.nextNode() as Text | null;
  if (!node) throw new Error("quote not rendered");
  return { viewer, para: node };
}

function select(node: Text, phrase: string): void {
  const at = node.data.indexOf(phrase);
  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at + phrase.length);
  const sel = window.getSelection() as Selection;
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

function toolbar(): HTMLElement {
  return document.querySelector(".sel-pop") as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  for (const key of [...LEGACY_KEYS, BACKUP_KEY, "reader", "backup-export", "other-storage"]) clearStorageIssue(key);
  document.querySelectorAll(".sel-pop, .note-tip, .markdown-body").forEach((n) => n.remove());
});
afterEach(() => {
  for (const viewer of viewers) viewer.dispose();
  viewers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("viewer highlighting", () => {
  it("highlights a selection, persists it and survives a re-render", () => {
    const { viewer, para } = open();
    expect(toolbar().hidden).toBe(true);

    select(para, QUOTE);
    expect(toolbar().hidden).toBe(false);

    (toolbar().querySelector(".sel-swatch.sel-yellow") as HTMLElement)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const mark = viewer.root.querySelector("mark.hl.hl-yellow") as HTMLElement;
    expect(mark?.textContent).toBe(QUOTE);
    expect(getHighlights(canonicalPath(KEY))).toHaveLength(1);
    expect(toolbar().hidden).toBe(true);

    // A theme/font change re-renders from source; the mark must come back.
    viewer.rerender();
    expect(viewer.root.querySelector("mark.hl.hl-yellow")?.textContent).toBe(QUOTE);
  });

  it("removes a highlight by clicking it", () => {
    const { viewer, para } = open();
    select(para, QUOTE);
    (toolbar().querySelector(".sel-swatch.sel-pink") as HTMLElement)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const mark = viewer.root.querySelector("mark.hl") as HTMLElement;
    mark.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(toolbar().classList.contains("existing")).toBe(true);

    (toolbar().querySelector(".sel-remove") as HTMLElement)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(viewer.root.querySelector("mark.hl")).toBeNull();
    expect(getHighlights(canonicalPath(KEY))).toHaveLength(0);
    expect(viewer.root.textContent).toContain(QUOTE);
  });

  it("stays hidden for a collapsed selection and for clicks outside the document", () => {
    const { viewer } = open();
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(toolbar().hidden).toBe(true);

    const outside = document.createElement("p");
    outside.textContent = "elders op de pagina";
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(toolbar().hidden).toBe(true);
    expect(viewer.root.querySelector("mark.hl")).toBeNull();
  });

  it("recovers an exact note draft after scrolling and re-opening the passage", () => {
    const { viewer, para } = open();
    select(para, QUOTE);
    (toolbar().querySelector(".sel-note-btn") as HTMLElement).click();
    const input = toolbar().querySelector(".sel-note-input") as HTMLTextAreaElement;
    input.value = "  Important unsaved draft\nsecond line  ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    viewer.root.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(toolbar().hidden).toBe(true);
    select(para, QUOTE);
    (toolbar().querySelector(".sel-note-btn") as HTMLElement).click();
    expect(input.value).toBe("  Important unsaved draft\nsecond line  ");
  });

  it("does not replace the note editor when selecting draft text with the keyboard", () => {
    const { para } = open();
    select(para, QUOTE);
    (toolbar().querySelector(".sel-note-btn") as HTMLElement).click();
    const input = toolbar().querySelector(".sel-note-input") as HTMLTextAreaElement;
    input.value = "Selecting my own note";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", shiftKey: true, bubbles: true }));
    expect((toolbar().querySelector(".sel-note") as HTMLElement).hidden).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Selecting my own note");
  });

  it("keeps the note editor inside a compact viewport after it expands", () => {
    vi.stubGlobal("innerWidth", 460);
    vi.stubGlobal("innerHeight", 340);
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 80, 150, 25));
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(254);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.querySelector<HTMLElement>(".sel-note")?.hidden === false ? 206 : 40;
    });
    const { para } = open();
    select(para, QUOTE);
    (toolbar().querySelector(".sel-note-btn") as HTMLElement).click();
    expect(Number.parseFloat(toolbar().style.left)).toBe(8);
    expect(Number.parseFloat(toolbar().style.top)).toBe(113);
  });

  it("keeps missing-passage notes reachable outside the reading article", () => {
    const added = addHighlight(canonicalPath(KEY), [{ text: "lost passage", prefix: "", suffix: "" }], "pink");
    setGroupNote(canonicalPath(KEY), added[0].group, "My explanation must survive.");
    const { viewer } = open();
    const toggle = document.querySelector(".annotation-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.hidden).toBe(false);
    toggle.click();
    const recovery = document.querySelector(".annotation-recovery") as HTMLElement;
    expect(recovery.hidden).toBe(false);
    expect(recovery.textContent).toContain("My explanation must survive.");
    expect(viewer.root.contains(recovery)).toBe(false);
    expect(viewer.root.textContent).not.toContain("My explanation must survive.");
  });

  it("clears a failed export warning after retry without clearing other storage failures", async () => {
    const save = vi.spyOn(backup, "saveReaderBackup")
      .mockRejectedValueOnce(new Error("Export disk unavailable"))
      .mockResolvedValueOnce("saved");
    const { viewer } = open();
    viewer.onNote = vi.fn();
    reportStorageIssue(new Error("Another annotation is not saved"), "other-storage");
    const exportButton = [...document.querySelectorAll<HTMLButtonElement>(".annotation-recovery button")]
      .find((button) => button.textContent === "Export reader backup")!;
    (document.querySelector(".annotation-toggle") as HTMLButtonElement).click();
    exportButton.click();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(storageIssues()).toContain("Export disk unavailable"));
    exportButton.click();
    await vi.waitFor(() => expect(storageIssues()).not.toContain("Export disk unavailable"));
    expect(storageIssues()).toContain("Another annotation is not saved");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports storage errors even without a toast callback", () => {
    const { para } = open();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Simulated quota", "QuotaExceededError");
    });
    select(para, QUOTE);
    (toolbar().querySelector(".sel-yellow") as HTMLButtonElement).click();
    expect(document.querySelector(".annotation-recovery")?.textContent).toContain("Backup could not be stored.");
  });

  it("shows a note tag only after the pointer has rested, and never inside the page", () => {
    vi.useFakeTimers();
    try {
      const { viewer, para } = open();
      select(para, QUOTE);
      (toolbar().querySelector(".sel-note-btn") as HTMLElement).click();
      const input = toolbar().querySelector(".sel-note-input") as HTMLTextAreaElement;
      input.value = "Kern van het argument.";
      (toolbar().querySelector(".sel-save") as HTMLElement).click();

      const mark = viewer.root.querySelector("mark.has-note") as HTMLElement;
      const tip = document.querySelector(".note-tip") as HTMLElement;
      expect(mark).toBeTruthy();
      expect(viewer.root.contains(tip)).toBe(false);
      expect(tip.style.pointerEvents).toBe("none");
      expect(tip.style.position).toBe("fixed");

      mark.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(NOTE_HOVER_MS - 1);
      expect(tip.hidden).toBe(true);
      vi.advanceTimersByTime(1);
      expect(tip.hidden).toBe(false);
      expect(tip.textContent).toContain("Kern van het argument.");

      const scroller = document.createElement("div");
      scroller.scrollTop = 40;
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
      expect(tip.hidden).toBe(true);
      expect(scroller.scrollTop).toBe(40);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show a tag when the pointer leaves early, or when the mark has no note", () => {
    vi.useFakeTimers();
    try {
      const { viewer, para } = open();
      select(para, QUOTE);
      (toolbar().querySelector(".sel-swatch.sel-yellow") as HTMLElement).click();
      const plain = viewer.root.querySelector("mark.hl") as HTMLElement;
      plain.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(NOTE_HOVER_MS);
      const tip = document.querySelector(".note-tip") as HTMLElement;
      expect(tip.hidden).toBe(true);

      plain.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      (toolbar().querySelector(".sel-note-btn") as HTMLElement).click();
      (toolbar().querySelector(".sel-note-input") as HTMLTextAreaElement).value = "even";
      (toolbar().querySelector(".sel-save") as HTMLElement).click();
      const mark = viewer.root.querySelector("mark.has-note") as HTMLElement;
      expect(mark).toBeTruthy();
      mark.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(500);
      mark.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
      vi.advanceTimersByTime(NOTE_HOVER_MS);
      expect(tip.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
