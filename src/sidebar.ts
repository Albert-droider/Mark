// Left panel: the workspace folder and the documents in it.

import { groupByFolder, listWorkspace, pickFolder, type WorkspaceFile } from "./workspace";
import { el, basename } from "./util";

export interface SidebarDeps {
  load: (root: string) => Promise<WorkspaceFile[]>;
  pick: () => Promise<string | null>;
}

/** UI state that must not re-render the document: see the note in store.ts. */
export const SIDEBAR_OPEN_KEY = "mark.sidebar.v1";

export class Sidebar {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private rootEl: HTMLElement;
  private countEl: HTMLElement;
  private files: WorkspaceFile[] = [];
  private active = "";
  private workspace = "";
  private open: boolean;

  constructor(
    private onOpen: (path: string) => void,
    private onWorkspace: (root: string) => void,
    private deps: SidebarDeps = { load: listWorkspace, pick: pickFolder },
  ) {
    this.open = localStorage.getItem(SIDEBAR_OPEN_KEY) === "1";
    this.listEl = el("div", { class: "sb-list" }, []);
    this.rootEl = el("div", { class: "sb-root" }, []);
    this.countEl = el("span", { class: "sb-count" }, []);

    const pickBtn = el("button", { class: "icon-btn sb-pick", type: "button", title: "Choose folder\u2026", "aria-label": "Choose folder" }, ["\u2026"]);
    pickBtn.addEventListener("click", () => void this.pickFolder());
    const refreshBtn = el("button", { class: "icon-btn sb-refresh", type: "button", title: "Refresh", "aria-label": "Refresh" }, ["\u21bb"]);
    refreshBtn.addEventListener("click", () => void this.refresh());

    const head = el("div", { class: "sb-head" }, [
      el("span", { class: "sb-title" }, ["Workspace"]),
      this.countEl,
      pickBtn,
      refreshBtn,
    ]);
    this.root = el("aside", { class: "sidebar", "aria-label": "Workspace", "aria-hidden": "true" }, [
      head,
      this.rootEl,
      this.listEl,
    ]);
    this.applyOpen();
    // Render the "no folder yet" state right away: an open but blank panel looks
    // like a broken app.
    void this.refresh();
  }

  isOpen(): boolean {
    return this.open;
  }

  setOpen(v: boolean): void {
    this.open = v;
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable; session-only is fine */
    }
    this.applyOpen();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  private applyOpen(): void {
    this.root.classList.toggle("open", this.open);
    this.root.setAttribute("aria-hidden", String(!this.open));
  }

  /** Point the panel at a folder and (re)load its documents. */
  async setWorkspace(root: string): Promise<void> {
    this.workspace = root;
    this.rootEl.textContent = root ? basename(root) : "No folder";
    this.rootEl.title = root || "No folder chosen yet";
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.workspace) {
      this.files = [];
      this.render();
      return;
    }
    try {
      this.files = await this.deps.load(this.workspace);
    } catch {
      this.files = [];
    }
    this.render();
  }

  /** Highlight the row of the open document. */
  setActive(path: string): void {
    this.active = path;
    this.listEl.querySelectorAll<HTMLElement>(".sb-file").forEach((b) => {
      b.classList.toggle("active", b.dataset.path === path);
    });
  }

  private async pickFolder(): Promise<void> {
    const picked = await this.deps.pick();
    if (!picked) return;
    await this.setWorkspace(picked);
    this.onWorkspace(picked);
  }

  private render(): void {
    this.listEl.innerHTML = "";
    this.countEl.textContent = this.files.length ? String(this.files.length) : "";

    if (!this.workspace) {
      this.listEl.append(
        el("div", { class: "sb-empty" }, [
          el("p", {}, ["Point Mark at a folder and every document in it shows up here."]),
        ]),
      );
      const btn = el("button", { class: "btn sb-empty-btn", type: "button" }, ["Choose folder\u2026"]);
      btn.addEventListener("click", () => void this.pickFolder());
      this.listEl.append(btn);
      return;
    }

    if (!this.files.length) {
      this.listEl.append(el("div", { class: "sb-empty" }, [el("p", {}, ["No documents in this folder."])]));
      return;
    }

    for (const group of groupByFolder(this.files)) {
      if (group.folder) this.listEl.append(el("div", { class: "sb-folder" }, [group.folder]));
      for (const file of group.files) {
        const item = el("button", { class: "sb-file", type: "button", title: file.rel }, [file.name]);
        item.dataset.path = file.path;
        if (file.path === this.active) item.classList.add("active");
        item.addEventListener("click", () => this.onOpen(file.path));
        this.listEl.append(item);
      }
    }
  }
}
