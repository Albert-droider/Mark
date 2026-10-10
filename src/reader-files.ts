import type { LoadedFile } from "./types";
import type { FileService } from "./files";
import { blobToLoaded } from "./files";
import type { ReaderDocuments } from "./reader-documents";
import type { DocumentHistory } from "./document-history";
import type { Viewer } from "./viewer";
import type { ReaderNavigation } from "./reader-navigation";
import type { ReaderChrome } from "./reader-chrome";
import type { RecentFiles } from "./recent";
import type { exportText } from "./export-text";

export interface ReaderFileServices {
  files: FileService; documents: Pick<ReaderDocuments, "open" | "close" | "canReload">;
  history: Pick<DocumentHistory, "hide">; viewer: Pick<Viewer, "file" | "render" | "clear">;
  navigation: Pick<ReaderNavigation, "flushPosition" | "opened" | "reset" | "ratio" | "paint">;
  chrome: Pick<ReaderChrome, "setFile" | "hideMenus">; recent: Pick<RecentFiles, "refresh">;
  desktop: boolean; recentPaths(): string[]; addRecent(path: string): void;
  removeRecent(path: string): void; forgetPlace(path: string): void;
  refreshMetadata(): void; refreshChrome(): void; report(message: string): void;
  exportText: typeof exportText;
}
/** Owns latest-request wins and acknowledged file transitions. */
export class ReaderFiles {
  private openToken = 0;
  constructor(private services: ReaderFileServices) {}
  get hasRequests(): boolean { return this.openToken > 0; }
  openBlob(file: File): void {
    const token = ++this.openToken;
    void blobToLoaded(file).then(loaded => this.showFile(loaded, token)).catch(error => {
      if (token === this.openToken) this.services.report(String(error));
    });
  }


  async openPicker(): Promise<void> {
    const token = ++this.openToken;
    try {
      const f = await this.services.files.pick();
      if (!f || token !== this.openToken) return;
      await this.showFile(f, token);
    } catch (err) {
      if (token === this.openToken) this.services.report(String(err));
    }
  }


  async openPath(path: string): Promise<void> {
    const token = ++this.openToken;
    try {
      const f = await this.services.files.readPath(path);
      if (token !== this.openToken) return;
      await this.showFile(f, token);
    } catch (err) {
      if (token !== this.openToken) return;
      this.services.report("Could not open: " + String(err));
      if (isMissing(err)) this.dropRecent(path);
    }
  }


  resumeLast(): void {
    const path = this.services.recentPaths()[0];
    if (path && this.services.desktop) void this.openPath(path);
  }


  private async showFile(requested: LoadedFile, token = ++this.openToken): Promise<void> {
    if (token !== this.openToken) return;
    const f = await this.services.documents.open(requested, () => token === this.openToken);
    if (!f || token !== this.openToken) return;
    this.services.history.hide();
    this.services.navigation.flushPosition();
    this.services.viewer.render(f);
    this.services.chrome.setFile(f);
    this.services.refreshMetadata();
    if (f.path) this.services.addRecent(f.path);
    this.services.recent.refresh();
    this.services.chrome.hideMenus();
    this.services.navigation.opened(f);
    this.services.refreshChrome();
  }


  async closeFile(): Promise<void> {
    const token = ++this.openToken;
    if (!this.services.viewer.file || !await this.services.documents.close(() => token === this.openToken)) return;
    this.services.history.hide();
    this.services.navigation.flushPosition();
    this.services.viewer.clear(); this.services.navigation.reset();
    this.services.chrome.setFile(null); this.services.refreshChrome();
  }


  async reloadCurrent(): Promise<boolean> {
    const file = this.services.viewer.file;
    if (!file?.path) {
      this.services.report(file ? "This file isn't on disk." : "Open a file first.");
      return false;
    }
    if (!this.services.documents.canReload) return false;
    return this.reloadPath(file, this.openToken, this.services.navigation.ratio());
  }


  private async reloadPath(file: LoadedFile, token: number, ratio: number): Promise<boolean> {
    try {
      const read = await this.services.files.readPath(file.path);
      if (token !== this.openToken || !this.services.documents.canReload) return false;
      if (read.source === this.services.viewer.file?.source) return true;
      const f = await this.services.documents.open(read, () => token === this.openToken && this.services.documents.canReload);
      if (!f) return false;
      this.services.history.hide(); this.services.viewer.render(f);
      this.services.refreshMetadata(); this.services.navigation.paint(ratio);
      return true;
    } catch (err) {
      if (token !== this.openToken) return false;
      this.services.report(String(err));
      if (isMissing(err)) this.dropRecent(file.path);
      return false;
    }
  }


  async exportDocument(): Promise<void> {
    const file = this.services.viewer.file;
    if (!file || file.kind !== "markdown") return;
    try {
      const result = await this.services.exportText(file.source, file.name.replace(/\.[^.]+$/, "") + "-export", "markdown");
      this.services.report(result === "cancelled" ? "Export cancelled." : result === "saved" ? "Current Markdown saved to a new file." : "Current Markdown download requested. No upload was made.");
    } catch (error) { this.services.report(`Export failed: ${String(error)}. Keep MARK open.`); }
  }


  dropRecent(path: string): void {
    this.services.removeRecent(path);
    this.services.forgetPlace(path);
    this.services.recent.refresh();
  }
}
function isMissing(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("os error 2") || message.includes("cannot find") || message.includes("not found") || message.includes("no such file");
}
