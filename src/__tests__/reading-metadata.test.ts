import { describe, expect, it, vi } from "vitest";
import { ReadingMetadata, summarizeReading } from "../reading-metadata";

describe("reading metadata", () => {
  it("counts whitespace-delimited words without treating whitespace as a word", () => {
    expect(summarizeReading(" \t\r\n ")).toBe("Empty");
    expect(summarizeReading("one\t two\r\nthree")).toBe("3 words · 1 min");
    expect(summarizeReading("word ".repeat(440))).toBe("440 words · 2 min");
  });

  it("does not scan a large document for each input or save-status event", () => {
    const summarize = vi.fn(summarizeReading);
    const metadata = new ReadingMetadata(summarize);
    metadata.describe({ id: "book", source: "word ".repeat(200_000) }, "saved");
    for (let input = 0; input < 100; input++) {
      metadata.describe({ id: "book", source: `new source ${input}` }, "pending");
    }
    metadata.describe({ id: "book", source: "new source 99" }, "saving");
    metadata.describe({ id: "book", source: "new source 99" }, "error");
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(metadata.describe({ id: "book", source: "new source 99" }, "saved")).toBe("3 words · 1 min");
    metadata.describe({ id: "book", source: "new source 99" }, "saved");
    expect(summarize).toHaveBeenCalledTimes(2);
  });

  it("counts a newly opened file even if the previous file has pending changes", () => {
    const metadata = new ReadingMetadata();
    metadata.describe({ id: "first", source: "original" }, "saved");
    expect(metadata.describe({ id: "first", source: "new words" }, "pending")).toBe("1 word · 1 min");
    expect(metadata.describe({ id: "second", source: "new words" }, "pending")).toBe("2 words · 1 min");
    expect(metadata.describe({ id: "second", source: "" }, "saved")).toBe("Empty");
  });
});
