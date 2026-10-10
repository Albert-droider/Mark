// Text highlights, stored per file — deliberately OUT of Settings, for the same
// reason reading positions are: updateSettings notifies listeners and App then
// re-renders the whole document, so a highlight write would rebuild the page
// under the reader's cursor.
//
// A highlight is a quote anchor, not a DOM position: {text, prefix, suffix}.
// Re-rendering rebuilds the document from the markdown source, which invalidates
// node offsets but not the text itself, so anchors survive theme/font/zoom
// changes. Missing or uncertain anchors are not painted. Their notes remain
// available in the recovery panel — nothing else in the document shifts.

import { anchorForSlice, indexText, matchAnchor, slicesFor } from "./anchors";
import { isRecord, readStored, ReaderStorageError, writeStored } from "./reader-storage";

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
  /** Optional note the reader attached to this selection. Shared by the group. */
  note?: string;
}

export type Anchor = Omit<Highlight, "id" | "group" | "color">;

const KEY = "mark.highlights.v1";
const CONTEXT = 24;

let counter = 0;
export function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function isAnchor(value: unknown): value is Anchor {
  return isRecord(value) && typeof value.text === "string" && typeof value.prefix === "string"
    && typeof value.suffix === "string" && (value.note === undefined || typeof value.note === "string");
}
function validHighlights(value: unknown): value is Record<string, Highlight[]> {
  return isRecord(value) && Object.values(value).every((list) => Array.isArray(list) && list.every((h: unknown) =>
    isRecord(h) && typeof h.id === "string" && !!h.id && typeof h.group === "string" && !!h.group
    && HIGHLIGHT_COLORS.some((color) => color === h.color) && isAnchor(h)));
}
function readAll(): Record<string, Highlight[]> {
  return readStored(KEY, validHighlights, () => Object.create(null) as Record<string, Highlight[]>);
}
function writeAll(all: Record<string, Highlight[]>): void {
  writeStored(KEY, all);
}

export function getHighlights(fileKey: string): Highlight[] {
  if (!fileKey) return [];
  const all = readAll();
  return Object.hasOwn(all, fileKey) ? all[fileKey] : [];
}

/** Anchor for a selection slice: the quote plus the text around it. */
export function quoteFromText(full: string, start: number, end: number): Anchor {
  return {
    text: full.slice(start, end),
    prefix: full.slice(Math.max(0, start - CONTEXT), start),
    suffix: full.slice(end, end + CONTEXT),
  };
}

/** Unique context first; a bare quote is usable only when it is unique. */
export function locateInText(hay: string, anchor: Anchor): number {
  const hit = matchAnchor([{ text: hay, start: 0 }], anchor);
  return hit.status === "found" ? hit.start : -1;
}

export function addHighlight(fileKey: string, anchors: Anchor[], color: HighlightColor): Highlight[] {
  if (!fileKey || anchors.length === 0) return [];
  const group = newId();
  const added = anchors
    .filter((a) => a.text.trim().length > 0)
    .map((a) => ({ ...a, id: newId(), group, color }));
  if (added.length === 0) return [];
  const all = readAll();
  all[fileKey] = [...(Object.hasOwn(all, fileKey) ? all[fileKey] : []), ...added];
  writeAll(all);
  return added;
}

export function setGroupNote(fileKey: string, group: string, note: string): void {
  if (!fileKey || !group) return;
  const trimmed = note.trim();
  const all = readAll();
  const list = Object.hasOwn(all, fileKey) ? all[fileKey] : [];
  if (!list.some((h) => h.group === group)) throw new ReaderStorageError(KEY, "write", "This annotation no longer exists. Its draft is still available.");
  all[fileKey] = list.map((h) => (h.group === group ? { ...h, note: trimmed } : h));
  writeAll(all);
}

/** One acknowledged write for both a new highlight and its note. A reserved
 *  group identity makes retries safe when saving succeeded but draft cleanup did not. */
export function saveHighlightNote(fileKey: string, group: string, anchors: Anchor[] | null, note: string): void {
  const all = readAll();
  const list = Object.hasOwn(all, fileKey) ? all[fileKey] : [];
  if (list.some((h) => h.group === group)) {
    all[fileKey] = list.map((h) => h.group === group ? { ...h, note: note.trim() } : h);
  } else {
    if (!anchors?.length) throw new ReaderStorageError(KEY, "write", "This annotation no longer exists. Its draft is still available.");
    all[fileKey] = [...list, ...anchors.filter((a) => a.text.trim()).map((a) => ({ ...a, id: newId(), group, color: "yellow" as const, note: note.trim() }))];
  }
  writeAll(all);
}

export function relinkHighlightGroup(fileKey: string, group: string, anchors: Anchor[]): void {
  if (!anchors.length) return;
  const all = readAll();
  const list = Object.hasOwn(all, fileKey) ? all[fileKey] : [];
  const sample = list.find((h) => h.group === group);
  if (!sample) throw new ReaderStorageError(KEY, "write", "This annotation no longer exists.");
  const replacement = anchors.map((a) => ({ ...a, id: newId(), group, color: sample.color, note: sample.note }));
  all[fileKey] = [...list.filter((h) => h.group !== group), ...replacement];
  writeAll(all);
}

