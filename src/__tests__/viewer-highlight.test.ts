import { beforeEach, describe, expect, it } from "vitest";
import { Viewer } from "../viewer";
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
  document.querySelectorAll(".sel-pop, .markdown-body").forEach((n) => n.remove());
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
});
