import type { LoadedFile } from "./types";
import { documentStorageUsage, documentStorageWarning, type DocumentStorageUsage } from "./document-budget";

export const DOCUMENT_SAVE_MS = 5000;
export const VERSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export interface DocumentBinding { id: string; source: string; hasUnappliedVersion: boolean; storage?: DocumentStorageUsage }
export interface DocumentVersion { id: string; createdAt: number; bytes: number }
export interface DocumentStore {
  open(file: LoadedFile): Promise<DocumentBinding>;
  save(id: string, change: { expected: string; source: string }): Promise<{ savedAt: number; storage?: DocumentStorageUsage }>;
  versions(id: string): Promise<DocumentVersion[]>;
  read(id: string, version: string): Promise<string>;
}
export interface DocumentStatus { state: "saved" | "pending" | "saving" | "error"; message: string; storage?: DocumentStorageUsage }

/** Only acknowledged writes advance the saved source. */
export class DocumentSession {
  private binding: DocumentBinding | null = null;
  private text = "";
  private saved = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private reported: Pick<DocumentStatus, "state" | "message"> = { state: "saved", message: "Saved." };
  constructor(private store: DocumentStore, private status: (status: DocumentStatus) => void) {}
  get source(): string { return this.text; }
  get dirty(): boolean { return this.binding != null && this.text !== this.saved; }
  get id(): string { return this.binding?.id ?? ""; }
  bind(binding: DocumentBinding | null): void {
    if (this.dirty || this.inFlight) throw new Error("Save the current document before switching.");
    this.dispose(); this.binding = binding; this.text = binding?.source ?? ""; this.saved = this.text;
    if (binding) this.timer = setInterval(() => { void this.saveOnce(); }, DOCUMENT_SAVE_MS);
    this.publish("saved", binding?.hasUnappliedVersion ? "Previous edits are available in Version history." : "Saved. Changed Markdown saves every 5 seconds.");
  }
  change(source: string): void {
    if (!this.binding) throw new Error("Open an editable Markdown document first.");
    if (source === this.text) return;
    this.text = source;
    this.publish(this.dirty ? "pending" : "saved", this.dirty ? "Changes pending. Autosave runs every 5 seconds." : "Saved.");
  }
  async flush(): Promise<boolean> {
    if (this.inFlight && !await this.inFlight) return false;
    while (this.dirty) { if (!await this.saveOnce()) return false; }
    return true;
  }
  private saveOnce(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    if (!this.binding || !this.dirty) return Promise.resolve(true);
    const id = this.binding.id, source = this.text, expected = this.saved;
    this.publish("saving", "Saving Markdown and version…");
    const write = this.writeSnapshot(id, { expected, source });
    this.inFlight = write.finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  private async writeSnapshot(id: string, change: { expected: string; source: string }): Promise<boolean> {
    try {
      const receipt = await this.store.save(id, change); this.saved = change.source;
      if (this.binding && receipt.storage) this.binding.storage = receipt.storage;
      this.publish(this.dirty ? "pending" : "saved", this.dirty ? "Newer changes pending." : "Saved with version history.");
      return true;
    } catch (error) {
      this.publish("error", `Not saved: ${String(error).replace(/\.\s*$/, "")}. Keep MARK open or export Markdown before closing.`);
      return false;
    }
  }
  refreshBudget(limitBytes: number): void {
    if (!this.binding?.storage) return;
    this.binding.storage = documentStorageUsage(this.binding.storage.usedBytes, limitBytes);
    this.publish(this.reported.state, this.reported.message);
  }
  private publish(state: DocumentStatus["state"], message: string): void {
    this.reported = { state, message };
    const storage = this.binding?.storage;
    const warning = documentStorageWarning(storage);
    const status = { state, message: warning ? `${message} ${warning}` : message };
    this.status(storage ? { ...status, storage } : status);
  }
  versions(): Promise<DocumentVersion[]> { return this.store.versions(this.id); }
  async readVersion(version: string): Promise<string> {
    const id = this.id, source = this.source;
    const text = await this.store.read(id, version);
    if (this.id !== id || this.source !== source) throw new Error("The document changed. Open version history again.");
    return text;
  }
  dispose(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }
}