export function setGroupColor(fileKey: string, group: string, color: HighlightColor): void {
  if (!fileKey || !group) return;
  const all = readAll();
  const list = Object.hasOwn(all, fileKey) ? all[fileKey] : [];
  all[fileKey] = list.map((h) => (h.group === group ? { ...h, color } : h));
  writeAll(all);
}

export function groupNote(fileKey: string, group: string): string {
  return getHighlights(fileKey).find((h) => h.group === group)?.note?.trim() ?? "";
}

export function removeHighlightGroup(fileKey: string, group: string): void {
  const all = readAll();
  const kept = (Object.hasOwn(all, fileKey) ? all[fileKey] : []).filter((h) => h.group !== group);
  if (kept.length === 0) delete all[fileKey];
  else all[fileKey] = kept;
  writeAll(all);
}

export function clearHighlights(fileKey: string): void {
  const all = readAll();
  delete all[fileKey];
  writeAll(all);
}

export interface UnresolvedHighlight {
  group: string;
  quote: string;
  note: string;
  reason: "ambiguous" | "missing" | "changed" | "overlap";
}

/** Resolve the untouched text first. Painting must never make a duplicate look
 *  unique. A selection group is painted together or kept available for recovery. */
export function applyHighlights(root: HTMLElement, fileKey: string): UnresolvedHighlight[] {
  const list = getHighlights(fileKey);
  const groups = new Map<string, Highlight[]>();
  for (const h of list) groups.set(h.group, [...(groups.get(h.group) ?? []), h]);
  // Rebuild only our wrappers, preserving inline formatting and document text.
  const paintedGroups = new Set([...root.querySelectorAll<HTMLElement>("mark.hl")].map((m) => m.dataset.hlGroup ?? ""));
  for (const group of paintedGroups) unwrapGroup(root, group);
  const index = indexText(root);
  const unresolved: UnresolvedHighlight[] = [];
  const occupied: { start: number; end: number }[] = [];
  const jobs: { node: Text; start: number; end: number; absolute: number; h: Highlight }[] = [];
  for (const [group, anchors] of groups) {
    const matches = anchors.map((h) => ({ h, hit: matchAnchor(index.runs, h) }));
    let reason: UnresolvedHighlight["reason"] | null = null;
    if (matches.some((m) => m.hit.status === "ambiguous")) reason = "ambiguous";
    else if (matches.some((m) => m.hit.status === "missing")) reason = "missing";
    const found = matches.flatMap((m) => m.hit.status === "found" ? [{ h: m.h, ...m.hit }] : []);
    for (let i = 1; !reason && i < found.length; i++) {
      if (found[i].start < found[i - 1].end || index.text.slice(found[i - 1].end, found[i].start).trim()) reason = "changed";
    }
    if (!reason && found.some((f) => occupied.some((o) => f.start < o.end && f.end > o.start))) reason = "overlap";
    if (reason) {
      unresolved.push({ group, reason, quote: anchors.map((h) => h.text).join(""), note: anchors.find((h) => h.note)?.note ?? "" });
      continue;
    }
    for (const f of found) {
      occupied.push({ start: f.start, end: f.end });
      for (const slice of slicesFor(index, f.start, f.end)) {
        jobs.push({ ...slice, absolute: f.start, h: f.h });
      }
    }
  }
  // Splitting a text node at the end leaves its earlier offsets intact.
  jobs.sort((a, b) => b.absolute - a.absolute || b.start - a.start);
  for (const job of jobs) wrap(job.node, job.start, job.end, job.h);
  return unresolved;
}

function markClass(h: Highlight): string {
  return `hl hl-${h.color}${h.note?.trim() ? " has-note" : ""}`;
}

/** Repaint color and the note marker without wrapping the text again. */
export function refreshGroup(root: HTMLElement, fileKey: string, group: string): void {
  const sample = getHighlights(fileKey).find((h) => h.group === group);
  if (!sample) return;
  const className = markClass(sample);
  root.querySelectorAll("mark.hl").forEach((mark) => {
    if ((mark as HTMLElement).dataset.hlGroup !== group) return;
    mark.className = className;
  });
}

function wrap(node: Text, start: number, end: number, h: Highlight): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const mark = document.createElement("mark");
  mark.className = markClass(h);
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
export function anchorsFromRange(range: Range, root?: HTMLElement): Anchor[] {
  const out: Anchor[] = [];
  const index = root ? indexText(root) : null;
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
      if (end > start && text.data.slice(start, end).trim()) {
        const anchor = index ? anchorForSlice(index, text, start, end) : quoteFromText(text.data, start, end);
        if (anchor) out.push(anchor);
      }
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
