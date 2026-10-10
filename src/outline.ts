import { el } from "./util";
import { readRaw, ReaderStorageError, reportStorageIssue, writeStored } from "./reader-storage";

const STORAGE_KEY = "mark.outline.v1";

function readOpen(): boolean {
  const raw = readRaw(STORAGE_KEY);
  if (raw !== null && raw !== "0" && raw !== "1") throw new ReaderStorageError(STORAGE_KEY, "corrupt", "Contents preference is invalid. It was not replaced; export a backup.");
  return raw === "1";
}

/** Contents column. The chrome button stays on the app shell. */
export class Outline {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private open: boolean;

  constructor(
    private workspace: HTMLElement,
    private hooks: { jump: (id: string) => void; changed: () => void },
  ) {
    this.list = el("div", { class: "outline-list" }, []);
    this.root = el("nav", { class: "outline", "aria-label": "Contents" }, [
      el("div", { class: "outline-label" }, ["Contents"]),
      this.list,
    ]);
    try { this.open = readOpen(); }
    catch (error) { this.open = false; reportStorageIssue(error); }
    this.root.toggleAttribute("inert", true);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    try { readOpen(); writeStored(STORAGE_KEY, open ? 1 : 0); }
    catch (error) { reportStorageIssue(error); }
  }

  /** Show the column only while a document is open and the user left it open. */
  sync(fileOpen: boolean): void {
    const show = fileOpen && this.open;
    this.root.classList.toggle("open", show);
    this.root.toggleAttribute("inert", !show);
  }

  toggle(fileOpen: boolean, headingCount: number): "ok" | "no-file" | "no-headings" {
    if (!fileOpen) return "no-file";
    if (!this.open && headingCount === 0) return "no-headings";
    this.setOpen(!this.open);
    return "ok";
  }

  rebuild(article: HTMLElement | null): void {
    this.list.replaceChildren();
    const heads = article ? [...article.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")] : [];
    if (!article || heads.length === 0) {
      this.list.append(el("p", { class: "outline-empty" }, ["No headings"]));
      return;
    }
    for (const h of heads) {
      if (!h.id) continue;
      const btn = el("button", {
        class: "outline-item",
        type: "button",
        "data-level": h.tagName.slice(1),
        "data-id": h.id,
      }, [h.textContent?.trim() || "Untitled"]);
      btn.addEventListener("click", () => {
        this.hooks.jump(h.id);
        if (window.matchMedia("(max-width: 720px)").matches) {
          this.setOpen(false);
          this.hooks.changed();
        }
      });
      this.list.append(btn);
    }
  }

  /** Mark the heading that belongs to the open spread. */
  mark(id: string | null): void {
    this.list.querySelectorAll<HTMLElement>(".outline-item").forEach((btn) => {
      btn.classList.toggle("current", !!id && btn.dataset.id === id);
    });
  }
}
