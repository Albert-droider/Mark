import type { FileKind } from "../types";

/** A pluggable renderer. New formats (e.g. plain text) implement this. */
export interface DocRenderer {
  readonly id: string;
  readonly kind: FileKind;
  /** Render source text to sanitized HTML. */
  render(source: string): string;
  /** Rebuild internal state when parse-affecting settings change. */
  rebuild(): void;
}
