import { el, clear } from "./util";
import { MarkdownRenderer } from "./renderer/markdown";
import { drawMermaid } from "./artifacts";
import { editMarkdown, INSERT_ACTIONS, type MarkdownAction } from "./markdown-edit";
import { attachShareActions } from "./share-actions";

export interface NoteEntry { title: string; detail: string; open: () => void }
interface EditorActions {
  change: () => void; save: () => void; close: () => void;
  create: () => void; copySource: () => void; export: () => void; recovery: () => void; browse: () => void;
  visibility: (open: boolean) => void;
}

/** Document-like Markdown writing, kept out of the source article and selection popup. */
export class NoteEditor {
  readonly root: HTMLElement;
  readonly input: HTMLTextAreaElement;
  private title: HTMLElement;
  private quote: HTMLElement;
  private status: HTMLElement;
  private toolbar: HTMLElement;
  private page: HTMLElement;
  private preview: HTMLElement;
  private list: HTMLElement;
  private save: HTMLButtonElement;
  private exportButton: HTMLButtonElement;
  private previewButton: HTMLButtonElement;
  private copyButton: HTMLButtonElement;
  private insert: HTMLDetailsElement;
  private render = new MarkdownRenderer();
  private previewGen = 0;
  private clearShareActions: (() => void) | null = null;

