import { Book } from "./book";
import { AudioBar } from "./audioplayer";
import { Karaoke } from "./karaoke";
import { loadTiming } from "./files";
import { Viewer } from "./viewer";
import { SettingsPanel } from "./settings";
import { FindBar } from "./find";
import { Outline } from "./outline";
import { ReadingSession } from "./session";
import { RecentFiles } from "./recent";
import { getFileService, blobToLoaded } from "./files";
import {
  getSettings, updateSettings, onSettings, getRecent, pushRecent, removeRecent, forgetPlace,
} from "./store";
import type { ReadingPlace } from "./store";
import { applySettings, resolvedMode } from "./themes";
import { rebuildRenderers } from "./renderer";
import { isTauri } from "./platform";
import { el, debounce, canonicalPath } from "./util";
import { icon } from "./icons";
import { matchCommand, shortcutKeys, type CommandId } from "./commands";
import { DEFAULT_SETTINGS, FONT_SIZE_MAX, FONT_SIZE_MIN, type LoadedFile, type ReadingLayout, type Settings } from "./types";

const WIN_ICONS = {
  min: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor"/></svg>',
  max: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>',
  restore: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor"/></svg>',
  close: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor"/></svg>',
};

export class App {
  private viewer = new Viewer();
  private panel = new SettingsPanel();
  private workspace: HTMLElement;
  private desk: HTMLElement;
  private sheet: HTMLElement;
  private folio: HTMLElement;
  private turnPrev: HTMLButtonElement;
  private turnNext: HTMLButtonElement;
  private book: Book;
  private bookIndex = -1;
  private audioBar: AudioBar;
  private karaoke: Karaoke;
  private layoutSwitch: HTMLElement;
  private session: ReadingSession;
  private outline: Outline;
  private find: FindBar;
  private recent: RecentFiles;

  private chrome: HTMLElement;
  private fileBlock: HTMLElement;
  private fileName: HTMLElement;
  private fileMeta: HTMLElement;
  private themeBtn: HTMLElement;
  private settingsBtn: HTMLElement;
  private contentsBtn: HTMLElement;
  private closeBtn: HTMLElement;

  private progress: HTMLElement;
  private progressBar: HTMLElement;
  private emptyState: HTMLElement;
  private dropOverlay: HTMLElement;
  private toastEl: HTMLElement;
  private zoomToast: HTMLElement;

  private openToken = 0;
  private renderedRender = JSON.stringify(getSettings().render);
  private pendingRatio = 0;
  private zoomTimer = 0;
  private lastZoom = 0;

  /** Parse-affecting settings rebuild markdown. Appearance only restyles. */
  private rerender = debounce(() => {
    const ratio = this.pendingRatio;
    rebuildRenderers();
    this.viewer.rerender();
    this.paint(ratio);
  }, 120);

