import { indexText } from "./anchors";
import type { Anchor } from "./highlights";

/** Include neighboring blocks so identical paragraphs do not share an anchor. */
export function fileNoteAnchors(range: Range, root: HTMLElement): Anchor[] {
  const index = indexText(root), anchors: Anchor[] = [];
  for (const run of index.runs) for (const slice of run.slices) {
    if (!range.intersectsNode(slice.node)) continue;
    const from = range.startContainer === slice.node ? range.startOffset : 0;
    const to = range.endContainer === slice.node ? range.endOffset : slice.node.length;
    if (to <= from) continue;
    const start = slice.start + from, end = slice.start + to;
    anchors.push({ text: slice.node.data.slice(from, to), prefix: index.text.slice(Math.max(0, start - 24), start),
      suffix: index.text.slice(end, end + 24) });
  }
  return anchors;
}
