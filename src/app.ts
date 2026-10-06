import { Viewer } from "./viewer";
import { SettingsPanel } from "./settings";
import { Sidebar, SIDEBAR_OPEN_KEY } from "./sidebar";
import { AudioBar } from "./audioplayer";
import { Karaoke } from "./karaoke";
import { loadTiming } from "./workspace";
import { getFileService, blobToLoaded } from "./files";
import { getSettings, updateSettings, onSettings, pushRecent, getPosition, setPosition } from "./store";
import { applySettings, resolvedMode } from "./themes";
import { rebuildRenderers } from "./renderer";
import { isTauri } from "./platform";
import { el, debounce, basename } from "./util";
import { DEFAULT_SETTINGS, FONT_SIZE_MAX, FONT_SIZE_MIN, type LoadedFile } from "./types";

export class App {
  private viewer = new Viewer();
  private panel = new SettingsPanel();
  private audioBar = new AudioBar();
  /** Word-for-word follow mode: hangs off the player's clock. */
  private karaoke = new Karaoke(this.audioBar.audio, { load: loadTiming });

  private sidebar: Sidebar;
  private bodyRow: HTMLElement;
  private sidebarBtn: HTMLElement;

  private chrome: HTMLElement;
  private fileInfo: HTMLElement;
  private recentBtn: HTMLElement;
  private recentMenu: HTMLElement;
  private themeBtn: HTMLElement;
  private settingsBtn: HTMLElement;

  private workspace: HTMLElement;
  private emptyState: HTMLElement;
  private dropOverlay: HTMLElement;
  private toastEl: HTMLElement;

  /** Key of the open document (path, or name in browser mode) — for position memory. */
  private currentKey = "";

  /** Re-rendering replaces the document's innerHTML, which collapses the scroll
   *  container and drops the reader back to the top. Every settings change and
   *  slider drag routes through here, so the position is restored around it. */
  private rerender = debounce(() => {
    const top = this.workspace.scrollTop;
    rebuildRenderers();
    this.viewer.rerender();
    this.karaoke.rebuild(this.viewer.root); // new text nodes: re-collect the words
    this.workspace.scrollTop = top;
  }, 120);

  private savePosition = debounce(() => {
    if (this.currentKey) setPosition(this.currentKey, this.workspace.scrollTop);
  }, 400);

  constructor() {
    this.chrome = el("header", { class: "chrome", "data-tauri-drag-region": "" }, []);
    this.workspace = el("main", { class: "workspace" }, []);
    this.sidebar = new Sidebar(
      (path) => void this.openPath(path),
      (root) => updateSettings({ workspace: root }),
    );
    this.bodyRow = el("div", { class: "body-row" }, [this.sidebar.root, this.workspace]);
    this.dropOverlay = el("div", { class: "drop-overlay", "aria-hidden": "true" }, [
      el("div", { class: "drop-card" }, [el("div", { class: "drop-icon" }, ["\u2193"]), el("div", {}, ["Drop a file to open"])]),
    ]);
    this.toastEl = el("div", { class: "toast", role: "status", "aria-live": "polite" }, []);
    this.toastEl.hidden = true;

    this.fileInfo = el("div", { class: "file-info", title: "", "data-tauri-drag-region": "" }, ["Mark"]);
    this.recentBtn = el("button", { class: "icon-btn recent-btn", title: "Recent files (R)", "aria-label": "Recent files" }, ["Recent"]);
    this.recentMenu = el("div", { class: "recent-menu" }, []);
    this.themeBtn = el("button", { class: "icon-btn theme-btn", title: "Toggle theme (Ctrl+Shift+T)", "aria-label": "Toggle theme" }, [this.themeIcon()]);
    this.settingsBtn = el("button", { class: "icon-btn settings-btn", title: "Settings (Ctrl+,)", "aria-label": "Settings" }, ["\u2699"]);
    this.sidebarBtn = el("button", { class: "icon-btn sidebar-btn", title: "Workspace (Ctrl+B)", "aria-label": "Workspace" }, ["\u2630"]);

    this.emptyState = this.buildEmptyState();

    this.buildChrome();
    this.wire();
  }

  mount(parent: HTMLElement): void {
    parent.append(this.chrome, this.bodyRow, this.audioBar.root, this.panel.root, this.dropOverlay, this.toastEl);
    this.workspace.append(this.emptyState, this.viewer.root);
    applySettings(getSettings());
    this.refreshThemeIcon();
    if (!isTauri) {
      this.recentBtn.classList.add("hidden");
      this.sidebarBtn.classList.add("hidden");
      this.sidebar.root.classList.add("hidden");
    } else {
      const root = getSettings().workspace;
      if (root) {
        void this.sidebar.setWorkspace(root);
        // First run with a workspace: show it. After that the user's own toggle wins.
        if (localStorage.getItem(SIDEBAR_OPEN_KEY) === null) this.sidebar.setOpen(true);
      }
    }
    this.wireTauri();
  }

