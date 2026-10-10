import type { FileKind } from "../types";
import type { SourceBlock } from "../share";

/** A pluggable renderer. New formats (e.g. plain text) implement this. */
export interface DocRenderer {
  readonly id: string;
  readonly kind: FileKind;
  /** Render source text to sanitized HTML. */
  render(source: string): string;
  renderWithSource?(source: string): { html: string; blocks: SourceBlock[] };
  /** Rebuild internal state when parse-affecting settings change. */
  rebuild(): void;
}
