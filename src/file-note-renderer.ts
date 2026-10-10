import type MarkdownIt from "markdown-it";
import { FileNoteReader } from "./file-notes";
import type { RenderedFileNote, SourcePassage } from "./renderer/base";

export interface FileNoteRender {
  reader: FileNoteReader; offset: number; notes: RenderedFileNote[]; passages: SourcePassage[];
}
interface NoteEnv { fileNotes?: FileNoteRender }
export function fileNoteRender(source: string, offset: number): FileNoteRender {
  return { reader: new FileNoteReader(source), offset, notes: [], passages: [] };
}

/** Only real parsed blocks supply placement/edit authority; authored HTML cannot. */
export function installFileNotes(md: MarkdownIt): void {
  md.block.ruler.before("html_block", "mark-file-note", (state, start, _end, silent) => {
    const env = (state.env as NoteEnv).fileNotes;
    if (!env || state.level !== 0 || state.sCount[start] !== 0) return false;
    const note = env.reader.read(start + env.offset + 1);
    if (!note) return false;
    if (silent) return true;
    const domId = `note-${crypto.randomUUID()}`;
    env.notes.push({ ...note, domId });
    const token = state.push("mark_file_note", "", 0); token.meta = { note, domId };
    state.line = note.endLine - env.offset;
    return true;
  });
  // File-owned note data is not a visible block, even at the file end.
  md.renderer.rules.mark_file_note = () => "";
  for (const name of ["paragraph_open", "heading_open", "bullet_list_open", "ordered_list_open", "blockquote_open"]) {
    const previous = md.renderer.rules[name];
    md.renderer.rules[name] = (tokens, index, options, value, renderer) => {
      const env = (value as NoteEnv).fileNotes, token = tokens[index];
      if (env && token.level === 0 && token.map && !token.hidden) {
        const id = `passage-${crypto.randomUUID()}`;
        env.passages.push({ id, startLine: token.map[0] + env.offset + 1, endLine: token.map[1] + env.offset });
        token.attrSet("data-mark-passage", id);
      }
      return previous ? previous(tokens, index, options, value, renderer) : renderer.renderToken(tokens, index, options);
    };
  }
}
