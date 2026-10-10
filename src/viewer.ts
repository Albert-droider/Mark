import { drawMermaid } from "./artifacts";
import type { LoadedFile } from "./types";
import { getRenderer } from "./renderer";
import { isTauri } from "./platform";
import { el, clear, resolveAgainst, isDocumentPath, isImagePath } from "./util";
import { loadImageDataUrl } from "./files";
import { attachShareActions } from "./share-actions";
import { rememberImageSource } from "./inline-markdown";
import { InPlaceReader, type SourceChangePhase } from "./in-place-reader";
import { SourceEditor } from "./source-editor";
import { ReaderAnnotations } from "./reader-annotations";
export { NOTE_HOVER_MS } from "./legacy-note-hover";

/** Owns rendering and the current source; annotations own their own surfaces. */
export class Viewer {
  readonly root: HTMLElement;
  private current: LoadedFile | null = null;
  private imageGen = 0;
  private artifactGen = 0;
  private clearShareActions: (() => void) | null = null;
  private sourceEditingEnabled = false;
  private readerEditor: InPlaceReader | null = null;
  private sourceEditor: SourceEditor | null = null;
  private annotations: ReaderAnnotations;
  onSourceChange: ((file: LoadedFile, phase: SourceChangePhase) => void) | null = null;
  onRevealNote: ((note: HTMLElement) => void) | null = null;
  onOpenFile: ((path: string) => void) | null = null;
  onAnchor: ((id: string) => void) | null = null;
  onNote: ((message: string) => void) | null = null;
  onMarks: (() => void) | null = null;
  onNotesVisibility: ((open: boolean) => void) | null = null;

  constructor() {
    this.root = el("article", { class: "markdown-body content", "aria-label": "Document content" });
    this.root.hidden = true;
    this.annotations = new ReaderAnnotations(this.root, {
      file: () => this.current, reader: () => this.readerEditor,
      report: message => this.onNote?.(message), marksChanged: () => this.onMarks?.(),
      revealNote: note => this.onRevealNote?.(note), openFile: path => this.onOpenFile?.(path),
      editorVisibility: open => this.onNotesVisibility?.(open),
    });
    this.root.addEventListener("click", this.onClick);
  }
  get recoveryButton(): HTMLButtonElement { return this.annotations.recoveryButton; }
  openNotes(): void { this.annotations.openNotes(); }
  createDocument(): void { this.annotations.createDocument(); }
  capturePendingNote(): boolean { return this.readerEditor?.captureNote() ?? true; }
  canClose(): boolean { return this.annotations.canClose(); }
  hideNoteTip(): void { this.annotations.hideTip(); this.readerEditor?.hideNoteTip(); }


  get file(): LoadedFile | null {
    return this.current;
  }


  get isEditing(): boolean { return this.sourceEditor != null || (this.readerEditor?.isEditing ?? false); }

  setEditable(enabled: boolean): void { this.sourceEditingEnabled = enabled; }


  editMarkdown(): void {
    if (!this.current || !this.sourceEditingEnabled || this.sourceEditor) return;
    this.annotations.hideTransient(); this.readerEditor?.dispose(); this.readerEditor = null;
    this.clearShareActions?.(); this.clearShareActions = null;
    this.sourceEditor = new SourceEditor(this.current.source, {
      change: source => this.changeSource(source, "input"),
      done: () => { if (this.current) this.changeSource(this.current.source, "render"); },
    });
    this.root.replaceChildren(this.sourceEditor.root); this.sourceEditor.focus();
  }


