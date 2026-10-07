import { isFindStep } from "./commands";
import { icon } from "./icons";
import { el } from "./util";

/** In-document find. Marks live in the article and are removed before a re-render. */
export class Finder {
  private hits: HTMLElement[] = [];
  private cursor = 0;
  private query = "";

  get activeQuery(): string {
    return this.query;
  }

  get index(): number {
    return this.cursor;
  }

  clear(root: ParentNode): void {
    const marks = [...root.querySelectorAll("mark.find-hit")];
    for (const mark of marks) {
      const text = document.createTextNode(mark.textContent || "");
      const parent = mark.parentNode;
      mark.replaceWith(text);
      parent?.normalize();
    }
    this.hits = [];
    this.cursor = 0;
    this.query = "";
  }

  apply(root: HTMLElement, query: string, index = 0): { current: number; total: number } {
    this.clear(root);
    this.query = query;
    const needle = query.trim();
    if (!needle) return { current: 0, total: 0 };
    this.paint(root, needle);
    if (this.hits.length === 0) return { current: 0, total: 0 };
    this.cursor = ((index % this.hits.length) + this.hits.length) % this.hits.length;
    this.markCurrent();
    return { current: this.cursor + 1, total: this.hits.length };
  }

  step(delta: number): { current: number; total: number } | null {
    if (this.hits.length === 0) return null;
    this.hits[this.cursor]?.classList.remove("current");
    const n = this.hits.length;
    this.cursor = (this.cursor + delta + n) % n;
    this.markCurrent();
    return { current: this.cursor + 1, total: n };
  }

  currentEl(): HTMLElement | null {
    return this.hits[this.cursor] ?? null;
  }

  private markCurrent(): void {
    for (const hit of this.hits) hit.classList.remove("current");
    this.hits[this.cursor]?.classList.add("current");
  }

  private paint(root: HTMLElement, needle: string): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node as Text);
      node = walker.nextNode();
    }
    const q = needle.toLowerCase();
    for (const text of nodes) {
      const value = text.nodeValue || "";
      const lower = value.toLowerCase();
      if (!lower.includes(q)) continue;
      const frag = document.createDocumentFragment();
      let i = 0;
      while (i < value.length) {
        const at = lower.indexOf(q, i);
        if (at < 0) {
          frag.append(value.slice(i));
          break;
        }
        if (at > i) frag.append(value.slice(i, at));
        const mark = document.createElement("mark");
        mark.className = "find-hit";
        mark.textContent = value.slice(at, at + needle.length);
        frag.append(mark);
        this.hits.push(mark);
        i = at + needle.length;
      }
      text.parentNode?.replaceChild(frag, text);
    }
  }
}

/** Find bar. The shell only decides when it may open. */
export class FindBar {
  readonly root: HTMLElement;
  private finder = new Finder();
  private input: HTMLInputElement;
  private count: HTMLElement;
  private timer = 0;

  constructor(
    private article: () => HTMLElement,
    private reveal: (hit: HTMLElement) => void,
  ) {
    this.input = el("input", {
      class: "find-input",
      type: "search",
      placeholder: "Find in document",
      "aria-label": "Find in document",
      autocomplete: "off",
      spellcheck: "false",
    }) as HTMLInputElement;
    this.count = el("span", { class: "find-count" }, []);
    const prev = el("button", { class: "icon-btn find-step", type: "button" }, ["Prev"]);
    const next = el("button", { class: "icon-btn find-step find-next", type: "button" }, ["Next"]);
    const close = el("button", { class: "icon-btn find-close", type: "button", "aria-label": "Close find" }, [icon("x")]);
    this.root = el("form", { class: "find-bar", role: "search" }, [this.input, this.count, prev, next, close]);
    this.root.hidden = true;

    this.root.addEventListener("submit", (e) => {
      e.preventDefault();
      this.step(1);
    });
    this.input.addEventListener("input", () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.run(0), 50);
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      this.step(e.shiftKey ? -1 : 1);
    });
    prev.addEventListener("click", () => this.step(-1));
    next.addEventListener("click", () => this.step(1));
    close.addEventListener("click", () => this.close());
  }

  get hidden(): boolean {
    return this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.input.focus();
    this.input.select();
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.root.hidden = true;
    this.finder.clear(this.article());
    this.count.textContent = "";
    this.input.value = "";
  }

  reapply(reveal: boolean): void {
    if (this.root.hidden || !this.input.value.trim()) return;
    const status = this.finder.apply(this.article(), this.input.value, this.finder.index);
    this.show(status);
    if (reveal && status.total > 0) this.revealCurrent();
  }

  consumeKey(e: KeyboardEvent): boolean {
    if (this.root.hidden || !isFindStep(e)) return false;
    e.preventDefault();
    this.step(e.shiftKey ? -1 : 1);
    return true;
  }

  private run(index: number): void {
    const status = this.finder.apply(this.article(), this.input.value, index);
    this.show(status);
    if (status.total > 0) this.revealCurrent();
  }

  private step(delta: number): void {
    if (!this.input.value.trim()) return;
    if (this.finder.currentEl() == null) {
      this.run(0);
      return;
    }
    const status = this.finder.step(delta);
    if (!status) return;
    this.show(status);
    this.revealCurrent();
  }

  private show(status: { current: number; total: number }): void {
    if (!this.input.value.trim()) this.count.textContent = "";
    else if (status.total === 0) this.count.textContent = "No matches";
    else this.count.textContent = `${status.current} of ${status.total}`;
  }

  private revealCurrent(): void {
    const hit = this.finder.currentEl();
    if (hit) this.reveal(hit);
  }
}
