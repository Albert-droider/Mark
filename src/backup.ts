import { isTauri } from "./platform";

export type BackupResult = "saved" | "requested" | "cancelled";

/** Browser downloads cannot acknowledge a filesystem write; desktop exports can. */
export async function saveReaderBackup(contents: string): Promise<BackupResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string | null>("export_reader_backup", { contents });
    return path ? "saved" : "cancelled";
  }
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `mark-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return "requested";
}
