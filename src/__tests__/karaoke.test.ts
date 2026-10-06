import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alignWords,
  collectDocumentWords,
  normalizeWord,
  parseTiming,
  wordIndexAt,
  wordsOf,
  Karaoke,
} from "../karaoke";

describe("normalizeWord", () => {
  it("drops surrounding punctuation and lowercases", () => {
    expect(normalizeWord("Studietaak,")).toBe("studietaak");
    expect(normalizeWord("(pijnappelklier)")).toBe("pijnappelklier");
    expect(normalizeWord("Descartes.")).toBe("descartes");
  });

  it("keeps what is inside a word", () => {
    expect(normalizeWord("l’Homme-machine")).toBe("l’homme-machine");
  });
});

describe("wordsOf", () => {
  it("keeps digits but not markdown markers", () => {
    expect(wordsOf("## Hoofdstuk 5: **experimentele** psychologie")).toEqual([
      "hoofdstuk",
      "5",
      "experimentele",
      "psychologie",
    ]);
  });
});

describe("alignWords", () => {
  it("maps identical lists one to one", () => {
    expect(alignWords(["a", "b", "c"], ["a", "b", "c"])).toEqual([0, 1, 2]);
  });

  it("absorbs a spoken word the document does not have", () => {
    // "bv." is read aloud as "bijvoorbeeld": the document word gets no time, and the
    // alignment picks the thread back up at the next word.
    expect(alignWords(["zie", "bv", "hier"], ["zie", "bijvoorbeeld", "hier"])).toEqual([0, -1, 2]);
  });

  it("absorbs a document word that was never read", () => {
    // A blockquote source line survives in the document but not in the audio.
    expect(alignWords(["a", "bron", "b"], ["a", "b"])).toEqual([0, -1, 1]);
  });

  it("resyncs after a longer insertion", () => {
    const doc = ["een", "twee", "drie", "vier", "vijf"];
    const spoken = ["een", "twee", "tweeënhalf", "drie", "vier", "vijf"];
    expect(alignWords(doc, spoken)).toEqual([0, 1, 3, 4, 5]);
  });

  it("does not let one common word fake a resync", () => {
    // "de" appears on both sides by coincidence; a real jump needs two matches in a row.
    const doc = ["de", "eerste", "zin", "de", "tweede", "zin"];
    const spoken = ["de", "eerste", "zin", "de", "tweede", "zin"];
    expect(alignWords(doc, spoken)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("parseTiming", () => {
  it("keeps usable entries and drops junk", () => {
    const json = JSON.stringify({ woorden: [{ w: "een", t: 0.1, d: 0.2 }, { w: "twee" }, null, { w: "drie", t: 1 }] });
    expect(parseTiming(json).map((w) => w.w)).toEqual(["een", "drie"]);
  });

  it("survives an empty or odd file", () => {
    expect(parseTiming("{}")).toEqual([]);
  });
});

describe("collectDocumentWords", () => {
  it("walks the document in order and remembers positions", () => {
    const scope = document.createElement("div");
    scope.innerHTML = "<p>Radboud de <strong>Eerste</strong>.</p><p>Tweede regel.</p>";
    const words = collectDocumentWords(scope);
    expect(words.map((w) => w.node.data.slice(w.start, w.end))).toEqual([
      "Radboud",
      "de",
      "Eerste",
      "Tweede",
      "regel",
    ]);
  });

  it("skips KaTeX and code labels", () => {
    const scope = document.createElement("div");
    scope.innerHTML = '<p>kern <span class="katex">E=mc2</span> <span class="code-lang">ts</span> klaar</p>';
    expect(collectDocumentWords(scope).map((w) => w.node.data.slice(w.start, w.end))).toEqual([
      "kern",
      "klaar",
    ]);
  });
});

describe("wordIndexAt", () => {
  const words = collectDocumentWords(
    Object.assign(document.createElement("div"), { innerHTML: "<p>een twee drie vier</p>" }),
  );
  const times = [0, 1, 2, 3];
  words.forEach((word, i) => (word.spoken = i));

  it("finds the word being spoken", () => {
    expect(wordIndexAt(words, times, 0.2)).toBe(0);
    expect(wordIndexAt(words, times, 2.5)).toBe(2);
    expect(wordIndexAt(words, times, 99)).toBe(3);
  });

  it("returns -1 before anything is spoken", () => {
    expect(wordIndexAt(words, times, -5)).toBe(-1);
  });

  it("continues from the last position instead of rescanning", () => {
    expect(wordIndexAt(words, times, 2.5, 2)).toBe(2);
    expect(wordIndexAt(words, times, 3.1, 2)).toBe(3);
  });

  it("skips words that were never spoken", () => {
    const gap = collectDocumentWords(
      Object.assign(document.createElement("div"), { innerHTML: "<p>een bron twee</p>" }),
    );
    gap[0].spoken = 0; // een -> 0s
    gap[1].spoken = -1; // "bron" was not read aloud
    gap[2].spoken = 1; // twee -> 1s
    const t = [0, 1];
    expect(wordIndexAt(gap, t, 0.5)).toBe(0);
    expect(wordIndexAt(gap, t, 1.5)).toBe(2);
  });
});

describe("Karaoke", () => {
  let set: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    set = vi.fn();
    remove = vi.fn();
    (globalThis as any).CSS = { highlights: { set, delete: remove } };
    (globalThis as any).Highlight = class {
      constructor(public range: Range) {}
    };
  });

  const timing = JSON.stringify({
    woorden: [
      { w: "Radboud", t: 0.1, d: 0.3 },
      { w: "de", t: 0.5, d: 0.1 },
      { w: "Eerste", t: 0.7, d: 0.4 },
    ],
  });

  it("highlights the word the clock is on", async () => {
    const scope = document.createElement("div");
    scope.innerHTML = "<p>Radboud de Eerste.</p>";
    document.body.append(scope);
    const audio = document.createElement("audio");
    const karaoke = new Karaoke(audio, { load: async () => timing });
    await karaoke.setDocument("D:/ws/h01.md", scope);

    audio.currentTime = 0.8;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(set).toHaveBeenCalledTimes(1);
    const range = (set.mock.calls[0][1] as { range: Range }).range;
    expect(set.mock.calls[0][0]).toBe("karaoke");
    expect(range.toString()).toBe("Eerste");
  });

  it("clears the highlight when the document has no timeline", async () => {
    const scope = document.createElement("div");
    scope.innerHTML = "<p>Radboud de Eerste.</p>";
    const audio = document.createElement("audio");
    const karaoke = new Karaoke(audio, { load: async () => null });
    await karaoke.setDocument("D:/ws/h02.md", scope);
    audio.currentTime = 0.8;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(set).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("karaoke");
  });

  it("keeps working after the document is re-rendered", async () => {
    const scope = document.createElement("div");
    scope.innerHTML = "<p>Radboud de Eerste.</p>";
    document.body.append(scope);
    const audio = document.createElement("audio");
    const karaoke = new Karaoke(audio, { load: async () => timing });
    await karaoke.setDocument("D:/ws/h01.md", scope);

    scope.innerHTML = "<p>Radboud de Eerste.</p>"; // a settings change rebuilds the document
    karaoke.rebuild(scope);

    audio.currentTime = 0.8;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("picks the thread back up when the clock jumps backwards", async () => {
    const scope = document.createElement("div");
    scope.innerHTML = "<p>Radboud de Eerste.</p>";
    document.body.append(scope);
    const audio = document.createElement("audio");
    const karaoke = new Karaoke(audio, { load: async () => timing });
    await karaoke.setDocument("D:/ws/h01.md", scope);

    audio.currentTime = 0.8;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(((set.mock.calls[0][1] as { range: Range }).range).toString()).toBe("Eerste");

    // Scrubbing back: the forward scan from the old cursor finds nothing, so the
    // highlight must not go dark until the next `seeking` event.
    audio.currentTime = 0.2;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(set).toHaveBeenCalledTimes(2);
    expect(((set.mock.calls[1][1] as { range: Range }).range).toString()).toBe("Radboud");
  });

  it("does not paint before the timeline is loaded", async () => {
    const scope = document.createElement("div");
    scope.innerHTML = "<p>Radboud de Eerste.</p>";
    const audio = document.createElement("audio");
    const karaoke = new Karaoke(audio, { load: async () => null });
    await karaoke.setDocument("D:/ws/h03.md", scope);
    audio.dispatchEvent(new Event("play"));
    expect(set).not.toHaveBeenCalled();
  });
});
