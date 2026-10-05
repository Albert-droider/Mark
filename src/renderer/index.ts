import type { DocRenderer } from "./base";
import type { FileKind } from "../types";
import { MarkdownRenderer } from "./markdown";
import { TextRenderer } from "./text";

const markdown = new MarkdownRenderer();
const text = new TextRenderer();

/** Returns the renderer for a given file kind. */
export function getRenderer(kind: FileKind): DocRenderer {
  return kind === "text" ? text : markdown;
}

/** Rebuild renderers when parse-affecting settings change. */
export function rebuildRenderers(): void {
  markdown.rebuild();
  // text renderer has nothing to rebuild
}

/** List of renderable kinds (used by file pickers / drop handlers). */
export function detectKind(name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop() || "";
  if (["md", "markdown", "mdown", "mkd", "mkdn", "mdx"].includes(ext)) return "markdown";
  return "text";
}

export type { DocRenderer };
