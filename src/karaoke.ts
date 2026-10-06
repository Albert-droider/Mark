// Word-for-word karaoke: follow the audio and highlight the spoken word.
//
// The timeline comes from `<naam>.words.json` (written by
// `D:\School\Geschiedenis\scripts\maak_audio.py --timing`, edge-tts with
// `boundary="WordBoundary"`). The spoken word list is NOT the document word list:
// the narrating script strips markdown markers, expands abbreviations
// ("bv." -> "bijvoorbeeld") and the voice sometimes splits a token. So the two
// lists are aligned by content, never by index.

export interface SpokenWord {
  /** The word as spoken. */
  w: string;
  /** Start in seconds. */
  t: number;
  /** Duration in seconds. */
  d: number;
}

export interface Timing {
  stem?: string;
  rate?: string;
  duur?: number;
  woorden: SpokenWord[];
}

export interface DocWord {
  /** Where this word sits in the document. */
  node: Text;
  start: number;
  end: number;
  /** Index in the timing list, or -1 when nothing was spoken for it. */
  spoken: number;
}

const WORDS_PER_TIME = /\p{L}[\p{L}\p{N}'’·-]*|\d[\d.,]*/gu;

/** Comparable form of a word: lowercase, no surrounding punctuation. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Words of a plain string, in order. */
export function wordsOf(text: string): string[] {
  const out = (text.match(WORDS_PER_TIME) || []).map(normalizeWord).filter(Boolean);
  return out;
}

/**
 * Map every document word onto a spoken word, in order.
 *
 * Greedy two-pointer with a look-ahead resync: after a mismatch it searches a small
 * window on both sides for a run of matching words and jumps there. That absorbs the
 * insertions and deletions the narration introduces (expanded abbreviations, split
 * tokens, markdown lines that were never read) without needing a full LCS over
 * thousands of words.
 */
export function alignWords(doc: string[], spoken: string[], lookahead = 12): number[] {
  const map = new Array<number>(doc.length).fill(-1);
  let i = 0;
  let j = 0;
  while (i < doc.length && j < spoken.length) {
    if (doc[i] === spoken[j]) {
      map[i] = j;
      i++;
      j++;
      continue;
    }
    const jump = findResync(doc, spoken, i, j, lookahead);
    if (jump) {
      i += jump.doc;
      j += jump.spoken;
      continue;
    }
    // No resync nearby: drop whichever side looks like the extra one.
    if (spoken[j + 1] === doc[i]) j++; // an extra spoken word
    else i++; // a document word that was never read
  }
  return map;
}

function findResync(doc: string[], spoken: string[], i: number, j: number, lookahead: number) {
  for (let a = 0; a <= lookahead; a++) {
    for (let b = 0; b <= lookahead; b++) {
      if (a === 0 && b === 0) continue;
      const docWord = doc[i + a];
      const spokenWord = spoken[j + b];
      if (!docWord || !spokenWord || docWord !== spokenWord) continue;
      // A single common word ("de", "een") is not a resync. Demand that the run
      // continues, unless one of the two lists simply ends here.
      const nextDoc = doc[i + a + 1];
      const nextSpoken = spoken[j + b + 1];
      if (nextDoc && nextSpoken && nextDoc !== nextSpoken) continue;
      return { doc: a, spoken: b };
    }
  }
  return null;
}

/** The timeline words for a document: `{w, t, d}` in the order they were spoken. */
export function parseTiming(json: string): SpokenWord[] {
  const parsed = JSON.parse(json) as Timing;
  const words = Array.isArray(parsed?.woorden) ? parsed.woorden : [];
  return words.filter((w) => w && typeof w.t === "number" && typeof w.w === "string");
}

/**
 * Collect the document's words in reading order, remembering where each one sits so
 * it can be highlighted in place.
 */
export function collectDocumentWords(scope: HTMLElement): DocWord[] {
  const words: DocWord[] = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    // Footnote markers, code language labels and KaTeX's own spans are not what was
    // read aloud; counting them would throw the alignment off.
    if (parent && !parent.closest(".katex, .code-lang, .header-anchor, .hl-toolbar")) {
      for (const match of node.data.matchAll(WORDS_PER_TIME)) {
        words.push({
          node,
          start: match.index,
          end: match.index + match[0].length,
          spoken: -1,
        });
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return words;
}

/**
 * Index of the last document word spoken at or before `time`, scanning forward from
 * `from`. Unmapped words (no spoken counterpart) are skipped. Returns -1 when nothing
 * has been spoken yet — the caller then paints nothing.
 */
export function wordIndexAt(words: DocWord[], times: number[], time: number, from = 0): number {
  let best = -1;
  for (let i = Math.max(0, from); i < words.length; i++) {
    const spoken = words[i].spoken;
    if (spoken < 0 || spoken >= times.length) continue;
    if (times[spoken] > time) break; // times ascend, so nothing later can match either
    best = i;
  }
  return best;
}

export interface KaraokeDeps {
  /** Raw `<naam>.words.json` for a document, or null when there is none. */
  load: (docPath: string) => Promise<string | null>;
}

/**
 * Drives the highlight from the audio clock.
 *
 * Painting uses the CSS Custom Highlight API instead of wrapping words in elements:
 * inserting spans would split the text nodes that reader highlights (and their
 * positions) live on, and it would fight every document re-render. Chromium/WebView2
 * has it; where it is missing the karaoke simply doesn't paint.
 */
export class Karaoke {
  private scope: HTMLElement | null = null;
  private words: DocWord[] = [];
  private spoken: SpokenWord[] = [];
  private times: number[] = [];
  private map: number[] = [];
  private cursor = 0;
  private frame = 0;

  constructor(
    private audio: HTMLAudioElement,
    private deps: KaraokeDeps,
  ) {
    this.audio.addEventListener("timeupdate", () => this.tick());
    this.audio.addEventListener("seeking", () => this.tick(true));
    this.audio.addEventListener("play", () => this.startLoop());
    this.audio.addEventListener("pause", () => this.stopLoop());
    this.audio.addEventListener("ended", () => this.clear());
  }

  /** Follow a document: load its timeline and remember where its words are. */
  async setDocument(docPath: string, scope: HTMLElement | null, timingJson?: string | null): Promise<void> {
    this.scope = scope;
    this.spoken = [];
    this.words = [];
    this.map = [];
    this.times = [];
    this.cursor = 0;
    this.clear();
    if (!scope) return;
    const json = timingJson !== undefined ? timingJson : await this.deps.load(docPath).catch(() => null);
    if (!json) return;
    this.spoken = parseTiming(json);
    this.times = this.spoken.map((w) => w.t);
    this.realign(scope);
  }

  /** The document was re-rendered: the old text nodes are gone, so collect again. */
  rebuild(scope: HTMLElement): void {
    this.scope = scope;
    this.cursor = 0;
    this.realign(scope);
  }

  /** Audio changed (or nothing was found): make sure nothing stays highlighted. */
  clear(): void {
    const css = cssHighlights();
    if (css) css.delete("karaoke");
  }

  private realign(scope: HTMLElement): void {
    this.words = collectDocumentWords(scope);
    this.map = alignWords(
      this.words.map((w) => normalizeWord(w.node.data.slice(w.start, w.end))),
      this.spoken.map((w) => normalizeWord(w.w)),
    );
    this.words.forEach((word, index) => (word.spoken = this.map[index]));
  }

  private startLoop(): void {
    if (this.frame) return;
    const step = () => {
      this.tick();
      this.frame = this.audio.paused ? 0 : requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private stopLoop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.clear();
  }

  private tick(seeked = false): void {
    if (!this.words.length || !this.scope) return;
    let index = wordIndexAt(this.words, this.times, this.audio.currentTime, seeked ? 0 : this.cursor);
    if (index < 0 && this.cursor > 0) {
      // The clock jumped backwards (scrub, or a `seeking` we never saw): the forward
      // scan from the old cursor finds nothing, so start over instead of going dark.
      this.cursor = 0;
      index = wordIndexAt(this.words, this.times, this.audio.currentTime, 0);
    }
    this.cursor = Math.max(0, index);
    const word = this.words[index];
    if (!word || word.spoken < 0) {
      this.clear();
      return;
    }
    this.paint(word);
  }

  private paint(word: DocWord): void {
    const css = cssHighlights();
    if (!css) return;
    const range = document.createRange();
    range.setStart(word.node, word.start);
    range.setEnd(word.node, word.end);
    css.set("karaoke", new Highlight(range));
    this.follow(range);
  }

  /** Keep the spoken word on screen, but never yank the reader back while it is visible. */
  private follow(range: Range): void {
    const scroller = this.scope?.closest(".workspace") as HTMLElement | null;
    if (!scroller) return;
    const rect = range.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const margin = 48;
    if (rect.top >= view.top + margin && rect.bottom <= view.bottom - margin) return;
    (range.startContainer.parentElement as HTMLElement | null)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

function cssHighlights(): HighlightRegistry | null {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  return registry && typeof Highlight !== "undefined" ? registry : null;
}
