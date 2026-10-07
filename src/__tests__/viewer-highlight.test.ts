import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_HOVER_MS, Viewer } from "../viewer";
import { getHighlights } from "../highlights";
import type { LoadedFile } from "../types";
import { canonicalPath } from "../util";

const KEY = "C:/docs/h05.md";
const QUOTE = "het interactieve dualisme";

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
  document.querySelectorAll(".sel-pop, .note-tip, .markdown-body").forEach((n) => n.remove());
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
