import type { LoadedFile } from "./types";
import { getRenderer } from "./renderer";
import { isTauri } from "./platform";
import { el, clear } from "./util";

/** Owns the rendered document and click interactions inside it. */
export class Viewer {
  readonly root: HTMLElement;
  private current: LoadedFile | null = null;

  constructor() {
    this.root = el("article", {
      class: "markdown-body content",
      "aria-label": "Document content",
    });
    this.root.hidden = true;
    this.root.addEventListener("click", this.onClick);
  }

  get file(): LoadedFile | null {
    return this.current;
  }

  render(file: LoadedFile): void {
    this.current = file;
    const renderer = getRenderer(file.kind);
    const html = renderer.render(file.source);
    clear(this.root);
    this.root.innerHTML = html;
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }

  rerender(): void {
    if (this.current) this.render(this.current);
  }

  clear(): void {
    this.current = null;
    this.root.innerHTML = "";
    this.root.hidden = true;
  }

  private onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;

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
