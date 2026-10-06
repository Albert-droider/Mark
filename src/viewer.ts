import type { LoadedFile } from "./types";
import { getRenderer } from "./renderer";
import { isTauri } from "./platform";
import { el, clear } from "./util";
import {
  addHighlight,
  anchorsFromRange,
  applyHighlights,
  groupAt,
  removeHighlightGroup,
  unwrapGroup,
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from "./highlights";

/** Owns the rendered document and click interactions inside it. */
export class Viewer {
  readonly root: HTMLElement;
  private current: LoadedFile | null = null;

  /** Selection toolbar. Lives in <body>, not in the document, so it survives a
   *  re-render and cannot be picked up by print or `content` selectors. */
  private toolbar: HTMLElement;
  private pendingRange: Range | null = null;
  private pendingGroup: string | null = null;

  constructor() {
    this.root = el("article", {
      class: "markdown-body content",
      "aria-label": "Document content",
    });
    this.root.hidden = true;
    this.root.addEventListener("click", this.onClick);

    this.toolbar = this.buildToolbar();
    document.body.append(this.toolbar);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hideToolbar();
    });
    document.addEventListener("scroll", () => this.hideToolbar(), true);
    window.addEventListener("resize", () => this.hideToolbar());
  }

  get file(): LoadedFile | null {
    return this.current;
  }

  /** Key of the open document: highlights and reading position share it. */
  private get key(): string {
    return this.current ? this.current.path || this.current.name : "";
  }

  render(file: LoadedFile): void {
    this.current = file;
    const renderer = getRenderer(file.kind);
    const html = renderer.render(file.source);
    clear(this.root);
    this.root.innerHTML = html;
    this.root.hidden = false;
    this.root.scrollTop = 0;
    this.hideToolbar();
    applyHighlights(this.root, this.key);
  }

  rerender(): void {
    if (this.current) this.render(this.current);
  }

  clear(): void {
    this.current = null;
    this.root.innerHTML = "";
    this.root.hidden = true;
    this.hideToolbar();
  }

  // ---------------------------------------------------------------- highlights

  private buildToolbar(): HTMLElement {
    const bar = el("div", { class: "hl-toolbar", role: "toolbar", "aria-label": "Highlight" }, []);
    bar.hidden = true;
    for (const color of HIGHLIGHT_COLORS) {
      const btn = el("button", {
        class: `hl-swatch hl-${color}`,
        type: "button",
        title: `Highlight (${color})`,
        "aria-label": `Highlight ${color}`,
      }, []);
      // mousedown would collapse the selection before click lands.
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.highlight(color));
      bar.append(btn);
    }
    const remove = el("button", { class: "hl-remove", type: "button", title: "Remove highlight" }, ["remove"]);
    remove.addEventListener("mousedown", (e) => e.preventDefault());
    remove.addEventListener("click", () => this.remove());
    bar.append(remove);
    return bar;
  }

  private onMouseUp = (e: MouseEvent) => {
    if (this.toolbar.contains(e.target as Node)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this.hideToolbar();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!this.root.contains(range.commonAncestorContainer)) {
      this.hideToolbar();
      return;
    }
    this.pendingRange = range.cloneRange();
    this.pendingGroup = null;
    this.showToolbar(range.getBoundingClientRect(), true);
  };

  private showToolbar(rect: DOMRect, withColors: boolean): void {
    this.toolbar.hidden = false;
    this.toolbar.classList.toggle("only-remove", !withColors);
    const x = Math.min(Math.max(rect.left + rect.width / 2, 72), window.innerWidth - 72);
    const y = Math.max(rect.top - 10, 12);
    this.toolbar.style.left = `${x}px`;
    // A highlight on the first line has no room above it, so flip below instead.
    const above = rect.top - 10 > 44;
    this.toolbar.style.top = above ? `${y}px` : `${rect.bottom + 10}px`;
    this.toolbar.classList.toggle("below", !above);
  }

  private hideToolbar(): void {
    this.toolbar.hidden = true;
    this.pendingRange = null;
    this.pendingGroup = null;
  }

  private highlight(color: HighlightColor): void {
    if (!this.pendingRange || !this.key) return;
    const anchors = anchorsFromRange(this.pendingRange);
    const added = addHighlight(this.key, anchors, color);
    if (added.length) applyHighlights(this.root, this.key);
    window.getSelection()?.removeAllRanges();
    this.hideToolbar();
  }

  private remove(): void {
    if (!this.pendingGroup || !this.key) return;
    removeHighlightGroup(this.key, this.pendingGroup);
    unwrapGroup(this.root, this.pendingGroup);
    this.hideToolbar();
  }

  // -------------------------------------------------------------------- clicks

  private onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;

    const group = groupAt(target);
    if (group) {
      this.pendingRange = null;
      this.pendingGroup = group;
      const mark = target.closest("mark.hl") as HTMLElement;
      this.showToolbar(mark.getBoundingClientRect(), false);
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
    if (anchor) {
      const href = anchor.getAttribute("href") || "";
      if (/^(https?:|mailto:|tel:|ftp:)/i.test(href) && isTauri) {
        e.preventDefault();
        void import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => {
            window.open(href, "_blank", "noopener");
          });
      }
      // internal #anchors and browser-mode links use default behavior
    }
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