  constructor(private actions: EditorActions) {
    this.title = el("h2", { class: "note-editor-title" }, ["Notes"]);
    const close = this.button("Close notes", "note-close", actions.close);
    this.copyButton = this.button("Edit source copy", "note-copy-source", actions.copySource);
    const header = el("div", { class: "note-editor-head" }, [this.title,
      this.button("All notes", "note-browse-heading", actions.browse), close]);
    const nav = el("div", { class: "note-navigation" }, [
      this.button("All notes", "note-browse", actions.browse),
      this.button("New note", "note-new", actions.create), this.copyButton,
      this.button("Recovery & backup", "note-recovery", actions.recovery),
    ]);
    this.quote = el("blockquote", { class: "note-source-quote" });
    this.quote.hidden = true;
    this.input = el("textarea", { class: "note-input sel-note-input", "aria-label": "Note Markdown", spellcheck: "true" });
    this.input.addEventListener("input", actions.change);
    this.input.addEventListener("keydown", this.onKey);
    this.preview = el("article", { class: "markdown-body note-preview", "aria-label": "Note preview" });
    this.preview.hidden = true;
    // Preview links are inert: relative links must never navigate away from unsaved work.
    this.preview.addEventListener("click", event => { if ((event.target as Element).closest("a")) event.preventDefault(); });
    const formats = [this.formatButton("Bold", "B", "bold"), this.formatButton("Italic", "I", "italic"), this.formatButton("Heading", "H2", "heading")];
    this.insert = el("details", { class: "note-insert" }, [el("summary", { class: "btn", "aria-label": "Insert Markdown" }, ["Insert ▾"])]);
    const options = el("div", { class: "note-insert-options" });
    for (const [action, label] of INSERT_ACTIONS) options.append(this.formatButton(label, label, action));
    this.insert.append(options);
    this.previewButton = this.button("Preview", "note-preview-toggle", () => this.togglePreview());
    this.previewButton.setAttribute("aria-pressed", "false");
    this.toolbar = el("div", { class: "note-toolbar", role: "toolbar", "aria-label": "Markdown formatting" }, [...formats, this.insert, this.previewButton]);
    this.list = el("div", { class: "note-list" });
    this.page = el("div", { class: "note-page" }, [this.input, this.preview]);
    this.save = this.button("Save note", "sel-save primary", actions.save);
    this.exportButton = this.button("Export .md", "note-export", actions.export);
    this.status = el("p", { class: "sel-status", role: "status", "aria-live": "polite" });
    const footer = el("div", { class: "note-editor-footer" }, [this.status, this.save, this.exportButton]);
    this.root = el("aside", { class: "note-editor", "aria-label": "Notes editor" }, [header, nav, this.quote, this.toolbar, this.list, this.page, footer]);
    this.root.hidden = true;
    this.root.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (this.insert.open) this.insert.open = false;
        else actions.close();
      }
    });
  }

  get isOpen(): boolean { return !this.root.hidden; }
  setEntries(entries: NoteEntry[], sourceOpen: boolean): void {
    this.copyButton.disabled = !sourceOpen;
    clear(this.list);
    if (!entries.length) this.list.append(el("p", { class: "note-list-empty" }, ["Write a new note, edit a copy, or select a passage in your document."]));
    for (const entry of entries) {
      const button = this.button("", "note-list-entry", entry.open);
      button.append(el("strong", {}, [entry.title]), el("span", {}, [entry.detail]));
      this.list.append(button);
    }
  }
  showList(): void {
    this.root.classList.remove("is-editing");
    this.clearPreview();
    this.title.textContent = "Notes";
    this.quote.hidden = true;
    this.toolbar.hidden = this.page.hidden = this.save.hidden = this.exportButton.hidden = true;
    this.list.hidden = false;
    this.show();
    this.list.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
  open(text: string, title: string, quote = "", document = false): void {
    this.root.classList.add("is-editing");
    this.clearPreview();
    this.title.textContent = title;
    this.input.value = text;
    this.input.hidden = false; this.preview.hidden = true;
    this.previewButton.textContent = "Preview"; this.previewButton.setAttribute("aria-pressed", "false");
    this.quote.textContent = quote;
    this.quote.hidden = !quote;
    this.list.hidden = true;
    this.toolbar.hidden = this.page.hidden = this.save.hidden = this.exportButton.hidden = false;
    this.save.textContent = document ? "Save draft" : "Save note";
    this.insert.open = false;
    this.show();
    this.input.focus({ preventScroll: true });
  }
  setStatus(message: string): void { this.status.textContent = message; }
  hide(): void {
    this.clearPreview(); this.root.hidden = true; this.insert.open = false;
    document.body.classList.remove("notes-open"); this.actions.visibility(false);
  }
  private show(): void {
    this.root.hidden = false;
    document.body.classList.add("notes-open"); this.actions.visibility(true);
  }
  private button(label: string, className: string, action: () => void): HTMLButtonElement {
    const button = el("button", { class: `btn ${className}`, type: "button" }, [label]);
    button.addEventListener("click", action); return button;
  }
  private formatButton(label: string, text: string, action: MarkdownAction): HTMLButtonElement {
    const button = this.button(text, `note-format ${action === "list" ? "note-insert-list" : `note-${action}`}`, () => this.format(action));
    button.title = label; button.setAttribute("aria-label", label);
    button.addEventListener("mousedown", event => event.preventDefault());
    return button;
  }
  private format(action: MarkdownAction): void {
    if (this.input.hidden) this.togglePreview();
    const edited = editMarkdown(this.input.value, this.input.selectionStart, this.input.selectionEnd, action);
    this.input.value = edited.text;
    this.input.focus({ preventScroll: true }); this.input.setSelectionRange(edited.start, edited.end);
    this.insert.open = false; this.actions.change();
  }
  private togglePreview(): void {
    const show = this.preview.hidden;
    this.preview.hidden = !show; this.input.hidden = show;
    this.previewButton.textContent = show ? "Edit" : "Preview";
    this.previewButton.setAttribute("aria-pressed", String(show));
    const gen = ++this.previewGen;
    if (show) {
      this.clearShareActions?.(); this.render.rebuild();
      const rendered = this.render.renderWithSource(this.input.value);
      this.preview.innerHTML = rendered.html;
      this.clearShareActions = attachShareActions(this.preview, rendered.blocks, { name: this.title.textContent ?? "Note.md", source: this.input.value }, message => {
        if (gen === this.previewGen && this.isOpen && !this.preview.hidden) this.setStatus(message);
      });
      void drawMermaid([...this.preview.querySelectorAll<HTMLElement>(".artifact-mermaid")], () => gen === this.previewGen);
    } else { this.clearPreview(); this.input.focus({ preventScroll: true }); }
  }
  private clearPreview(): void {
    this.previewGen++;
    this.clearShareActions?.(); this.clearShareActions = null;
  }
  private onKey = (event: KeyboardEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (!["b", "i", "k", "s"].includes(key)) return;
    event.preventDefault(); event.stopPropagation();
    if (key === "s") this.actions.save();
    else this.format(key === "b" ? "bold" : key === "i" ? "italic" : "link");
  };
  dispose(): void { this.hide(); this.root.remove(); }
}
