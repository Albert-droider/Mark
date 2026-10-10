import { ActionPopover } from "./action-popover";
import { el } from "./util";
import { icon } from "./icons";
import { shortcutKeys } from "./commands";
import type { ReadingLayout, LoadedFile } from "./types";
import type { RecentFiles } from "./recent";

export interface ReaderChromeActions {
  openPicker(): void; closeFile(): void; openNotes(): void; showHistory(): void;
  exportDocument(): void; openFind(): void; toggleOutline(): void;
  toggleTheme(): void; toggleSettings(): void; chooseLayout(layout: ReadingLayout): void;
  dark(): boolean; windowControls?: () => HTMLElement;
}

/** Owns shell DOM and menus, not files, parsing, or reader positions. */
export class ReaderChrome {
  readonly root = el("header", { class: "chrome", "data-tauri-drag-region": "" });
  readonly progress = el("div", { class: "read-progress hidden", "aria-hidden": "true" });
  private progressBar = el("span");
  readonly fileName = el("span", { class: "file-name", "data-tauri-drag-region": "" });
  readonly fileMeta = el("span", { class: "file-meta", "data-tauri-drag-region": "" });
  private fileBlock = el("div", { class: "file-block", "data-tauri-drag-region": "" }, [this.fileName, this.fileMeta]);
  readonly dropOverlay = el("div", { class: "drop-overlay", "aria-hidden": "true" }, [
    el("div", { class: "drop-card" }, [el("div", { class: "drop-icon" }, ["↓"]), el("div", {}, ["Drop a file to open"])]),
  ]);
  readonly toastRoot = el("div", { class: "toast", role: "status", "aria-live": "polite" });
  readonly zoomRoot = el("div", { class: "zoom-toast", role: "status" });
  readonly emptyState: HTMLElement;
  readonly fileMenu: ActionPopover;
  readonly viewMenu: ActionPopover;
  readonly notesButton: HTMLButtonElement;
  private closeButton: HTMLButtonElement;
  private themeButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;
  private contentsButton: HTMLButtonElement;
  private layoutSwitch: HTMLElement;
  private toastTimer = 0;

