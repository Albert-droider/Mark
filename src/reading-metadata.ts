import type { DocumentStatus } from "./document-session";

interface ReadingSource { id: string; source: string }

/** Avoid allocating a word array for large books. */
export function summarizeReading(source: string): string {
  let words = 0;
  for (const _word of source.matchAll(/\S+/g)) words++;
  if (words === 0) return "Empty";
  const minutes = Math.max(1, Math.round(words / 220));
  return `${words.toLocaleString()} ${words === 1 ? "word" : "words"} · ${minutes} min`;
}

/** Reading time describes acknowledged content, not every keystroke. */
export class ReadingMetadata {
  private id = "";
  private source = "";
  private summary = "Empty";
  constructor(private summarize: (source: string) => string = summarizeReading) {}

  describe(file: ReadingSource, state: DocumentStatus["state"]): string {
    const newlyOpened = file.id !== this.id;
    const newlySaved = state === "saved" && file.source !== this.source;
    if (newlyOpened || newlySaved) {
      this.id = file.id;
      this.source = file.source;
      this.summary = this.summarize(file.source);
    }
    return this.summary;
  }
}
