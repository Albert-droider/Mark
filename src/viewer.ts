import { drawMermaid } from "./artifacts";
import type { LoadedFile } from "./types";
import { getRenderer } from "./renderer";
import { isTauri } from "./platform";
import { el, clear, canonicalPath, resolveAgainst, isDocumentPath, isImagePath } from "./util";
import { loadImageDataUrl } from "./files";
import {
  HIGHLIGHT_COLORS,
  addHighlight,
  anchorsFromRange,
  applyHighlights,
  groupAt,
  groupNote,
  refreshGroup,
  removeHighlightGroup,
  setGroupColor,
  setGroupNote,
  unwrapGroup,
  type HighlightColor,
} from "./highlights";

/** Owns the rendered document and click interactions inside it. */
export class Viewer {
  readonly root: HTMLElement;
  private current: LoadedFile | null = null;
  private imageGen = 0;
  private artifactGen = 0;

  /** Open a markdown/text path resolved from a relative link. */
  onOpenFile: ((path: string) => void) | null = null;
  /** Scroll the reading column to a heading id. */
  onAnchor: ((id: string) => void) | null = null;
  onNote: ((message: string) => void) | null = null;
  /** A selection or note changed the text nodes karaoke is following. */
  onMarks: (() => void) | null = null;

  /** Lives on the body so a book page cannot clip it, and print can drop it. */
  private pop: HTMLElement;
  private noteBox: HTMLElement;
  private noteInput: HTMLTextAreaElement;
  private pendingRange: Range | null = null;
  private pendingGroup: string | null = null;

