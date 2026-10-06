/**
 * Does the alignment hold up on a real chapter?
 *
 * Skipped unless both paths are given, so the repo stays free of personal material:
 *
 *   MARK_DOC_ALIGN=D:/School/.../h05-experimentele-psychologie.md \
 *   MARK_TIMING_ALIGN=D:/School/.../audio/h05-experimentele-psychologie.words.json \
 *   npm test -- align-real
 *
 * The document is rendered exactly like the app renders it, and the words are collected
 * the same way, so the coverage number is the number the reader would get.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getRenderer } from "../renderer";
import { alignWords, collectDocumentWords, normalizeWord, parseTiming } from "../karaoke";

const docPath = process.env.MARK_DOC_ALIGN;
const timingPath = process.env.MARK_TIMING_ALIGN;

describe.skipIf(!docPath || !timingPath)("alignment on real narration", () => {
  it("maps almost every document word onto a spoken word", () => {
    const source = readFileSync(docPath!, "utf8");
    const scope = document.createElement("article");
    scope.innerHTML = getRenderer("markdown").render(source);

    const spoken = parseTiming(readFileSync(timingPath!, "utf8"));
    const words = collectDocumentWords(scope);
    const map = alignWords(
      words.map((w) => normalizeWord(w.node.data.slice(w.start, w.end))),
      spoken.map((w) => normalizeWord(w.w)),
    );

    const total = words.length;
    const mapped = map.filter((m) => m >= 0).length;
    const coverage = mapped / total;

    // A handful of misses is expected (markdown lines that were never read, tokens the
    // voice split); a large share means the alignment itself is broken.
    const misses = words
      .map((w, i) => ({ word: w.node.data.slice(w.start, w.end), at: i, spoken: map[i] }))
      .filter((x) => x.spoken < 0)
      .slice(0, 12);

    console.log(
      JSON.stringify(
        {
          documentWoorden: total,
          gesprokenWoorden: spoken.length,
          gemapt: mapped,
          dekking: Number(coverage.toFixed(4)),
          eersteMissers: misses.map((m) => m.word),
          // Monotonicity is what makes the karaoke cursor trustworthy: the spoken index
          // must only ever move forward as you read down the page.
          nietMonotoon: map.filter((m, i) => m >= 0 && i > 0 && map.slice(0, i).some((p) => p > m)).length,
        },
        null,
        1,
      ),
    );

    expect(coverage).toBeGreaterThan(0.95);
  });
});
