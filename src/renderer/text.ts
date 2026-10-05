import type { DocRenderer } from "./base";
import type { FileKind } from "../types";
import { escapeHtml } from "../util";
import DOMPurify from "dompurify";

/** Minimal plain-text renderer. Keeps the door open for a "text reader" mode. */
export class TextRenderer implements DocRenderer {
  readonly id = "text";
  readonly kind: FileKind = "text";

  render(source: string): string {
    const body = escapeHtml(source);
    return DOMPurify.sanitize(
      `<pre class="plain-text"><code>${body}</code></pre>`
    );
  }

  rebuild(): void {
    /* nothing to rebuild */
  }
}