  constructor(private actions: ReaderChromeActions, recent: RecentFiles, recoveryButton: HTMLButtonElement) {
    this.progress.append(this.progressBar); this.toastRoot.hidden = true; this.zoomRoot.hidden = true;
    this.closeButton = this.button("Close document", "btn quiet close-file-btn hidden", "close");
    this.themeButton = this.button("", "icon-btn theme-btn", "theme");
    this.settingsButton = this.button("", "icon-btn settings-btn", "settings");
    this.contentsButton = this.button("Contents", "icon-btn contents-btn hidden", "contents");
    this.contentsButton.setAttribute("aria-expanded", "false");
    this.layoutSwitch = this.buildLayoutSwitch();
    this.fileMenu = this.buildFileMenu(recent, recoveryButton); this.viewMenu = this.buildViewMenu();
    this.notesButton = this.buildNoteButton(); this.emptyState = this.buildEmptyState();
    const emptyList = this.emptyState.querySelector<HTMLElement>(".empty-recent");
    if (emptyList) recent.attachEmpty(emptyList);
    this.root.append(this.brand(), this.fileMenu.wrap, this.fileBlock, this.notesButton, this.viewMenu.wrap);
    if (actions.windowControls) this.root.append(actions.windowControls());
    this.bindControls();
  }
  private button(label: string, className: string, command: "close" | "theme" | "settings" | "contents"): HTMLButtonElement {
    return el("button", { class: className, type: "button", title: `${label || command} (${shortcutKeys(command)})` }, [label]);
  }
  private brand(): HTMLElement {
    return el("div", { class: "brand", "data-tauri-drag-region": "" }, [
      el("span", { class: "brand-mark", "data-tauri-drag-region": "" }, ["M"]),
      el("span", { class: "brand-name", "data-tauri-drag-region": "" }, ["Mark"]),
    ]);
  }
  private buildFileMenu(recent: RecentFiles, recovery: HTMLButtonElement): ActionPopover {
    const trigger = el("button", { class: "icon-btn file-menu-btn", type: "button", "aria-label": "File actions" }, ["File", icon("chevron-down")]);
    const open = this.documentAction("Open document…", "primary open-btn", () => this.actions.openPicker());
    open.title = `Open file (${shortcutKeys("open")})`; recent.button.textContent = "Recent documents";
    const menu = new ActionPopover(trigger, [
      el("h2", { class: "menu-heading" }, ["Documents"]), open, recent.wrap, this.closeButton,
      this.documentAction("Add note to this document", "add-note-btn", () => this.actions.openNotes()),
      this.documentAction("Version history…", "version-history-btn", () => this.actions.showHistory()),
      this.documentAction("Export current Markdown…", "export-document-btn", () => this.actions.exportDocument()), el("hr"), recovery,
    ], "file-actions");
    recovery.addEventListener("click", () => menu.hide());
    return menu;
  }
  private documentAction(label: string, className: string, action: () => void): HTMLButtonElement {
    const button = el("button", { class: `btn ${className}`, type: "button" }, [label]);
    button.addEventListener("click", () => { this.fileMenu.hide(); action(); });
    return button;
  }
  private buildViewMenu(): ActionPopover {
    const trigger = el("button", { class: "icon-btn view-menu-btn", type: "button", "aria-label": "Reading and appearance" }, [icon("more")]);
    const find = el("button", { class: "icon-btn find-btn", type: "button" }, [icon("search"), "Find in document"]);
    find.addEventListener("click", () => { this.viewMenu.hide(); this.actions.openFind(); });
    const print = el("button", { class: "icon-btn print-btn", type: "button" }, ["Print document…"]);
    print.addEventListener("click", () => { this.viewMenu.hide(); window.print(); });
    this.settingsButton.replaceChildren(icon("settings"), el("span", {}, ["Reading settings…"]));
    return new ActionPopover(trigger, [
      el("h2", { class: "menu-heading" }, ["Reading"]), this.layoutSwitch, this.contentsButton, find,
      el("hr"), el("h2", { class: "menu-heading" }, ["Appearance"]), this.themeButton, this.settingsButton, print,
    ], "reading-actions");
  }
  private buildNoteButton(): HTMLButtonElement {
    const button = el("button", { class: "icon-btn notes-btn", type: "button", "aria-label": "Add note to document" }, [
      icon("notes"), el("span", { class: "notes-label" }, ["Note"]),
    ]);
    button.addEventListener("click", () => this.actions.openNotes());
    return button;
  }
  private bindControls(): void {
    this.closeButton.addEventListener("click", () => { this.fileMenu.hide(); this.actions.closeFile(); });
    this.themeButton.addEventListener("click", () => this.actions.toggleTheme());
    this.settingsButton.addEventListener("click", () => { this.viewMenu.hide(); this.actions.toggleSettings(); });
    this.contentsButton.addEventListener("click", () => { this.viewMenu.hide(); this.actions.toggleOutline(); });
  }
  private buildLayoutSwitch(): HTMLElement {
    const wrap = el("div", { class: "layout-switch", role: "group", "aria-label": "Reading layout" });
    const options: { id: ReadingLayout; label: string }[] = [{ id: "scroll", label: "Document" }, { id: "book", label: "Book" }];
    for (const option of options) {
      const button = el("button", { type: "button", class: "layout-opt", "data-layout": option.id,
        title: option.id === "book" ? "Two pages, like a reader" : "Scroll the file" }, [option.label]);
      button.addEventListener("click", () => { this.viewMenu.hide(); this.actions.chooseLayout(option.id); });
      wrap.append(button);
    }
    return wrap;
  }
  private buildEmptyState(): HTMLElement {
    const open = el("button", { class: "btn primary", type: "button" }, ["Open a file"]);
    open.addEventListener("click", () => this.actions.openPicker());
    return el("div", { class: "empty-state" }, [el("div", { class: "empty-card" }, [
      el("div", { class: "empty-mark" }, ["M"]), el("h1", {}, ["Mark"]),
      el("p", { class: "empty-sub" }, ["A reader for markdown. Drop a file here, or open one."]), open,
      el("p", { class: "empty-keys" }, [
        el("span", { class: "empty-key" }, [el("kbd", {}, [shortcutKeys("open")]), "open"]),
        el("span", { class: "empty-key" }, [el("kbd", {}, [shortcutKeys("find")]), "find"]),
        el("span", { class: "empty-key" }, [el("kbd", {}, [shortcutKeys("theme")]), "appearance"]),
      ]), el("div", { class: "empty-recent" }),
    ])]);
  }
  setFile(file: LoadedFile | null): void {
    this.emptyState.classList.toggle("hidden", !!file);
    this.fileName.textContent = file?.name ?? ""; this.fileName.title = file?.path || file?.name || "";
    if (!file) this.fileMeta.textContent = "";
    document.title = file ? `${file.name} · Mark` : "Mark";
  }
  refresh(file: LoadedFile | null, outlineOpen: boolean): void {
    const open = !!file, markdown = file?.kind === "markdown";
    this.contentsButton.classList.toggle("hidden", !open); this.closeButton.classList.toggle("hidden", !open);
    this.fileBlock.classList.toggle("no-document", !open);
    if (!open) this.fileName.textContent = "Read · write · think";
    this.viewMenu.root.querySelectorAll<HTMLButtonElement>(".find-btn,.print-btn").forEach(button => { button.disabled = !open; });
    this.fileMenu.root.querySelectorAll<HTMLButtonElement>(".version-history-btn,.export-document-btn,.add-note-btn").forEach(button => { button.disabled = !open || !markdown; });
    this.notesButton.disabled = !open || !markdown; this.progress.classList.toggle("hidden", !open);
    this.contentsButton.classList.toggle("active", open && outlineOpen);
    this.contentsButton.setAttribute("aria-expanded", String(open && outlineOpen));
  }
  refreshAppearance(layout: ReadingLayout): void {
    this.layoutSwitch.querySelectorAll<HTMLElement>(".layout-opt").forEach(button => {
      const selected = button.dataset.layout === layout;
      button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected));
    });
    this.themeButton.replaceChildren(icon(this.actions.dark() ? "sun" : "moon"), el("span", {}, ["Light / dark"]));
  }
  updateProgress(ratio: number): void { this.progressBar.style.transform = `scaleX(${ratio})`; }
  hideMenus(): void { this.fileMenu.hide(); this.viewMenu.hide(); }
  setNoteOpen(open: boolean): void { this.notesButton.setAttribute("aria-expanded", String(open)); }
  dispose(): void {
    window.clearTimeout(this.toastTimer); this.fileMenu.dispose(); this.viewMenu.dispose(); this.root.remove();
  }
  toast(message: string): void {
    window.clearTimeout(this.toastTimer); this.toastRoot.textContent = message;
    this.toastRoot.hidden = false; this.toastRoot.classList.add("show");
    this.toastTimer = window.setTimeout(() => {
      this.toastRoot.classList.remove("show"); this.toastRoot.hidden = true;
    }, 3200);
  }
}