  private buildChrome(): void {
    const brand = el("div", { class: "brand", "data-tauri-drag-region": "" }, [
      el("span", { class: "brand-mark", "data-tauri-drag-region": "" }, ["M"]),
      el("span", { "data-tauri-drag-region": "" }, ["Mark"]),
    ]);
    const spacer = el("div", { class: "spacer", "data-tauri-drag-region": "" }, []);
    const openBtn = el("button", { class: "btn primary open-btn", title: "Open file (Ctrl+O)" }, ["Open"]);
    openBtn.addEventListener("click", () => this.openPicker());
    this.chrome.append(this.sidebarBtn, brand, this.fileInfo, spacer, this.recentBtn, openBtn, this.themeBtn, this.settingsBtn);
    if (isTauri) this.chrome.append(this.buildWindowControls());
    this.chrome.append(this.recentMenu);
  }

  /** Custom window buttons: with `decorations: false` the OS bar is gone, so the
   *  app has to offer drag/minimize/maximize/close itself or the window is stuck. */
  private buildWindowControls(): HTMLElement {
    const icons = {
      min: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor"/></svg>',
      max: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>',
      close: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor"/></svg>',
    };
    const wrap = el("div", { class: "window-controls" }, []);
    const add = (kind: keyof typeof icons, title: string, run: (w: ReturnType<typeof import("@tauri-apps/api/window")["getCurrentWindow"]>) => Promise<void>) => {
      const b = el("button", { class: `win-btn win-${kind}`, title, "aria-label": title, type: "button" }, []);
      b.innerHTML = icons[kind];
      b.addEventListener("click", () => {
        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => run(getCurrentWindow()));
      });
      wrap.append(b);
    };
    add("min", "Minimize", (w) => w.minimize());
    add("max", "Maximize", (w) => w.toggleMaximize());
    add("close", "Close", (w) => w.close());
    return wrap;
  }

  private buildEmptyState(): HTMLElement {
    const hint = el("p", { class: "empty-hint" }, [
      "Drop a markdown file here, or ",
    ]);
    const openLink = el("button", { class: "link-btn" }, ["open one"]);
    openLink.addEventListener("click", () => this.openPicker());
    hint.append(openLink, ".");
    const card = el("div", { class: "empty-card" }, [
      el("div", { class: "empty-logo" }, ["M"]),
      el("h1", {}, ["Mark"]),
      el("p", { class: "empty-sub" }, ["A small, fast markdown reader"]),
      hint,
      el("div", { class: "empty-recent" }, []),
    ]);
    return el("div", { class: "empty-state" }, [card]);
  }

  private refreshRecentUI(): void {
    const recent = getSettings().recent;
    const listEl = this.emptyState.querySelector(".empty-recent") as HTMLElement;
    listEl.innerHTML = "";
    if (recent.length === 0) {
      listEl.append(el("div", { class: "empty-recent-none" }, ["No recent files yet."]));
      return;
    }
    const title = el("div", { class: "empty-recent-title" }, ["Recent"]);
    listEl.append(title);
    for (const p of recent.slice(0, 8)) {
      const item = el("button", { class: "recent-item", type: "button", title: p }, [basename(p)]);
      item.addEventListener("click", () => {
        if (isTauri) this.openPath(p);
      });
      listEl.append(item);
    }
  }

  private refreshRecentMenu(): void {
    const recent = getSettings().recent;
    this.recentMenu.innerHTML = "";
    if (recent.length === 0) {
      this.recentMenu.append(el("div", { class: "recent-empty" }, ["No recent files"]));
      return;
    }
    for (const p of recent.slice(0, 12)) {
      const item = el("button", { class: "recent-menu-item", type: "button", title: p }, [
        el("span", { class: "recent-name" }, [basename(p)]),
        el("span", { class: "recent-path" }, [p]),
      ]);
      item.addEventListener("click", () => {
        this.recentMenu.classList.remove("open");
        if (isTauri) this.openPath(p);
      });
      this.recentMenu.append(item);
    }
  }

  private wire(): void {
    this.settingsBtn.addEventListener("click", () => this.panel.toggle());
    this.sidebarBtn.addEventListener("click", () => this.sidebar.toggle());
    this.themeBtn.addEventListener("click", () => this.toggleTheme());
    this.recentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.refreshRecentMenu();
      this.recentMenu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!this.recentMenu.classList.contains("open")) return;
      if (!this.recentMenu.contains(e.target as Node) && e.target !== this.recentBtn) {
        this.recentMenu.classList.remove("open");
      }
    });

    onSettings((s) => {
      applySettings(s);
      this.rerender();
      this.refreshRecentUI();
    });

    window.addEventListener("keydown", (e) => this.onKey(e));
    this.workspace.addEventListener("scroll", this.savePosition);

    // Browser drag & drop (Tauri uses native events below).
    this.workspace.addEventListener("dragover", (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        this.dropOverlay.setAttribute("aria-hidden", "false");
      }
    });
    this.workspace.addEventListener("dragleave", (e) => {
      if (e.relatedTarget === null) this.dropOverlay.setAttribute("aria-hidden", "true");
    });
    this.workspace.addEventListener("drop", async (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      this.dropOverlay.setAttribute("aria-hidden", "true");
      const f = e.dataTransfer.files[0];
      try {
        await this.showFile(await blobToLoaded(f));
      } catch (err) {
        this.toast(String(err));
      }
    });
  }

  private wireTauri(): void {
    if (!isTauri) return;
    // File passed on the command line at first launch (OS file association).
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string | null>("initial_path").then((p) => {
        if (p) this.openPath(p);
      });
    });
    // Subsequent launches forward a path via the single-instance plugin.
    void import("@tauri-apps/api/event").then(({ listen }) => {
      void listen<string>("open-file", (e) => {
        if (e.payload) this.openPath(e.payload);
      });
    });
    // Native drag & drop onto the window.
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      void win.onDragDropEvent((ev) => {
        if (ev.payload.type === "enter" || ev.payload.type === "over") {
          this.dropOverlay.setAttribute("aria-hidden", "false");
        } else if (ev.payload.type === "leave") {
          this.dropOverlay.setAttribute("aria-hidden", "true");
        } else if (ev.payload.type === "drop") {
          this.dropOverlay.setAttribute("aria-hidden", "true");
          const path = ev.payload.paths && ev.payload.paths[0];
          if (path) this.openPath(path);
        }
      });
    });
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "o") {
      e.preventDefault();
      this.openPicker();
    } else if (mod && e.key === ",") {
      e.preventDefault();
      this.panel.toggle();
    } else if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      this.sidebar.toggle();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      this.toggleTheme();
    } else if (mod && e.key.toLowerCase() === "p") {
      e.preventDefault();
      window.print();
    } else if (mod && (e.key === "+" || e.key === "=")) {
      e.preventDefault();
      this.zoom(1);
    } else if (mod && e.key === "-") {
      e.preventDefault();
      this.zoom(-1);
    } else if (mod && e.key === "0") {
      e.preventDefault();
      this.zoom(0);
    } else if (e.key === "Escape") {
      this.panel.setOpen(false);
      this.recentMenu.classList.remove("open");
    }
  }

  async openPicker(): Promise<void> {
    try {
      const f = await getFileService().pick();
      if (f) await this.showFile(f);
    } catch (err) {
      this.toast(String(err));
    }
  }

  async openPath(path: string): Promise<void> {
    try {
      const f = await getFileService().readPath(path);
      await this.showFile(f);
    } catch (err) {
      this.toast("Could not open: " + String(err));
    }
  }

  private async showFile(f: LoadedFile): Promise<void> {
    // Flush the outgoing document's position before the key changes under us.
    if (this.currentKey) setPosition(this.currentKey, this.workspace.scrollTop);

    this.viewer.render(f);
    this.emptyState.classList.add("hidden");
    this.viewer.root.hidden = false;
    this.fileInfo.textContent = f.name;
    this.fileInfo.setAttribute("title", f.path || f.name);
    document.title = f.name + " \u00b7 Mark";

    this.currentKey = f.path || f.name;
    pushRecent(this.currentKey);
    this.refreshRecentUI();
    this.sidebar.setActive(this.currentKey);
    void this.audioBar.setDocument(f.path);
    void this.karaoke.setDocument(f.path, this.viewer.root);

    // Resume where this file was left off. rAF because the debounced re-render
    // above (and late font/math layout) can still change the height; the scroll
    // assignment clamps to whatever the container can hold at that moment.
    const top = getPosition(this.currentKey);
    this.workspace.scrollTop = 0;
    requestAnimationFrame(() => {
      this.workspace.scrollTop = top;
    });
  }

  private toggleTheme(): void {
    const dark = resolvedMode(getSettings().mode) === "dark";
    updateSettings({ mode: dark ? "light" : "dark" });
    this.refreshThemeIcon();
  }

  /** Ctrl +/− scale the reading size, Ctrl+0 resets. Reuses the fontSize setting
   *  (and its panel slider) rather than introducing a second scale factor, so the
   *  two controls can never disagree. step 0 = reset to default. */
  private zoom(step: number): void {
    const { fontSize } = getSettings();
    const next = step === 0 ? DEFAULT_SETTINGS.fontSize : fontSize + step;
    const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next));
    if (clamped !== fontSize) updateSettings({ fontSize: clamped });
  }

  private themeIcon(): string {
    return resolvedMode(getSettings().mode) === "dark" ? "\u263c" : "\u263d";
  }

  private refreshThemeIcon(): void {
    this.themeBtn.textContent = this.themeIcon();
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
