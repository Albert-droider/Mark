import type { Anchor } from "./highlights";

interface Slice { node: Text; start: number; end: number }
interface Run { text: string; start: number; slices: Slice[] }
export interface TextIndex { text: string; runs: Run[] }
export type AnchorMatch = { status: "found"; start: number; end: number }
  | { status: "missing" | "ambiguous" };

const BLOCKS = "p,pre,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,div";
const IGNORE = "button,script,style,.katex-mathml,.reader-note,[data-reader-ui]";

/** Inline formatting shares a text run; unrelated blocks never form a quote. */
export function indexText(root: HTMLElement): TextIndex {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let previousBlock: Element | null = null;
  let length = 0;
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    const node = next as Text;
    const parent = node.parentElement;
    if (!parent || parent.closest(IGNORE) || !node.data) continue;
    const closest = parent.closest(BLOCKS);
    const block = closest && root.contains(closest) ? closest : root;
    // Renderer whitespace between paragraphs is a boundary, not a passage.
    if (block === root && !node.data.trim()) continue;
    if (block !== previousBlock) {
      if (runs.length) length += 1;
      runs.push({ text: "", start: length, slices: [] });
      previousBlock = block;
    }
    const run = runs[runs.length - 1];
    run.slices.push({ node, start: length, end: length + node.length });
    run.text += node.data;
    length += node.length;
  }
  return { runs, text: runs.map((run) => run.text).join("\n") };
}

function occurrences(runs: readonly Pick<Run, "text" | "start">[], text: string, offset: number): number[] {
  const found: number[] = [];
  if (!text) return found;
  for (const run of runs) {
    let from = 0;
    while (from <= run.text.length - text.length) {
      const at = run.text.indexOf(text, from);
      if (at < 0) break;
      found.push(run.start + at + offset);
      // Two candidates are sufficient to prove uncertainty.
      if (found.length === 2) return found;
      from = at + 1;
    }
  }
  return found;
}

/** Context has priority across ALL runs, not just the first text node. */
export function matchAnchor(runs: readonly Pick<Run, "text" | "start">[], anchor: Anchor): AnchorMatch {
  if (!anchor.text) return { status: "missing" };
  let hits = occurrences(runs, anchor.prefix + anchor.text + anchor.suffix, anchor.prefix.length);
  if (!hits.length) hits = occurrences(runs, anchor.text, 0);
  if (hits.length > 1) return { status: "ambiguous" };
  if (!hits.length) return { status: "missing" };
  return { status: "found", start: hits[0], end: hits[0] + anchor.text.length };
}

export function slicesFor(index: TextIndex, start: number, end: number): Slice[] {
  return index.runs.flatMap((run) => run.slices)
    .filter((slice) => slice.start < end && slice.end > start)
    .map((slice) => ({ node: slice.node, start: Math.max(start, slice.start) - slice.start,
      end: Math.min(end, slice.end) - slice.start }));
}

/** Capture context across inline nodes without attaching it to another block. */
export function anchorForSlice(index: TextIndex, node: Text, start: number, end: number): Anchor | null {
  for (const run of index.runs) {
    const slice = run.slices.find((s) => s.node === node);
    if (!slice) continue;
    const from = slice.start - run.start + start;
    const to = slice.start - run.start + end;
    return { text: run.text.slice(from, to), prefix: run.text.slice(Math.max(0, from - 24), from),
      suffix: run.text.slice(to, to + 24) };
  }
  return null;
}