  constructor() {
    this.root = el("article", {
      class: "markdown-body content",
      "aria-label": "Document content",
    });
    this.root.hidden = true;
    this.root.addEventListener("click", this.onClick);

    const built = this.buildPop();
    this.pop = built.pop;
    this.noteBox = built.noteBox;
    this.noteInput = built.noteInput;
    document.body.append(this.pop);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hidePop();
    });
    document.addEventListener("scroll", (e) => {
      const target = e.target;
      if (target instanceof Node && this.pop.contains(target)) return;
      this.hidePop();
    }, true);
    window.addEventListener("resize", () => this.hidePop());
  }

  private get key(): string {
    const file = this.current;
    if (!file) return "";
    return file.path ? canonicalPath(file.path) : file.name;
  }

  get file(): LoadedFile | null {
    return this.current;
  }

  render(file: LoadedFile): void {
    this.current = file;
    this.imageGen++;
    const renderer = getRenderer(file.kind);
    const html = renderer.render(file.source);
    clear(this.root);
    this.root.innerHTML = html;
    this.root.hidden = false;
    this.hidePop();
    applyHighlights(this.root, this.key);
  }

  rerender(): void {
    if (this.current) this.render(this.current);
  }

  clear(): void {
    this.imageGen++;
    this.current = null;
    this.root.innerHTML = "";
    this.root.hidden = true;
    this.hidePop();
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
        if (this.imageGen === gen) img.src = url;
      } catch {
        /* leave the unresolved src; the document still reads */
      }
    }));
  }

  private buildPop(): { pop: HTMLElement; noteBox: HTMLElement; noteInput: HTMLTextAreaElement } {
    const row = el("div", { class: "sel-row" }, []);
    for (const color of HIGHLIGHT_COLORS) {
      const btn = el("button", {
        class: `sel-swatch sel-${color}`,
        type: "button",
        title: `Mark ${color}`,
        "aria-label": `Mark ${color}`,
      }, []);
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.mark(color));
      row.append(btn);
    }
    const noteBtn = el("button", { class: "btn sel-note-btn", type: "button" }, ["Note"]);
    noteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    noteBtn.addEventListener("click", () => this.openNote());
    const removeBtn = el("button", { class: "btn sel-remove", type: "button" }, ["Remove"]);
    removeBtn.addEventListener("mousedown", (e) => e.preventDefault());
    removeBtn.addEventListener("click", () => this.removeMark());
    row.append(noteBtn, removeBtn);

    const noteInput = el("textarea", {
      class: "sel-note-input",
      rows: "3",
      placeholder: "Note on this passage",
      "aria-label": "Note",
    }) as HTMLTextAreaElement;
    const save = el("button", { class: "btn primary sel-save", type: "button" }, ["Save"]);
    save.addEventListener("mousedown", (e) => e.preventDefault());
    save.addEventListener("click", () => this.saveNote());
    const noteBox = el("div", { class: "sel-note" }, [noteInput, save]);
    noteBox.hidden = true;

    const pop = el("div", { class: "sel-pop", role: "dialog", "aria-label": "Selection" }, [row, noteBox]);
    pop.hidden = true;
    return { pop, noteBox, noteInput };
  }

  private onMouseUp = (e: MouseEvent): void => {
    if (this.pop.contains(e.target as Node)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this.hidePop();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!this.root.contains(range.commonAncestorContainer)) {
      this.hidePop();
      return;
    }
    this.pendingRange = range.cloneRange();
    this.pendingGroup = null;
    this.noteBox.hidden = true;
    this.showPop(range.getBoundingClientRect(), false);
  };

  private showPop(rect: DOMRect, existing: boolean): void {
    this.pop.hidden = false;
    this.pop.classList.toggle("existing", existing);
    const x = Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120);
    const above = rect.top > 72;
    this.pop.style.left = `${x}px`;
    this.pop.style.top = above ? `${rect.top - 8}px` : `${rect.bottom + 8}px`;
    this.pop.classList.toggle("below", !above);
  }

  private hidePop(): void {
    this.pop.hidden = true;
    this.noteBox.hidden = true;
    this.pendingRange = null;
    this.pendingGroup = null;
  }

  private mark(color: HighlightColor): void {
    if (!this.key) return;
    if (this.pendingGroup) {
      setGroupColor(this.key, this.pendingGroup, color);
      refreshGroup(this.root, this.key, this.pendingGroup);
      this.hidePop();
      return;
    }
    if (!this.pendingRange) return;
    const added = addHighlight(this.key, anchorsFromRange(this.pendingRange), color);
    if (added.length) {
      applyHighlights(this.root, this.key);
      this.onMarks?.();
    }
    window.getSelection()?.removeAllRanges();
    this.hidePop();
  }

  private openNote(): void {
    this.noteBox.hidden = false;
    this.noteInput.value = this.pendingGroup ? groupNote(this.key, this.pendingGroup) : "";
    this.noteInput.focus();
  }

  private saveNote(): void {
    if (!this.key) return;
    const text = this.noteInput.value;
    if (this.pendingGroup) {
      setGroupNote(this.key, this.pendingGroup, text);
      refreshGroup(this.root, this.key, this.pendingGroup);
      this.onMarks?.();
      this.hidePop();
      return;
    }
    if (!this.pendingRange) return;
    const added = addHighlight(this.key, anchorsFromRange(this.pendingRange), "yellow");
    if (!added.length) return;
    setGroupNote(this.key, added[0].group, text);
    applyHighlights(this.root, this.key);
    window.getSelection()?.removeAllRanges();
    this.onMarks?.();
    this.hidePop();
  }

  private removeMark(): void {
    if (!this.pendingGroup || !this.key) return;
    removeHighlightGroup(this.key, this.pendingGroup);
    unwrapGroup(this.root, this.pendingGroup);
    this.onMarks?.();
    this.hidePop();
  }

  private onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;

    const group = groupAt(target);
    if (group) {
      e.preventDefault();
      this.pendingRange = null;
      this.pendingGroup = group;
      const mark = target.closest("mark.hl") as HTMLElement;
      const noted = groupNote(this.key, group);
      this.noteInput.value = noted;
      this.noteBox.hidden = !noted;
      this.showPop(mark.getBoundingClientRect(), true);
      return;
    }

    const copyBtn = target.closest(".code-copy") as HTMLElement | null;
    if (copyBtn) {
      e.preventDefault();
      const block = copyBtn.closest(".code-block");
      const code = block?.querySelector("code")?.textContent ?? "";
      void this.copy(code);
      copyBtn.textContent = "copied";
      copyBtn.classList.add("copied");
      window.setTimeout(() => {
        copyBtn.textContent = "copy";
        copyBtn.classList.remove("copied");
      }, 1400);
      return;
    }

    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href) return;

    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
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

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
  }
}
