import { beforeEach, describe, expect, it } from "vitest";
import {
  addHighlight,
  anchorsFromRange,
  applyHighlights,
  clearHighlights,
  getHighlights,
  groupNote,
  locateInText,
  quoteFromText,
  refreshGroup,
  removeHighlightGroup,
  setGroupNote,
  unwrapGroup,
} from "../highlights";

const KEY = "C:/docs/chapter.md";

beforeEach(() => {
  localStorage.clear();
  clearHighlights(KEY);
});

describe("quote anchors", () => {
  it("captures the quote with context on both sides", () => {
    const full = "Descartes zag het lichaam als een machine.";
    const a = quoteFromText(full, 14, 25); // "het lichaam"
    expect(a.text).toBe("het lichaam");
    expect(a.prefix).toBe("Descartes zag ");
    expect(a.suffix).toBe(" als een machine.");
  });

  it("clamps context at the edges of the text node", () => {
    const a = quoteFromText("Kort.", 0, 4);
    expect(a).toEqual({ text: "Kort", prefix: "", suffix: "." });
  });

  it("finds the occurrence that matches the context, not the first one", () => {
    const hay = "geest en lichaam. Later: geest en lichaam, opnieuw.";
    const a = quoteFromText(hay, 25, 35);
    expect(locateInText(hay, a)).toBe(25);
    expect(locateInText("niets hier", a)).toBe(-1);
  });

  it("falls back to the bare quote when the context no longer lines up", () => {
    const a = { text: "interactief dualisme", prefix: "weg ", suffix: " ook weg" };
    expect(locateInText("Zijn idee, interactief dualisme, leidde…", a)).toBe(11);
  });
});

describe("storage per file", () => {
  it("keeps highlights apart for different files", () => {
    addHighlight(KEY, [{ text: "eerste", prefix: "", suffix: "" }], "yellow");
    addHighlight("C:/docs/other.md", [{ text: "tweede", prefix: "", suffix: "" }], "pink");
    expect(getHighlights(KEY).map((h) => h.text)).toEqual(["eerste"]);
    expect(getHighlights("C:/docs/other.md").map((h) => h.text)).toEqual(["tweede"]);
  });

  it("groups the anchors of one selection so removing one removes them all", () => {
    const same = addHighlight(
      KEY,
      [
        { text: "eerste stuk", prefix: "", suffix: "" },
        { text: "tweede stuk", prefix: "", suffix: "" },
      ],
      "green",
    );
    expect(same).toHaveLength(2);
    expect(new Set(same.map((h) => h.group)).size).toBe(1);
    removeHighlightGroup(KEY, same[0].group);
    expect(getHighlights(KEY)).toHaveLength(0);
  });

  it("ignores a selection that is only whitespace", () => {
    expect(addHighlight(KEY, [{ text: "   ", prefix: "", suffix: "" }], "yellow")).toEqual([]);
    expect(getHighlights(KEY)).toHaveLength(0);
  });
});

describe("painting into the document", () => {
  function doc(html: string): HTMLElement {
    const root = document.createElement("article");
    root.innerHTML = html;
    document.body.append(root);
    return root;
  }

  it("marks the anchor and carries the group for removal", () => {
    const root = doc("<p>René Descartes en het interactieve dualisme.</p>");
    const para = "René Descartes en het interactieve dualisme.";
    const quote = "het interactieve dualisme";
    const start = para.indexOf(quote);
    const added = addHighlight(KEY, [quoteFromText(para, start, start + quote.length)], "yellow");
    applyHighlights(root, KEY);
    const mark = root.querySelector("mark.hl") as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe("het interactieve dualisme");
    expect(mark.dataset.hlGroup).toBe(added[0].group);
    expect(mark.classList.contains("hl-yellow")).toBe(true);

    unwrapGroup(root, added[0].group);
    expect(root.querySelector("mark.hl")).toBeNull();
    expect(root.textContent).toBe("René Descartes en het interactieve dualisme.");
  });

  it("does not paint the same highlight twice or touch unrelated text", () => {
    const root = doc("<p>geest en lichaam</p><p>geest en lichaam</p>");
    addHighlight(KEY, [quoteFromText("geest en lichaam", 0, 16)], "yellow");
    applyHighlights(root, KEY);
    applyHighlights(root, KEY);
    expect(root.querySelectorAll("mark.hl")).toHaveLength(1);
  });

  it("skips anchors whose text is gone instead of guessing", () => {
    const root = doc("<p>iets heel anders</p>");
    addHighlight(KEY, [{ text: "verdwenen regel", prefix: "", suffix: "" }], "yellow");
    applyHighlights(root, KEY);
    expect(root.querySelectorAll("mark.hl")).toHaveLength(0);
  });

  it("renders one anchor per text node when a selection spans formatting", () => {
    const root = doc("<p>De <strong>geest</strong> en het lichaam.</p>");
    const p = root.querySelector("p") as HTMLElement;
    const range = document.createRange();
    range.setStart(p.firstChild as Text, 3); // end of "De "
    range.setEnd(p.lastChild as Text, 15); // "...het lichaam"
    const anchors = anchorsFromRange(range);
    expect(anchors.map((a) => a.text)).toEqual(["geest", " en het lichaam"]);
    // the part of the paragraph before the selection must stay out
    expect(anchors.map((a) => a.text).join("")).not.toContain("De ");
  });

  it("keeps a note on the selection and marks it in the document", () => {
    const root = doc("<p>geest en lichaam</p>");
    const added = addHighlight(KEY, [quoteFromText("geest en lichaam", 0, 5)], "green");
    setGroupNote(KEY, added[0].group, "  dualisme  ");
    expect(groupNote(KEY, added[0].group)).toBe("dualisme");
    applyHighlights(root, KEY);
    expect(root.querySelector("mark.hl")?.className).toContain("has-note");
    setGroupNote(KEY, added[0].group, "");
    refreshGroup(root, KEY, added[0].group);
    expect(root.querySelector("mark.hl")?.classList.contains("has-note")).toBe(false);
  });
});