  render(file: LoadedFile): void {
    this.annotations.reset();
    this.current = file;
    this.sourceEditor?.dispose(); this.sourceEditor = null;
    this.imageGen++;
    const renderer = getRenderer(file.kind);
    this.readerEditor?.dispose(); this.readerEditor = null;
    this.clearShareActions?.();
    const rendered = renderer.renderWithSource?.(file.source);
    clear(this.root);
    this.root.innerHTML = rendered?.html ?? renderer.render(file.source);
    const owner = this;
    this.clearShareActions = rendered ? attachShareActions(this.root, rendered.blocks, { name: file.name, get source() { return owner.current?.source ?? file.source; } }, message => this.onNote?.(message)) : null;
    if (rendered && this.sourceEditingEnabled) this.readerEditor = new InPlaceReader(this.root, { source: file.source, rendered }, {
      current: () => this.current?.source ?? "",
      change: (source, phase) => this.changeSource(source, phase),
      report: message => this.onNote?.(message),
    });
    this.root.hidden = false;
    this.annotations.updateAnnotations();
  }


  changeSource(source: string, phase: SourceChangePhase = "render"): void {
    if (!this.current || !this.sourceEditingEnabled) return;
    this.annotations.hideTransient();
    this.current = { ...this.current, source };
    if (phase === "commit") { this.readerEditor?.refreshNotes(); this.annotations.updateAnnotations(); }
    if (this.onSourceChange) this.onSourceChange(this.current, phase);
    else if (phase === "render") this.rerender();
  }


  rerender(): void {
    if (this.current) this.render(this.current);
  }


  clear(): void {
    this.annotations.hideTransient();
    this.imageGen++;
    this.artifactGen++;
    this.current = null;
    this.sourceEditor?.dispose(); this.sourceEditor = null;
    this.readerEditor?.dispose(); this.readerEditor = null;
    this.clearShareActions?.(); this.clearShareActions = null;
    this.root.innerHTML = "";
    this.root.hidden = true;
    this.annotations.clear();
  }


  dispose(): void {
    this.sourceEditor?.dispose(); this.sourceEditor = null;
    this.readerEditor?.dispose(); this.readerEditor = null;
    this.clearShareActions?.(); this.clearShareActions = null;
    this.annotations.hideTransient();
    this.imageGen++;
    this.artifactGen++;
    this.annotations.dispose();
    this.root.removeEventListener("click", this.onClick);
  }


  /** Draw mermaid fences. Charts and plans are already in the HTML. */
  async hydrateArtifacts(): Promise<void> {
    const gen = ++this.artifactGen;
    const nodes = [...this.root.querySelectorAll<HTMLElement>(".artifact-mermaid")];
    if (nodes.length === 0) return;
    await drawMermaid(nodes, () => this.artifactGen === gen);
  }


  /** Replace relative image sources with data URLs the webview is allowed to show. */
  async hydrateImages(): Promise<void> {
    const file = this.current;
    if (!file?.path || !isTauri) return;
    const gen = this.imageGen;
    const imgs = [...this.root.querySelectorAll("img")];
    await Promise.all(imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      const abs = resolveAgainst(file.path, src);
      if (!abs || !isImagePath(abs)) return;
      try {
        const url = await loadImageDataUrl(abs);
        if (this.imageGen === gen) { rememberImageSource(img, src); img.src = url; }
      } catch {
        /* leave the unresolved src; the document still reads */
      }
    }));
  }


  private onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target || e.defaultPrevented) return;

    if (target.closest("[contenteditable]")) return;
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href) return;

    if (href.startsWith("#")) {
      e.preventDefault();
      let id: string;
      try { id = decodeURIComponent(href.slice(1)); }
      catch { this.onNote?.("This heading link contains invalid URL encoding."); return; }
      if (id) this.onAnchor?.(id);
      return;
    }

    if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
      e.preventDefault();
      if (isTauri) {
        void import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => {
            window.open(href, "_blank", "noopener");
          });
      } else {
        window.open(href, "_blank", "noopener");
      }
      return;
    }

    // Any other link stays inside the reader. Following it in the webview unloads the app.
    e.preventDefault();
    const base = this.current?.path || "";
    const abs = base ? resolveAgainst(base, href) : null;
    if (abs && isDocumentPath(abs)) {
      this.onOpenFile?.(abs);
      return;
    }
    if (!base) {
      this.onNote?.("Open this file from the desktop app to follow links inside it.");
      return;
    }
    this.onNote?.("That link doesn't point at a document Mark can open.");
  };
}
