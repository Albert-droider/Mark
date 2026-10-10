import type { Anchor } from "./highlights";
export interface NewFileNote { id: string; quote: string; text: string; anchors?: Anchor[] }
export interface FileNote extends NewFileNote {
  startLine: number; endLine: number; startOffset: number; endOffset: number; markdown: string;
}
const OPEN = "<!-- mark:note ";
const CLOSE = "<!-- /mark:note -->";

function readHeader(line: string): Pick<NewFileNote, "id" | "quote" | "anchors"> | null {
  if (!line.startsWith(OPEN) || !line.endsWith(" -->")) return null;
  try {
    const value: unknown = JSON.parse(line.slice(OPEN.length, -4));
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
      || !("id" in value) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id)
      || !("quote" in value) || typeof value.quote !== "string") return null;
    if ("anchors" in value && (!Array.isArray(value.anchors) || !value.anchors.every(anchor => anchor && typeof anchor === "object"
      && typeof anchor.text === "string" && typeof anchor.prefix === "string" && typeof anchor.suffix === "string"))) return null;
    return { id: value.id, quote: value.quote, ...("anchors" in value ? { anchors: value.anchors as Anchor[] } : {}) };
  } catch { return null; }
}
function noteMarkdown(note: NewFileNote, eol: string): string {
  const header = JSON.stringify({ version: 1, id: note.id, quote: note.quote, ...(note.anchors ? { anchors: note.anchors } : {}) })
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  if (!readHeader(`${OPEN}${header} -->`)) throw new Error("Invalid note metadata.");
  return [`${OPEN}${header} -->`, "> [!NOTE]", ...note.text.split(/\r?\n/).map(line => `> ${line}`), CLOSE].join(eol);
}

/** Index once per parse, rather than rescanning an entire book for every note. */
export class FileNoteReader {
  private offsets = [0];
  constructor(private source: string) {
    for (let at = source.indexOf("\n"); at >= 0; at = source.indexOf("\n", at + 1)) this.offsets.push(at + 1);
    this.offsets.push(source.length);
  }
  offset(line: number): number {
    if (!Number.isInteger(line) || line < 1 || line > this.offsets.length) throw new Error("Invalid note source line.");
    return this.offsets[line - 1];
  }
  private line(number: number): string { return this.source.slice(this.offset(number), this.offset(number + 1)).replace(/\r?\n$/, ""); }
  read(startLine: number): FileNote | null {
    if (startLine + 2 >= this.offsets.length) return null;
    const header = readHeader(this.line(startLine));
    if (!header || this.line(startLine + 1) !== "> [!NOTE]") return null;
    const body: string[] = [];
    for (let line = startLine + 2; line < this.offsets.length; line++) {
      const value = this.line(line);
      if (value === CLOSE) {
        const startOffset = this.offset(startLine), endOffset = this.offset(line + 1);
        return { ...header, text: body.join("\n"), startLine, endLine: line, startOffset, endOffset,
          markdown: this.source.slice(startOffset, endOffset) };
      }
      if (!value.startsWith("> ") && value !== ">") return null;
      body.push(value === ">" ? "" : value.slice(2));
    }
    return null;
  }
}

/** Metadata stays invisible; the body remains a portable Markdown callout. */
export function insertFileNote(source: string, afterLine: number, note: NewFileNote): string {
  const at = new FileNoteReader(source).offset(afterLine + 1), eol = source.includes("\r\n") ? "\r\n" : "\n";
  const before = source.slice(0, at), after = source.slice(at);
  const gap = before.length ? before.endsWith(eol + eol) ? "" : before.endsWith(eol) ? eol : eol + eol : "";
  return before + gap + noteMarkdown(note, eol) + eol + (after ? eol + after : "");
}
export function readFileNote(source: string, startLine: number): FileNote | null { return new FileNoteReader(source).read(startLine); }
function replaceNote(source: string, note: FileNote, markdown: string): string {
  if (source.slice(note.startOffset, note.endOffset) !== note.markdown) throw new Error("The note source changed. Reopen the note before editing.");
  return source.slice(0, note.startOffset) + markdown + source.slice(note.endOffset);
}
/** An exact-snapshot guard protects unrelated source, including whitespace and BOM. */
export function updateFileNote(source: string, note: FileNote, text: string): string {
  const eol = note.markdown.includes("\r\n") ? "\r\n" : "\n";
  return replaceNote(source, note, noteMarkdown({ ...note, text }, eol) + (note.markdown.endsWith("\n") ? eol : ""));
}
export function removeFileNote(source: string, note: FileNote): string { return replaceNote(source, note, ""); }
