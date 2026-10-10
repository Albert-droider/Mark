import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";
import type { BackupResult } from "./backup";

export type TextExportKind = "markdown" | "csv" | "context";
const EXTENSIONS: Record<TextExportKind, string> = { markdown: "md", csv: "csv", context: "json" };
export function exportFilename(name: string, kind: TextExportKind): string {
  const clean = name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^[. ]+|[. ]+$/g, "");
  let stem = "", bytes = 0;
  for (const character of clean) {
    bytes += new TextEncoder().encode(character).length;
    if (bytes > 120) break;
    stem += character;
  }
  stem = stem.replace(/[. ]+$/g, "") || "MARK-export";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `MARK-${stem}`;
  return `${stem}.${EXTENSIONS[kind]}`;
}

/** Desktop returns only after an exclusive new-file write; browser only requests a download. */
export async function exportText(contents: string, name: string, kind: TextExportKind): Promise<BackupResult> {
  const filename = exportFilename(name, kind);
  if (isTauri) {
    const path = await invoke<string | null>("export_reader_text", { contents, name: filename, kind });
    return path ? "saved" : "cancelled";
  }
  const mime = kind === "context" ? "application/json" : kind === "csv" ? "text/csv" : "text/markdown";
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.append(link);
  try { link.click(); return "requested"; }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}
