import type { FileKind } from "../types";
import type { SourceBlock } from "../share";
import type { FileNote } from "../file-notes";

export interface SourcePassage { id: string; startLine: number; endLine: number }
export interface RenderedFileNote extends FileNote { domId: string }

export interface SourceTask {
  id: string;
  startLine: number;
  markdown: string;
  checked: boolean;
}
export interface RenderedSource {
  html: string; blocks: SourceBlock[]; tasks: SourceTask[];
  passages?: SourcePassage[]; notes?: RenderedFileNote[];
}

/** A pluggable renderer. New formats (e.g. plain text) implement this. */
export interface DocRenderer {
  readonly id: string;
  readonly kind: FileKind;
  /** Render source text to sanitized HTML. */
  render(source: string): string;
  renderWithSource?(source: string): RenderedSource;
  /** Rebuild internal state when parse-affecting settings change. */
  rebuild(): void;
}