  constructor() {
    this.viewer.onOpenFile = (p) => { void this.openPath(p); };
    this.viewer.onAnchor = (id) => this.scrollToId(id);
    this.viewer.onNote = (m) => this.toast(m);
    this.viewer.onMarks = () => {
      if (this.viewer.file) this.karaoke.rebuild(this.viewer.root);
    };

    this.workspace = el("main", { class: "workspace", tabindex: "-1" }, []);
    this.session = new ReadingSession(this.workspace, {
      hasFile: () => !!this.viewer.file,
      onChanged: () => { void this.reloadCurrent(); },
      onMissing: (path) => {
        this.dropRecent(path);
        this.toast("This file is no longer available.");
      },
    });
    this.outline = new Outline(this.workspace, {
      jump: (id) => this.scrollToId(id),
      changed: () => this.refreshChrome(),
    });
    this.find = new FindBar(() => this.viewer.root, (hit) => this.reveal(hit));
    this.recent = new RecentFiles({
      openPath: (p) => { void this.openPath(p); },
      placeKey: () => this.session.key,
    });

    this.chrome = el("header", { class: "chrome", "data-tauri-drag-region": "" }, []);
    this.progress = el("div", { class: "read-progress hidden", "aria-hidden": "true" }, []);
    this.progressBar = el("span", {}, []);
    this.progress.append(this.progressBar);

    this.fileName = el("span", { class: "file-name" }, []);
    this.fileMeta = el("span", { class: "file-meta" }, []);
    this.fileBlock = el("div", { class: "file-block hidden", "data-tauri-drag-region": "" }, [this.fileName, this.fileMeta]);
    this.themeBtn = el("button", { class: "icon-btn theme-btn", type: "button", title: `Light or dark (${shortcutKeys("theme")})`, "aria-label": "Light or dark" }, [this.themeIcon()]);
    this.settingsBtn = el("button", { class: "icon-btn settings-btn", type: "button", title: `Settings (${shortcutKeys("settings")})`, "aria-label": "Settings" }, [icon("settings")]);
    this.contentsBtn = el("button", {
      class: "icon-btn contents-btn hidden",
      type: "button",
      title: `Contents (${shortcutKeys("contents")})`,
      "aria-label": "Contents",
      "aria-expanded": "false",
    }, ["Contents"]);
    this.closeBtn = el("button", { class: "btn quiet close-file-btn hidden", type: "button", title: `Close file (${shortcutKeys("close")})` }, ["Close"]);

    this.dropOverlay = el("div", { class: "drop-overlay", "aria-hidden": "true" }, [
      el("div", { class: "drop-card" }, [el("div", { class: "drop-icon" }, ["\u2193"]), el("div", {}, ["Drop a file to open"])]),
    ]);
    this.toastEl = el("div", { class: "toast", role: "status", "aria-live": "polite" }, []);
    this.toastEl.hidden = true;
    this.zoomToast = el("div", { class: "zoom-toast", role: "status" }, []);
    this.zoomToast.hidden = true;

    this.emptyState = this.buildEmptyState();
    const emptyList = this.emptyState.querySelector(".empty-recent");
    if (emptyList instanceof HTMLElement) this.recent.attachEmpty(emptyList);

    this.turnPrev = el("button", { class: "page-turn", type: "button", "aria-label": "Previous pages" }, ["\u2039"]);
    this.turnNext = el("button", { class: "page-turn", type: "button", "aria-label": "Next pages" }, ["\u203a"]);
    this.sheet = el("div", { class: "sheet" });
    this.folio = el("div", { class: "folio" }, []);
    this.desk = el("div", { class: "desk" }, [
      el("div", { class: "book-row" }, [this.turnPrev, this.sheet, this.turnNext]),
      this.folio,
    ]);
    this.sheet.append(this.viewer.root);
    this.book = new Book(this.sheet, this.viewer.root, () => this.onBook());
    this.turnPrev.addEventListener("click", () => this.book.prev());
    this.turnNext.addEventListener("click", () => this.book.next());
    this.audioBar = new AudioBar();
    this.karaoke = new Karaoke(this.audioBar.audio, {
      load: loadTiming,
      reveal: (el) => this.revealSpoken(el),
    });
    this.layoutSwitch = this.buildLayoutSwitch();

    this.buildChrome();
    this.wire();
  }

