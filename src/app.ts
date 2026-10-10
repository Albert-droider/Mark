import { Viewer } from "./viewer";
import { SettingsPanel } from "./settings";
import { RecentFiles } from "./recent";
import { ReaderDocuments } from "./reader-documents";
import { createDocumentStore } from "./document-store";
import { documentStorageWarning, MEBIBYTE } from "./document-budget";
import { DocumentHistory } from "./document-history";
import type { DocumentSession, DocumentStatus } from "./document-session";
import type { SourceChangePhase } from "./in-place-reader";
import { ReadingMetadata } from "./reading-metadata";
import { exportText } from "./export-text";
import { getFileService } from "./files";
import { getSettings, updateSettings, onSettings, getRecent, pushRecent, removeRecent, forgetPlace } from "./store";
import { resolvedMode } from "./themes";
import { isTauri } from "./platform";
import type { CommandId } from "./commands";
import { ReaderChrome } from "./reader-chrome";
import { ReaderNavigation } from "./reader-navigation";
import { ReaderFiles } from "./reader-files";
import { ReaderAppearance, type ReaderPreferences } from "./reader-appearance";
import { ReaderShortcuts } from "./reader-shortcuts";
import { ReaderHost } from "./reader-host";

/** Composition root: focused collaborators own UI, navigation, files and platform events. */
export class App {
  private viewer = new Viewer();
  private panel = new SettingsPanel();
  private recent = new RecentFiles({
    openPath: path => { void this.files.openPath(path); },
    placeKey: () => this.navigation.session.key,
  });
  private chrome!: ReaderChrome;
  private navigation!: ReaderNavigation;
  private files!: ReaderFiles;
  private appearance!: ReaderAppearance;
  private shortcuts!: ReaderShortcuts;
  private host!: ReaderHost;
  private documents!: ReaderDocuments;
  private sourceSession!: DocumentSession;
  private history!: DocumentHistory;
  private documentStatus: DocumentStatus | null = null;
  private storageWarningFor = "";
  private readingMetadata = new ReadingMetadata();

