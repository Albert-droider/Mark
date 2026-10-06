// Text highlights, stored per file — deliberately OUT of Settings, for the same
// reason reading positions are: updateSettings notifies listeners and App then
// re-renders the whole document, so a highlight write would rebuild the page
// under the reader's cursor.
//
// A highlight is a quote anchor, not a DOM position: {text, prefix, suffix}.
// Re-rendering rebuilds the document from the markdown source, which invalidates
// node offsets but not the text itself, so anchors survive theme/font/zoom
// changes. If the text is edited away the anchor simply does not match and is
// skipped — nothing else in the document shifts.

export const HIGHLIGHT_COLORS = ["yellow", "green", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export interface Highlight {
  /** Unique per anchor (one selection can produce several, one per text node). */
  id: string;
  /** Shared by every anchor that came from the same selection, so removing one
   *  removes the whole phrase instead of a fragment of it. */
  group: string;
  color: HighlightColor;
  text: string;
  prefix: string;
  suffix: string;
}

export type Anchor = Omit<Highlight, "id" | "group" | "color">;

const KEY = "mark.highlights.v1";
const CONTEXT = 24;

let counter = 0;
export function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

function readAll(): Record<string, Highlight[]> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Highlight[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Highlight[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable; ignore */
  }
}

export function getHighlights(fileKey: string): Highlight[] {
  if (!fileKey) return [];
  const list = readAll()[fileKey];
  return Array.isArray(list) ? list : [];
}

/** Anchor for a selection slice: the quote plus the text around it. */
export function quoteFromText(full: string, start: number, end: number): Anchor {
  return {
    text: full.slice(start, end),
    prefix: full.slice(Math.max(0, start - CONTEXT), start),
    suffix: full.slice(end, end + CONTEXT),
  };
}

/** Where does this anchor sit in `hay`? Context first (the same phrase can occur
 *  several times), the bare quote as fallback when the text node was reflowed. */
export function locateInText(hay: string, anchor: Anchor): number {
  if (!anchor.text) return -1;
  const withContext = anchor.prefix + anchor.text + anchor.suffix;
  const hit = hay.indexOf(withContext);
  if (hit >= 0) return hit + anchor.prefix.length;
  return hay.indexOf(anchor.text);
}

export function addHighlight(fileKey: string, anchors: Anchor[], color: HighlightColor): Highlight[] {
  if (!fileKey || anchors.length === 0) return [];
  const group = newId();
  const added = anchors
    .filter((a) => a.text.trim().length > 0)
    .map((a) => ({ ...a, id: newId(), group, color }));
  if (added.length === 0) return [];
  const all = readAll();
  all[fileKey] = [...getHighlights(fileKey), ...added];
  writeAll(all);
  return added;
}

export function removeHighlightGroup(fileKey: string, group: string): void {
  const all = readAll();
  const kept = getHighlights(fileKey).filter((h) => h.group !== group);
  if (kept.length === 0) delete all[fileKey];
  else all[fileKey] = kept;
  writeAll(all);
}

export function clearHighlights(fileKey: string): void {
  const all = readAll();
  delete all[fileKey];
  writeAll(all);
}

/** Wrap text node ranges in `<mark class="hl">`. Anchors that no longer match are
 *  skipped, never guessed at. */
export function applyHighlights(root: HTMLElement, fileKey: string): void {
  const list = getHighlights(fileKey);
  if (list.length === 0) return;
  for (const h of list) {
    // Already painted (a repeat of the same phrase elsewhere would otherwise be
    // wrapped again every time the document is re-rendered).
    if (root.querySelector(`mark.hl[data-hl-id="${h.id}"]`)) continue;
    const nodes = textNodes(root);
    const hit = findAnchor(nodes, h);
    if (!hit) continue;
    wrap(hit.node, hit.start, hit.end, h);
  }
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    // Do not re-wrap text that a previous highlight already wrapped.
    const parent = text.parentElement;
    if (text.data.trim() && !parent?.closest("mark.hl")) out.push(text);
    node = walker.nextNode();
  }
  return out;
}

function findAnchor(nodes: Text[], anchor: Anchor): { node: Text; start: number; end: number } | null {
  for (const node of nodes) {
    const at = locateInText(node.data, anchor);
    if (at >= 0) return { node, start: at, end: at + anchor.text.length };
  }
  return null;
}

function wrap(node: Text, start: number, end: number, h: Highlight): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const mark = document.createElement("mark");
  mark.className = `hl hl-${h.color}`;
  mark.dataset.hlId = h.id;
  mark.dataset.hlGroup = h.group;
  try {
    range.surroundContents(mark);
  } catch {
    // Range straddled inline elements after all: keep the anchor, skip the paint.
  }
}

/** Turn a live selection into one anchor per text node it touches (a selection
 *  can span bold words, links or several paragraphs). Offsets are clamped per
 *  node, so the part of a paragraph before the selection is never included. */
export function anchorsFromRange(range: Range): Anchor[] {
  const out: Anchor[] = [];
  // With an element as the start container the range starts on a child boundary,
  // so every intersecting text node is fully inside the selection.
  let passedStart = range.startContainer.nodeType !== Node.TEXT_NODE;
  let finished = false;

  const walk = (node: Node): void => {
    if (finished) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (!passedStart) {
        if (text !== range.startContainer) return; // entirely before the selection
        passedStart = true;
      }
      if (!range.intersectsNode(text)) return;
      const start = text === range.startContainer ? range.startOffset : 0;
      const end = text === range.endContainer ? range.endOffset : text.data.length;
      if (end > start && text.data.slice(start, end).trim()) out.push(quoteFromText(text.data, start, end));
      if (text === range.endContainer) finished = true;
      return;
    }
    node.childNodes.forEach(walk);
  };

  walk(range.commonAncestorContainer);
  return out;
}

/** The ids of the highlight a click landed in, or null. */
export function groupAt(target: Element | null): string | null {
  const mark = target?.closest("mark.hl") as HTMLElement | null;
  return mark?.dataset.hlGroup ?? null;
}

/** Unwrap every mark of a group from the document. */
export function unwrapGroup(root: HTMLElement, group: string): void {
  if (!group) return;
  // Filtered in JS rather than in the selector: `CSS.escape` is not available in
  // every host we run in, and the group id never needs to reach a CSS parser.
  root.querySelectorAll("mark.hl").forEach((mark) => {
    if ((mark as HTMLElement).dataset.hlGroup !== group) return;
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}
