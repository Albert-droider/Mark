import type { Window as DesktopWindow, CloseRequestedEvent } from "@tauri-apps/api/window";
import { el } from "./util";

const WINDOW_ICONS = {
  min: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor"/></svg>',
  max: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>',
  restore: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor"/></svg>',
  close: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor"/></svg>',
};
export interface ReaderHostActions {
  desktop: boolean; chrome(): HTMLElement; dropOverlay(): HTMLElement;
  flushPosition(): void; save(): Promise<boolean>; dirty(): boolean;
  captureNote(): boolean; canClose(): boolean; openPath(path: string): void;
  resumeInitial(path: string | null): void; openBlob(file: File): void; report(message: string): void;
}
export interface DesktopReaderApi {
  window(): Promise<DesktopWindow>; initialPath(): Promise<string | null>;
  listenOpen(open: (path: string) => void): Promise<unknown>;
}
export const desktopReaderApi: DesktopReaderApi = {
  window: async () => (await import("@tauri-apps/api/window")).getCurrentWindow(),
  initialPath: async () => (await import("@tauri-apps/api/core")).invoke<string | null>("initial_path"),
  listenOpen: async open => (await import("@tauri-apps/api/event")).listen<string>("open-file", event => {
    if (event.payload) open(event.payload);
  }),
};

/** Owns platform events and serialized, acknowledged window close. */
export class ReaderHost {
  private closingWindow = false;
  private closeAllowed = false;
  constructor(private actions: ReaderHostActions, private desktop: DesktopReaderApi = desktopReaderApi) {}
  mount(): void {
    this.bindPageLifecycle();
    if (!this.actions.desktop) { this.bindBrowserDrop(); return; }
    void this.desktop.initialPath().then(path => this.actions.resumeInitial(path)).catch(error => this.report(error));
    void this.desktop.listenOpen(path => this.actions.openPath(path)).catch(error => this.report(error));
    void this.desktop.window().then(window => this.bindDesktopWindow(window)).catch(error => this.report(error));
  }
  private report(error: unknown): void { this.actions.report(String(error)); }
  private bindPageLifecycle(): void {
    window.addEventListener("beforeunload", event => {
      this.actions.flushPosition();
      if (this.actions.dirty()) { event.preventDefault(); event.returnValue = ""; }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { this.actions.flushPosition(); void this.actions.save(); }
    });
  }
  private bindBrowserDrop(): void {
    window.addEventListener("dragover", event => {
      if (event.dataTransfer && [...event.dataTransfer.types].includes("Files")) {
        event.preventDefault(); this.actions.dropOverlay().setAttribute("aria-hidden", "false");
      }
    });
    window.addEventListener("dragleave", event => {
      if (event.relatedTarget === null) this.actions.dropOverlay().setAttribute("aria-hidden", "true");
    });
    window.addEventListener("drop", event => this.browserDrop(event));
  }
  private browserDrop(event: DragEvent): void {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); this.actions.dropOverlay().setAttribute("aria-hidden", "true");
    const files = [...event.dataTransfer.files];
    if (files.length > 1) this.actions.report("Opened the first file.");
    this.actions.openBlob(files[0]);
  }
  private bindDesktopWindow(window: DesktopWindow): void {
    this.paintMaximized(window); void window.onResized(() => this.paintMaximized(window));
    void window.onCloseRequested(event => this.onCloseRequested(event, window));
    void window.onDragDropEvent(event => {
      const payload = event.payload;
      this.actions.dropOverlay().setAttribute("aria-hidden", payload.type === "enter" || payload.type === "over" ? "false" : "true");
      if (payload.type !== "drop") return;
      if (payload.paths.length > 1) this.actions.report("Opened the first file.");
      if (payload.paths[0]) this.actions.openPath(payload.paths[0]);
    });
  }
  private paintMaximized(window: DesktopWindow): void {
    void window.isMaximized().then(maximized => {
      const button = this.actions.chrome().querySelector(".win-max");
      if (!button) return;
      button.innerHTML = maximized ? WINDOW_ICONS.restore : WINDOW_ICONS.max;
      const label = maximized ? "Restore" : "Maximize";
      button.setAttribute("aria-label", label); button.setAttribute("title", label);
    }).catch(error => this.report(error));
  }
  async onCloseRequested(event: Pick<CloseRequestedEvent, "preventDefault">, window: Pick<DesktopWindow, "close">): Promise<void> {
    this.actions.flushPosition();
    if (this.closeAllowed) return;
    event.preventDefault();
    if (this.closingWindow) return;
    this.closingWindow = true; await this.closeAfterSave(window);
  }
  private async closeAfterSave(window: Pick<DesktopWindow, "close">): Promise<void> {
    try {
      if (!this.actions.captureNote() || !await this.actions.save() || !this.actions.canClose()) return;
      this.closeAllowed = true; await window.close();
    } catch (error) { this.closeAllowed = false; this.report(error); }
    finally { this.closingWindow = false; }
  }
  buildWindowControls(): HTMLElement {
    const wrap = el("div", { class: "window-controls" });
    this.addWindowButton(wrap, { kind: "min", title: "Minimize", run: window => window.minimize() });
    this.addWindowButton(wrap, { kind: "max", title: "Maximize", run: window => window.toggleMaximize() });
    this.addWindowButton(wrap, { kind: "close", title: "Close", run: window => { this.actions.flushPosition(); return window.close(); } });
    return wrap;
  }
  private addWindowButton(wrap: HTMLElement, { kind, title, run }: { kind: "min" | "max" | "close"; title: string; run(window: DesktopWindow): Promise<void> }): void {
    const button = el("button", { class: `win-btn win-${kind}`, type: "button", title, "aria-label": title });
    button.innerHTML = WINDOW_ICONS[kind];
    button.addEventListener("click", () => { void this.desktop.window().then(run).catch(error => this.report(error)); });
    wrap.append(button);
  }
}