  constructor(private preferences: ReaderPreferences = { read: getSettings, update: updateSettings, subscribe: onSettings }) {
    this.configureNavigation(); this.configureHost(); this.configureChrome();
    this.configureDocuments(); this.configureFiles(); this.configureAppearance();
    this.configureShortcuts(); this.bindViewer(); this.bindRecent();
  }
  private configureNavigation(): void {
    this.navigation = new ReaderNavigation(this.viewer, {
      reloadCurrent: () => this.files.reloadCurrent(), missing: path => this.files.dropRecent(path),
      refreshChrome: () => this.refreshChrome(), progress: ratio => this.chrome.updateProgress(ratio),
      layout: () => this.preferences.read().layout, toast: message => this.chrome.toast(message),
    });
  }
  private configureHost(): void {
    this.host = new ReaderHost({
      desktop: isTauri, chrome: () => this.chrome.root, dropOverlay: () => this.chrome.dropOverlay,
      flushPosition: () => this.navigation.flushPosition(), save: () => this.sourceSession.flush(),
      dirty: () => this.sourceSession.dirty, captureNote: () => this.viewer.capturePendingNote(),
      canClose: () => this.viewer.canClose(), openPath: path => { void this.files.openPath(path); },
      resumeInitial: path => { if (!this.files.hasRequests) { if (path) void this.files.openPath(path); else this.files.resumeLast(); } },
      openBlob: file => this.files.openBlob(file), report: message => this.chrome.toast(message),
    });
  }
  private configureChrome(): void {
    this.chrome = new ReaderChrome({
      openPicker: () => { void this.files.openPicker(); }, closeFile: () => { void this.files.closeFile(); },
      openNotes: () => this.viewer.openNotes(), showHistory: () => { void this.history.show(); },
      exportDocument: () => { void this.files.exportDocument(); }, openFind: () => this.navigation.openFind(),
      toggleOutline: () => this.navigation.toggleOutline(), toggleTheme: () => this.appearance.toggleTheme(),
      toggleSettings: () => this.panel.toggle(), chooseLayout: layout => this.appearance.chooseLayout(layout),
      dark: () => resolvedMode(this.preferences.read().mode) === "dark",
      windowControls: isTauri ? () => this.host.buildWindowControls() : undefined,
    }, this.recent, this.viewer.recoveryButton);
  }
  private configureDocuments(): void {
    this.documents = new ReaderDocuments(this.viewer, createDocumentStore(() => this.preferences.read().documentBudgetMiB * MEBIBYTE), {
      status: status => {
        this.documentStatus = status; this.refreshDocumentMeta();
        const warning = documentStorageWarning(status.storage);
        const key = warning ? `${this.sourceSession?.id}:${status.storage?.limitBytes}` : "";
        if (status.state === "error") this.chrome.toast(status.message);
        else if (key && key !== this.storageWarningFor) this.chrome.toast(warning);
        this.storageWarningFor = key;
      }, changed: (_file, phase) => this.sourceChanged(phase),
    });
    this.sourceSession = this.documents.session;
    this.history = new DocumentHistory(this.sourceSession, {
      restore: (source, id) => this.restoreVersion(source, id), report: message => this.chrome.toast(message),
    });
  }
  private async restoreVersion(source: string, id: string): Promise<boolean> {
    if (!await this.sourceSession.flush() || this.sourceSession.id !== id) return false;
    this.viewer.changeSource(source);
    return this.sourceSession.flush();
  }
  private sourceChanged(phase: SourceChangePhase): void {
    const ratio = this.navigation.ratio(); this.refreshDocumentMeta();
    if (phase === "render") { this.viewer.rerender(); this.navigation.paint(ratio); }
    else if (phase === "commit") this.navigation.sourceCommitted();
  }
  private configureFiles(): void {
    this.files = new ReaderFiles({
      files: getFileService(), documents: this.documents, history: this.history, viewer: this.viewer,
      navigation: this.navigation, chrome: this.chrome, recent: this.recent, desktop: isTauri,
      recentPaths: getRecent, addRecent: pushRecent, removeRecent, forgetPlace,
      refreshMetadata: () => this.refreshDocumentMeta(), refreshChrome: () => this.refreshChrome(),
      report: message => this.chrome.toast(message), exportText,
    });
  }
  private configureAppearance(): void {
    this.appearance = new ReaderAppearance({
      viewer: this.viewer, navigation: this.navigation, chrome: this.chrome, preferences: this.preferences,
    });
  }
  private commandActions(): Record<CommandId, () => void> {
    return {
      open: () => { void this.files.openPicker(); }, find: () => this.navigation.openFind(), "find-next": () => {},
      contents: () => this.navigation.toggleOutline(), reload: () => { void this.files.reloadCurrent(); },
      close: () => { void this.files.closeFile(); }, recent: () => { this.chrome.fileMenu.show(); this.recent.toggle(); },
      theme: () => this.appearance.toggleTheme(), layout: () => this.appearance.toggleLayout(),
      settings: () => this.panel.toggle(), "zoom-in": () => this.appearance.zoom(1),
      "zoom-out": () => this.appearance.zoom(-1), "zoom-reset": () => this.appearance.zoom(0), print: () => window.print(),
    };
  }
  private configureShortcuts(): void {
    this.shortcuts = new ReaderShortcuts({
      recent: this.recent, find: this.navigation.find, panel: this.panel, outline: this.navigation.outline,
      fileMenu: this.chrome.fileMenu, viewMenu: this.chrome.viewMenu, desktop: isTauri,
      refreshChrome: () => this.refreshChrome(), readKey: event => this.navigation.onReadKey(event),
      commands: this.commandActions(),
    });
  }
  private bindViewer(): void {
    this.viewer.onOpenFile = path => { void this.files.openPath(path); };
    this.viewer.onAnchor = id => this.navigation.scrollToId(id);
    this.viewer.onNote = message => this.chrome.toast(message);
    this.viewer.onRevealNote = note => this.navigation.showInDocument(note);
    this.viewer.onMarks = () => this.navigation.rebuildKaraoke();
    this.viewer.onNotesVisibility = open => this.chrome.setNoteOpen(open);
  }
  private bindRecent(): void {
    this.recent.button.addEventListener("click", event => { event.stopPropagation(); this.recent.toggle(); });
    document.addEventListener("click", event => {
      const target = event.target instanceof Node ? event.target : null;
      if (this.recent.isOpen() && !this.recent.contains(target) && target !== this.recent.button) this.recent.close();
    });
    document.addEventListener("mark:toast", event => {
      if (event instanceof CustomEvent && typeof event.detail === "string" && event.detail) this.chrome.toast(event.detail);
    });
  }
  mount(parent: HTMLElement): void {
    parent.append(this.chrome.root, this.chrome.progress, this.navigation.find.root);
    this.navigation.mount(parent, this.chrome.emptyState);
    parent.append(this.panel.root, this.chrome.dropOverlay, this.chrome.toastRoot, this.chrome.zoomRoot);
    this.appearance.mount(); this.recent.refresh(); this.refreshChrome(); this.host.mount(); this.shortcuts.mount();
    this.preferences.subscribe(settings => this.sourceSession.refreshBudget(settings.documentBudgetMiB * MEBIBYTE));
    window.addEventListener("wheel", event => this.appearance.onWheel(event), { passive: false });
  }
  async openPicker(): Promise<void> { await this.files.openPicker(); }
  async openPath(path: string): Promise<void> { await this.files.openPath(path); }
  private refreshChrome(): void {
    this.chrome.refresh(this.viewer.file, this.navigation.outline.isOpen); this.navigation.refreshOutline();
  }
  private refreshDocumentMeta(): void {
    const file = this.viewer.file, status = this.documentStatus;
    const label = status ? { saved: isTauri ? "Saved" : "Saved locally", pending: "Unsaved", saving: "Saving…", error: "Not saved" }[status.state] : "";
    const description = file ? this.readingMetadata.describe({ id: file.path || file.name, source: file.source }, status?.state ?? "saved") : "";
    const storage = status?.storage;
    const capacity = storage?.warning ? ` · Storage ${Math.ceil(storage.usedBytes / storage.limitBytes * 100)}%` : "";
    this.chrome.fileMeta.textContent = file ? `${description}${this.sourceSession?.id ? ` · ${label}${capacity}` : ""}` : "";
    this.chrome.fileMeta.title = status?.message ?? ""; this.chrome.fileMeta.dataset.documentState = status?.state ?? "saved";
  }
}
