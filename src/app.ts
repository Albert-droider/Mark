import { Viewer } from "./viewer";
import { SettingsPanel } from "./settings";
import { getFileService, blobToLoaded } from "./files";
import { getSettings, updateSettings, onSettings, pushRecent } from "./store";
import { applySettings, resolvedMode } from "./themes";
import { rebuildRenderers } from "./renderer";
import { isTauri } from "./platform";
import { el, debounce, basename } from "./util";
import type { LoadedFile } from "./types";

export class App {
  private viewer = new Viewer();
  private panel = new SettingsPanel();

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

  private rerender = debounce(() => {
    rebuildRenderers();
    this.viewer.rerender();
  }, 120);

  constructor() {
    this.chrome = el("header", { class: "chrome" }, []);
    this.workspace = el("main", { class: "workspace" }, []);
    this.dropOverlay = el("div", { class: "drop-overlay", "aria-hidden": "true" }, [
      el("div", { class: "drop-card" }, [el("div", { class: "drop-icon" }, ["\u2193"]), el("div", {}, ["Drop a file to open"])]),
    ]);
    this.toastEl = el("div", { class: "toast", role: "status", "aria-live": "polite" }, []);
    this.toastEl.hidden = true;

    this.fileInfo = el("div", { class: "file-info", title: "" }, ["Mark"]);
    this.recentBtn = el("button", { class: "icon-btn recent-btn", title: "Recent files (R)", "aria-label": "Recent files" }, ["Recent"]);
    this.recentMenu = el("div", { class: "recent-menu" }, []);
    this.themeBtn = el("button", { class: "icon-btn theme-btn", title: "Toggle theme (Ctrl+Shift+T)", "aria-label": "Toggle theme" }, [this.themeIcon()]);
    this.settingsBtn = el("button", { class: "icon-btn settings-btn", title: "Settings (Ctrl+,)", "aria-label": "Settings" }, ["\u2699"]);

    this.emptyState = this.buildEmptyState();

    this.buildChrome();
    this.wire();
  }

  mount(parent: HTMLElement): void {
    parent.append(this.chrome, this.workspace, this.panel.root, this.dropOverlay, this.toastEl);
    this.workspace.append(this.emptyState, this.viewer.root);
    applySettings(getSettings());
    this.refreshThemeIcon();
    if (!isTauri) this.recentBtn.classList.add("hidden");
    this.wireTauri();
  }

  private buildChrome(): void {
    const brand = el("div", { class: "brand" }, [el("span", { class: "brand-mark" }, ["M"]), el("span", {}, ["Mark"])]);
    const spacer = el("div", { class: "spacer" }, []);
    const openBtn = el("button", { class: "btn primary open-btn", title: "Open file (Ctrl+O)" }, ["Open"]);
    openBtn.addEventListener("click", () => this.openPicker());
    this.chrome.append(brand, this.fileInfo, spacer, this.recentBtn, openBtn, this.themeBtn, this.settingsBtn);
    this.chrome.append(this.recentMenu);
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
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      this.toggleTheme();
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
    this.viewer.render(f);
    this.emptyState.classList.add("hidden");
    this.viewer.root.hidden = false;
    this.fileInfo.textContent = f.name;
    this.fileInfo.setAttribute("title", f.path || f.name);
    document.title = f.name + " \u00b7 Mark";
    this.workspace.scrollTop = 0;
    pushRecent(f.path || f.name);
    this.refreshRecentUI();
  }

  private toggleTheme(): void {
    const dark = resolvedMode(getSettings().mode) === "dark";
    updateSettings({ mode: dark ? "light" : "dark" });
    this.refreshThemeIcon();
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