  mount(parent: HTMLElement): void {
    const reading = el("div", { class: "reading" }, [this.outline.root, this.workspace]);
    parent.append(this.chrome, this.progress, this.find.root, reading, this.audioBar.root, this.panel.root, this.dropOverlay, this.toastEl, this.zoomToast);
    this.workspace.append(this.emptyState, this.desk);
    applySettings(getSettings());
    this.applyLayout();
    this.refreshThemeIcon();
    this.recent.refresh();
    this.refreshChrome();
    this.wireTauri();
    this.watchSystemTheme();
    window.addEventListener("beforeunload", () => this.session.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.session.flush();
    });
  }

  private buildChrome(): void {
    const brand = el("div", { class: "brand", "data-tauri-drag-region": "" }, [
      el("span", { class: "brand-mark", "data-tauri-drag-region": "" }, ["M"]),
      el("span", { class: "brand-name", "data-tauri-drag-region": "" }, ["Mark"]),
    ]);
    const spacer = el("div", { class: "spacer", "data-tauri-drag-region": "" }, []);
    const openBtn = el("button", { class: "btn primary open-btn", type: "button", title: `Open file (${shortcutKeys("open")})` }, ["Open"]);
    openBtn.addEventListener("click", () => { void this.openPicker(); });
    this.chrome.append(
      brand, this.fileBlock, spacer,
      this.contentsBtn, this.recent.wrap, openBtn, this.layoutSwitch, this.themeBtn, this.settingsBtn, this.closeBtn,
    );
    if (isTauri) this.chrome.append(this.buildWindowControls());
  }

  /** Custom window buttons: with `decorations: false` the OS bar is gone, so the
   *  app has to offer drag/minimize/maximize/close itself or the window is stuck. */
  private buildWindowControls(): HTMLElement {
    const wrap = el("div", { class: "window-controls" }, []);
    const add = (kind: "min" | "max" | "close", title: string, run: (w: { minimize: () => Promise<void>; toggleMaximize: () => Promise<void>; close: () => Promise<void> }) => Promise<void>) => {
      const b = el("button", { class: `win-btn win-${kind}`, type: "button", title, "aria-label": title }, []);
      b.innerHTML = WIN_ICONS[kind];
      b.addEventListener("click", () => {
        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => run(getCurrentWindow()));
      });
      wrap.append(b);
    };
    add("min", "Minimize", (w) => w.minimize());
    add("max", "Maximize", (w) => w.toggleMaximize());
    add("close", "Close", (w) => {
      this.session.flush();
      return w.close();
    });
    return wrap;
  }

  private buildEmptyState(): HTMLElement {
    const open = el("button", { class: "btn primary", type: "button" }, ["Open a file"]);
    open.addEventListener("click", () => { void this.openPicker(); });
    const card = el("div", { class: "empty-card" }, [
      el("div", { class: "empty-mark" }, ["M"]),
      el("h1", {}, ["Mark"]),
      el("p", { class: "empty-sub" }, ["A reader for markdown. Drop a file here, or open one."]),
      open,
      el("p", { class: "empty-keys" }, [
        el("span", { class: "empty-key" }, [el("kbd", {}, [shortcutKeys("open")]), "open"]),
        el("span", { class: "empty-key" }, [el("kbd", {}, [shortcutKeys("find")]), "find"]),
        el("span", { class: "empty-key" }, [el("kbd", {}, [shortcutKeys("theme")]), "appearance"]),
      ]),
      el("div", { class: "empty-recent" }, []),
    ]);
    return el("div", { class: "empty-state" }, [card]);
  }

  private wire(): void {
    this.settingsBtn.addEventListener("click", () => this.panel.toggle());
    this.themeBtn.addEventListener("click", () => this.toggleTheme());
    this.contentsBtn.addEventListener("click", () => this.toggleOutline());
    this.closeBtn.addEventListener("click", () => this.closeFile());
    this.recent.button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.recent.toggle();
    });
    document.addEventListener("mark:toast", (e) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) this.toast(detail);
    });
    document.addEventListener("click", (e) => {
      if (!this.recent.isOpen()) return;
      const target = e.target instanceof Node ? e.target : null;
      if (!this.recent.contains(target) && target !== this.recent.button) this.recent.close();
    });

    onSettings((s) => this.onSettingsChange(s));
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.workspace.addEventListener("scroll", () => {
      this.updateProgress();
      this.session.queue();
      this.markReading();
    });
    if (!isTauri) this.wireBrowserDrop();
  }

  private wireBrowserDrop(): void {
    window.addEventListener("dragover", (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        this.dropOverlay.setAttribute("aria-hidden", "false");
      }
    });
    window.addEventListener("dragleave", (e) => {
      if (e.relatedTarget === null) this.dropOverlay.setAttribute("aria-hidden", "true");
    });
    window.addEventListener("drop", (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      this.dropOverlay.setAttribute("aria-hidden", "true");
      const files = [...e.dataTransfer.files];
      const f = files[0];
      if (files.length > 1) this.toast("Opened the first file.");
      void blobToLoaded(f).then((loaded) => this.showFile(loaded)).catch((err) => this.toast(String(err)));
    });
  }

  private wireTauri(): void {
    if (!isTauri) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string | null>("initial_path").then((p) => {
        if (p) void this.openPath(p);
        else this.resumeLast();
      });
    });
    void import("@tauri-apps/api/event").then(({ listen }) => {
      void listen<string>("open-file", (e) => {
        if (e.payload) void this.openPath(e.payload);
      });
    });
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const paintMax = () => {
        void win.isMaximized().then((max) => {
          const btn = this.chrome.querySelector(".win-max");
          if (!btn) return;
          btn.innerHTML = max ? WIN_ICONS.restore : WIN_ICONS.max;
          const label = max ? "Restore" : "Maximize";
          btn.setAttribute("aria-label", label);
          btn.setAttribute("title", label);
        });
      };
      paintMax();
      void win.onResized(() => paintMax());
      void win.onCloseRequested(() => { this.session.flush(); });
      void win.onDragDropEvent((ev) => {
        if (ev.payload.type === "enter" || ev.payload.type === "over") {
          this.dropOverlay.setAttribute("aria-hidden", "false");
        } else if (ev.payload.type === "leave") {
          this.dropOverlay.setAttribute("aria-hidden", "true");
        } else if (ev.payload.type === "drop") {
          this.dropOverlay.setAttribute("aria-hidden", "true");
          const paths = ev.payload.paths ?? [];
          const path = paths[0];
          if (paths.length > 1) this.toast("Opened the first file.");
          if (path) void this.openPath(path);
        }
      });
    });
  }

  private watchSystemTheme(): void {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getSettings().mode === "system") {
        applySettings(getSettings());
        this.refreshThemeIcon();
        this.restyle();
      }
    });
  }

  private onSettingsChange(s: Settings): void {
    const ratio = this.session.ratio();
    const parseChanged = JSON.stringify(s.render) !== this.renderedRender;
    applySettings(s);
    this.applyLayout();
    this.refreshThemeIcon();
    if (parseChanged && this.viewer.file) {
      this.renderedRender = JSON.stringify(s.render);
      this.pendingRatio = ratio;
      this.rerender();
    } else if (this.viewer.file) {
      this.restyle(ratio);
      requestAnimationFrame(() => {
        this.session.scrollToRatio(ratio);
        this.updateProgress();
        this.markReading();
      });
    }
  }

  /** Document scrolls. Book paginates. The choice does not reparse the file. */
  private applyLayout(): void {
    const book = getSettings().layout === "book";
    this.workspace.classList.toggle("layout-book", book);
    this.workspace.classList.toggle("layout-scroll", !book);
    this.book.setEnabled(book);
    this.session.follow(book ? {
      ratio: () => this.book.ratio(),
      scrollToRatio: (n) => this.book.scrollToRatio(n),
    } : null);
    this.refreshLayoutSwitch();
  }

  private buildLayoutSwitch(): HTMLElement {
    const wrap = el("div", { class: "layout-switch", role: "group", "aria-label": "Reading layout" });
    const options: { id: ReadingLayout; label: string }[] = [
      { id: "scroll", label: "Document" },
      { id: "book", label: "Book" },
    ];
    for (const item of options) {
      const button = el("button", {
        type: "button",
        class: "layout-opt",
        "data-layout": item.id,
        title: item.id === "book" ? "Two pages, like a reader" : "Scroll the file",
      }, [item.label]);
      button.addEventListener("click", () => {
        if (getSettings().layout !== item.id) updateSettings({ layout: item.id });
      });
      wrap.append(button);
    }
    return wrap;
  }

  private refreshLayoutSwitch(): void {
    const layout = getSettings().layout;
    this.layoutSwitch.querySelectorAll<HTMLElement>(".layout-opt").forEach((button) => {
      const on = button.dataset.layout === layout;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }

  /** Reflow the open book and redraw diagrams after a theme or measure change. */
  private restyle(saved?: number): void {
    if (!this.viewer.file) return;
    const ratio = saved ?? this.session.ratio();
    this.book.layout();
    this.session.scrollToRatio(ratio);
    void this.viewer.hydrateArtifacts().then(() => {
      this.book.layout();
      this.session.scrollToRatio(ratio);
      this.updateProgress();
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.recent.consumeKey(e)) return;
    if (this.find.consumeKey(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.dismiss();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (this.canPage(e) && !mod && isPagingKey(e)) {
      this.onReadKey(e);
      return;
    }
    const cmd = matchCommand(e, { typing: this.isTyping(e), desktop: isTauri });
    if (!cmd) return;
    e.preventDefault();
    this.runCommand(cmd);
  }

  private dismiss(): void {
    if (!this.find.hidden) { this.find.close(); return; }
    if (this.recent.isOpen()) { this.recent.close(); return; }
    if (this.panel.isOpen) { this.panel.setOpen(false); return; }
    if (this.outline.isOpen) {
      this.outline.setOpen(false);
      this.refreshChrome();
    }
  }

  private runCommand(id: CommandId): void {
    switch (id) {
      case "open": void this.openPicker(); break;
      case "find": this.openFind(); break;
      case "find-next": break;
      case "contents": this.toggleOutline(); break;
      case "reload": void this.reloadCurrent(); break;
      case "close": this.closeFile(); break;
      case "recent": this.recent.toggle(); break;
      case "theme": this.toggleTheme(); break;
      case "layout": this.toggleLayout(); break;
      case "settings": this.panel.toggle(); break;
      case "zoom-in": this.zoom(1); break;
      case "zoom-out": this.zoom(-1); break;
      case "zoom-reset": this.zoom(0); break;
      case "print": window.print(); break;
      default: {
        const _never: never = id;
        return _never;
      }
    }
  }

  private onReadKey(e: KeyboardEvent): void {
    if (!this.viewer.file) return;
    if (getSettings().layout === "book") {
      this.onBookKey(e);
      return;
    }
    this.onScrollKey(e);
  }

  private onBookKey(e: KeyboardEvent): void {
    if (e.key === "Home") {
      e.preventDefault();
      this.book.go(0, true);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      this.book.go(this.book.spreads - 1, true);
      return;
    }
    let dir = 0;
    if (e.key === "PageDown" || e.key === "ArrowRight" || e.key === "ArrowDown" || (e.key === " " && !e.shiftKey)) dir = 1;
    else if (e.key === "PageUp" || e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === " " && e.shiftKey)) dir = -1;
    if (dir === 0) return;
    e.preventDefault();
    if (dir > 0) this.book.next();
    else this.book.prev();
  }

  private onScrollKey(e: KeyboardEvent): void {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") return;
    const view = this.workspace;
    const page = Math.max(80, Math.round(view.clientHeight * 0.9));
    if (e.key === "Home") {
      e.preventDefault();
      view.scrollTop = 0;
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      view.scrollTop = view.scrollHeight;
      return;
    }
    let delta = 0;
    if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) delta = page;
    else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) delta = -page;
    else if (e.key === "ArrowDown") delta = 64;
    else if (e.key === "ArrowUp") delta = -64;
    if (delta === 0) return;
    e.preventDefault();
    view.scrollBy({ top: delta });
  }

  private onWheel(e: WheelEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const now = performance.now();
    if (now - this.lastZoom < 40) return;
    this.lastZoom = now;
    this.zoom(e.deltaY < 0 ? 1 : -1);
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }

  private canPage(e: KeyboardEvent): boolean {
    if (this.isTyping(e)) return false;
    const t = e.target as HTMLElement | null;
    if (!t) return true;
    return t.tagName !== "BUTTON" && t.tagName !== "A" && t.tagName !== "SELECT";
  }

  async openPicker(): Promise<void> {
    const token = ++this.openToken;
    try {
      const f = await getFileService().pick();
      if (!f || token !== this.openToken) return;
      this.showFile(f);
    } catch (err) {
      if (token === this.openToken) this.toast(String(err));
    }
  }

  async openPath(path: string): Promise<void> {
    const token = ++this.openToken;
    try {
      const f = await getFileService().readPath(path);
      if (token !== this.openToken) return;
      this.showFile(f);
    } catch (err) {
      if (token !== this.openToken) return;
      this.toast("Could not open: " + String(err));
      if (isMissing(err)) this.dropRecent(path);
    }
  }

  private resumeLast(): void {
    const path = getRecent()[0];
    if (path && isTauri) void this.openPath(path);
  }

  private showFile(f: LoadedFile): void {
    this.session.flush();
    this.viewer.render(f);
    this.emptyState.classList.add("hidden");
    this.session.key = f.path ? canonicalPath(f.path) : "";
    this.fileName.textContent = f.name;
    this.fileName.title = f.path || f.name;
    this.fileMeta.textContent = readingMeta(f.source);
    document.title = `${f.name} \u00b7 Mark`;
    if (f.path) pushRecent(f.path);
    this.recent.refresh();
    this.workspace.classList.add("has-file");
    this.refreshChrome();
    this.paint(this.session.place());
    void this.audioBar.setDocument(f.path);
    void this.karaoke.setDocument(f.path, this.viewer.root);
    this.session.watch(f.path);
    this.workspace.focus();
  }

  /** Render, contents, find, then put the reading place back after layout and images. */
  private paint(place: ReadingPlace | number): void {
    this.outline.rebuild(this.viewer.file ? this.viewer.root : null);
    if (this.viewer.file) this.karaoke.rebuild(this.viewer.root);
    this.find.reapply(false);
    const key = this.session.key;
    const apply = () => {
      if (this.session.key !== key) return;
      this.book.layout();
      if (typeof place === "number") this.session.scrollToRatio(place);
      else this.session.restore(place);
      this.updateProgress();
    };
    apply();
    requestAnimationFrame(apply);
    void this.viewer.hydrateImages().then(async () => {
      await this.viewer.hydrateArtifacts();
      apply();
    });
  }

  private closeFile(): void {
    if (!this.viewer.file) return;
    this.session.flush();
    this.session.stop();
    this.find.close();
    this.viewer.clear();
    void this.audioBar.setDocument("");
    void this.karaoke.setDocument("", null);
    this.session.key = "";
    this.workspace.classList.remove("has-file");
    this.emptyState.classList.remove("hidden");
    this.fileName.textContent = "";
    this.fileMeta.textContent = "";
    document.title = "Mark";
    this.outline.rebuild(null);
    this.refreshChrome();
    this.updateProgress();
  }

  private async reloadCurrent(): Promise<void> {
    const file = this.viewer.file;
    if (!file?.path) {
      this.toast(file ? "This file isn't on disk." : "Open a file first.");
      return;
    }
    const ratio = this.session.ratio();
    const key = this.session.key;
    try {
      const f = await getFileService().readPath(file.path);
      if (this.session.key !== key) return;
      this.viewer.render(f);
      this.fileMeta.textContent = readingMeta(f.source);
      this.paint(ratio);
    } catch (err) {
      this.toast(String(err));
      if (isMissing(err)) this.dropRecent(file.path);
    }
  }

  private dropRecent(path: string): void {
    removeRecent(path);
    forgetPlace(path);
    this.recent.refresh();
  }

  private refreshChrome(): void {
    const open = !!this.viewer.file;
    this.contentsBtn.classList.toggle("hidden", !open);
    this.closeBtn.classList.toggle("hidden", !open);
    this.fileBlock.classList.toggle("hidden", !open);
    this.progress.classList.toggle("hidden", !open);
    const showOutline = open && this.outline.isOpen;
    this.contentsBtn.classList.toggle("active", showOutline);
    this.contentsBtn.setAttribute("aria-expanded", String(showOutline));
    this.outline.sync(open);
  }

  private toggleOutline(): void {
    const count = this.viewer.root.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
    const result = this.outline.toggle(!!this.viewer.file, count);
    if (result === "no-file") this.toast("Open a file first.");
    else if (result === "no-headings") this.toast("This file has no headings.");
    else this.refreshChrome();
  }

  private scrollToId(id: string): void {
    const node = this.viewer.root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!node) return;
    this.showInDocument(node);
  }

  private openFind(): void {
    if (!this.viewer.file) {
      this.toast("Open a file first.");
      return;
    }
    this.find.open();
  }

  private reveal(hit: HTMLElement): void {
    this.showInDocument(hit);
  }

  private showInDocument(node: HTMLElement): void {
    if (getSettings().layout === "book") {
      this.book.show(node);
      return;
    }
    node.scrollIntoView({ block: "start" });
  }

  /** Karaoke follow: turn the page, or scroll the column. */
  private revealSpoken(el: HTMLElement): void {
    if (getSettings().layout === "book") {
      this.book.show(el);
      return;
    }
    el.scrollIntoView({ block: "center" });
  }

  private markReading(): void {
    if (!this.viewer.file || getSettings().layout === "book") return;
    const line = this.workspace.getBoundingClientRect().top + 32;
    let current: string | null = null;
    for (const head of this.viewer.root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      if (!head.id) continue;
      if (head.getBoundingClientRect().top <= line) current = head.id;
      else break;
    }
    this.outline.mark(current);
  }

  private toggleLayout(): void {
    const next: ReadingLayout = getSettings().layout === "book" ? "scroll" : "book";
    updateSettings({ layout: next });
  }

  private onBook(): void {
    if (this.book.index !== this.bookIndex) {
      this.bookIndex = this.book.index;
      this.viewer.hideNoteTip();
    }
    this.folio.textContent = this.viewer.file ? this.book.label() : "";
    this.turnPrev.disabled = !this.book.canPrev();
    this.turnNext.disabled = !this.book.canNext();
    this.outline.mark(this.viewer.file ? this.book.headingId() : null);
    this.updateProgress();
    if (this.viewer.file) this.session.queue();
  }

  private updateProgress(): void {
    const r = this.viewer.file ? this.session.ratio() : 0;
    this.progressBar.style.transform = `scaleX(${r})`;
  }

  private toggleTheme(): void {
    const dark = resolvedMode(getSettings().mode) === "dark";
    updateSettings({ mode: dark ? "light" : "dark" });
  }

  /** Ctrl +/− and pinch scale the reading size. step 0 resets. */
  private zoom(step: number): void {
    const { fontSize } = getSettings();
    const next = step === 0 ? DEFAULT_SETTINGS.fontSize : fontSize + step;
    const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next));
    if (clamped !== fontSize) updateSettings({ fontSize: clamped });
    this.zoomToast.textContent = `${clamped} px`;
    this.zoomToast.hidden = false;
    window.clearTimeout(this.zoomTimer);
    this.zoomTimer = window.setTimeout(() => { this.zoomToast.hidden = true; }, 700);
  }

  private themeIcon(): SVGElement {
    return icon(resolvedMode(getSettings().mode) === "dark" ? "sun" : "moon");
  }

  private refreshThemeIcon(): void {
    this.themeBtn.replaceChildren(this.themeIcon());
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    this.toastEl.classList.add("show");
    window.setTimeout(() => {
      this.toastEl.classList.remove("show");
      this.toastEl.hidden = true;
    }, 3200);
  }
}

function readingMeta(source: string): string {
  const words = source.trim() ? source.trim().split(/\s+/).length : 0;
  if (words === 0) return "Empty";
  const minutes = Math.max(1, Math.round(words / 220));
  return `${words.toLocaleString()} words · ${minutes} min`;
}


function isPagingKey(e: KeyboardEvent): boolean {
  return e.key === " " || e.key === "PageDown" || e.key === "PageUp" || e.key === "Home" || e.key === "End"
    || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight";
}

function isMissing(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return s.includes("os error 2") || s.includes("cannot find") || s.includes("not found") || s.includes("no such file");
}
