/** Legacy reader storage only; the workspace repository is a later decision. */
export const LEGACY_KEYS = ["mark.settings.v1", "mark.recent.v1", "mark.positions.v1",
  "mark.highlights.v1", "mark.audio.v1", "mark.outline.v1", "mark.drafts.v1"] as const;
export const BACKUP_KEY = "mark.backup.v1";
export const STORAGE_EVENT = "mark:storage-status";

export class ReaderStorageError extends Error {
  constructor(readonly key: string, readonly operation: "read" | "write" | "corrupt" | "backup", message: string) {
    super(`${key}: ${message}`);
    this.name = "ReaderStorageError";
  }
}

const issues = new Map<string, string>();
export function storageIssues(): string[] { return [...issues.values()]; }
export function reportStorageIssue(error: unknown, key = "reader"): string {
  const message = error instanceof Error ? error.message : String(error);
  const id = error instanceof ReaderStorageError ? error.key : key;
  if (issues.get(id) !== message) {
    issues.set(id, message);
    document.dispatchEvent(new Event(STORAGE_EVENT));
  }
  return message;
}
export function clearStorageIssue(key: string): void {
  if (issues.delete(key)) document.dispatchEvent(new Event(STORAGE_EVENT));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch { throw new ReaderStorageError(key, "read", "Storage is unavailable. Export what is readable before closing MARK."); }
}
export function readStored<T>(key: string, valid: (value: unknown) => value is T, empty: () => T): T {
  const raw = readRaw(key);
  if (raw === null) return empty();
  try {
    const value: unknown = JSON.parse(raw);
    if (valid(value)) return value;
  } catch { /* preserve the original raw value */ }
  throw new ReaderStorageError(key, "corrupt", "Stored data is invalid or unsupported. It was not replaced. Export a backup to recover it.");
}

export interface ReaderBackup {
  format: "mark-reader-backup";
  version: 1;
  createdAt: string;
  includesSourceFiles: false;
  complete: boolean;
  entries: Record<string, string | null>;
  errors: { key: string; message: string }[];
}

/** Do not call normalized getters: some legacy getters migrate on read. */
export function captureReaderBackup(): ReaderBackup {
  const keys = new Set<string>(LEGACY_KEYS);
  const errors: ReaderBackup["errors"] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("mark.")) keys.add(key);
    }
  } catch { errors.push({ key: "*", message: "Could not enumerate storage; unknown MARK keys may be missing." }); }
  const entries: Record<string, string | null> = Object.create(null);
  for (const key of [...keys].sort()) {
    try { entries[key] = readRaw(key); }
    catch (error) { errors.push({ key, message: error instanceof Error ? error.message : String(error) }); }
  }
  return { format: "mark-reader-backup", version: 1, createdAt: new Date().toISOString(),
    includesSourceFiles: false, complete: errors.length === 0, entries, errors };
}

function validBackup(value: unknown): value is ReaderBackup {
  return isRecord(value) && value.format === "mark-reader-backup" && value.version === 1
    && value.complete === true && isRecord(value.entries)
    && Object.values(value.entries).every((v) => v === null || typeof v === "string");
}

/** Retain the exact pre-upgrade values once. This quota-limited copy is not a
 *  substitute for the user-owned downloaded backup. Never overwrite it. */
function ensureBackup(): void {
  if (readRaw(BACKUP_KEY) !== null) {
    readStored(BACKUP_KEY, validBackup, () => { throw new Error("Missing backup"); });
    return;
  }
  const backup = captureReaderBackup();
  if (!backup.complete) throw new ReaderStorageError(BACKUP_KEY, "backup", "Could not make a complete pre-change copy. Export the readable data first.");
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(backup)); }
  catch { throw new ReaderStorageError(BACKUP_KEY, "backup", "Backup could not be stored. Changes are not saved; download a backup and keep this window open."); }
}

export function writeStored(key: string, value: unknown): void {
  ensureBackup();
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new ReaderStorageError(key, "write", "Could not save. Keep this window open, export your work, and retry when storage is available."); }
  clearStorageIssue(key);
  clearStorageIssue(BACKUP_KEY);
}
