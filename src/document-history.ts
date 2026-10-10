import { el } from "./util";
import type { DocumentVersion } from "./document-session";

export interface VersionHistorySource {
  readonly id: string;
  versions(): Promise<DocumentVersion[]>;
  readVersion(version: string): Promise<string>;
}

interface HistoryActions { restore: (source: string, document: string) => Promise<boolean>; report: (message: string) => void }

/** History is an explicit File action, never permanent editor chrome. */
export class DocumentHistory {
  readonly root = el("section", { class: "document-history", role: "dialog", "aria-modal": "true", "aria-label": "Version history" });
  private list = el("div", { class: "version-list" });
  private preview = el("textarea", { class: "version-preview", readonly: "", "aria-label": "Version Markdown" });
  private restore = el("button", { class: "btn primary version-restore", type: "button", disabled: "" }, ["Restore this version"]);
  private selected: string | null = null;
  private generation = 0;
  private selection = 0;
  private document = "";
  private focus: HTMLElement | null = null;
  constructor(private session: VersionHistorySource, private actions: HistoryActions) {
    const close = el("button", { class: "btn version-close", type: "button" }, ["Close"]);
    close.addEventListener("click", () => this.hide());
    this.restore.addEventListener("click", () => { void this.restoreSelected(); });
    this.root.append(el("h2", {}, ["Version history"]), el("p", {}, ["Changed Markdown saves every 5 seconds. Older versions expire after 30 days. The latest version and working file are never automatically removed."]), this.list, this.preview, el("div", { class: "version-footer" }, [close, this.restore]));
    this.root.hidden = true; this.root.addEventListener("keydown", this.onKey); document.body.append(this.root);
  }
  async show(): Promise<void> {
    if (!this.session.id) { this.actions.report("Open a Markdown document first."); return; }
    const generation = ++this.generation, id = this.session.id;
    this.document = id;
    this.focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.selected = null; this.preview.value = ""; this.restore.disabled = true;
    this.root.hidden = false; this.list.textContent = "Loading versions…";
    try {
      const versions = await this.session.versions();
      if (generation !== this.generation || this.session.id !== id) return;
      this.list.replaceChildren(...versions.map(version => this.button(version, generation)));
      if (!versions.length) this.list.textContent = "No saved versions yet.";
      this.list.querySelector<HTMLButtonElement>("button")?.focus();
    } catch (error) { if (generation === this.generation) this.list.textContent = String(error); }
  }
  hide(): void { this.generation++; this.root.hidden = true; this.selected = null; this.focus?.focus({ preventScroll: true }); }
  private button(version: DocumentVersion, generation: number): HTMLButtonElement {
    const button = el("button", { class: "btn version-item", type: "button" }, [`${new Date(version.createdAt).toLocaleString()} · ${version.bytes} bytes`]);
    button.addEventListener("click", () => { void this.select(version.id, generation); });
    return button;
  }
  private async select(version: string, generation: number): Promise<void> {
    const selection = ++this.selection;
    this.restore.disabled = true; this.selected = null;
    try {
      const source = await this.session.readVersion(version);
      if (generation !== this.generation || selection !== this.selection || this.session.id !== this.document) return;
      this.preview.value = source; this.selected = source; this.restore.disabled = false;
    } catch (error) { this.actions.report(String(error)); }
  }
  private async restoreSelected(): Promise<void> {
    if (this.selected == null || this.document !== this.session.id || !window.confirm("Restore this version? Your current Markdown is kept in version history first.")) return;
    this.restore.disabled = true;
    const generation = this.generation;
    try {
      const restored = await this.actions.restore(this.selected, this.document);
      if (restored && generation === this.generation) this.hide();
    } catch (error) {
      this.actions.report(String(error));
    } finally {
      if (generation === this.generation) this.restore.disabled = this.selected == null;
    }
  }
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.hide(); }
    if (event.key !== "Tab") return;
    const items = [...this.root.querySelectorAll<HTMLElement>("button:not(:disabled),textarea")];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  };
  dispose(): void { this.generation++; this.root.removeEventListener("keydown", this.onKey); this.root.remove(); }
}
