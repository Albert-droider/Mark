/**
 * Two-page paper spread. The article stays one document; columns lay it out
 * like an open book, and turning the page slides the next pair into view.
 */
export class Book {
  index = 0;
  spreads = 1;
  pages = 2;
  columns = 1;
  private spreadWidth = 0;
  private pageWidth = 0;
  private gap = 0;
  private wheelAt = 0;
  private enabled = false;
  private observer: ResizeObserver;

  constructor(
    private sheet: HTMLElement,
    private article: HTMLElement,
    private onChange: () => void,
  ) {
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(sheet);
    sheet.addEventListener("click", this.onClick);
    sheet.addEventListener("wheel", this.onWheel, { passive: false });
  }

  /** Book mode paginates. Document mode leaves the article as one scrolling column. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.release();
      return;
    }
    this.layout();
  }

  ratio(): number {
    if (!this.enabled || this.spreads <= 1) return 0;
    return this.index / (this.spreads - 1);
  }

  scrollToRatio(ratio: number): void {
    if (this.spreads <= 1) {
      this.go(0, false);
      return;
    }
    const at = Math.round(Math.min(1, Math.max(0, ratio)) * (this.spreads - 1));
    this.go(at, false);
  }

  label(): string {
    if (this.columns <= 0) return "";
    const left = this.index * this.pages + 1;
    const right = Math.min(this.columns, left + this.pages - 1);
    if (left === right) return `${left} / ${this.columns}`;
    return `${left}\u2013${right} / ${this.columns}`;
  }

  canPrev(): boolean {
    return this.index > 0;
  }

  canNext(): boolean {
    return this.index < this.spreads - 1;
  }

  next(): void {
    this.go(this.index + 1, true);
  }

  prev(): void {
    this.go(this.index - 1, true);
  }

  go(index: number, animate: boolean): void {
    const next = Math.max(0, Math.min(this.spreads - 1, index));
    const changed = next !== this.index;
    this.index = next;
    this.sheet.classList.toggle("turning", animate && changed);
    this.applyTransform();
    this.onChange();
  }

  /** Turn to the spread that contains this element. */
  show(el: HTMLElement): void {
    if (this.spreadWidth < 40) this.layout();
    if (this.spreadWidth < 40) return;
    const x = el.getBoundingClientRect().left - this.article.getBoundingClientRect().left;
    this.go(Math.floor(Math.max(0, x) / this.step()), true);
  }

  /** First heading on the open spread, or the one that started the section. */
  headingId(): string | null {
    if (this.spreadWidth < 40) return null;
    const start = this.index * this.step();
    const end = start + this.spreadWidth;
    const heads = this.article.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
    let before: string | null = null;
    for (const h of heads) {
      if (!h.id) continue;
      const x = h.getBoundingClientRect().left - this.article.getBoundingClientRect().left;
      if (x >= start - 8 && x < end - 8) return h.id;
      if (x < start) before = h.id;
    }
    return before;
  }

  layout(): void {
    if (!this.enabled) return;
    const cs = getComputedStyle(this.sheet);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const innerW = this.sheet.clientWidth - padX;
    const innerH = this.sheet.clientHeight - padY;
    if (innerW < 80 || innerH < 80) return;

    this.pages = innerW < 700 ? 1 : 2;
    this.gap = this.pages === 2 ? 56 : 0;
    this.pageWidth = this.pages === 2 ? (innerW - this.gap) / 2 : innerW;
    this.spreadWidth = innerW;

    const article = this.article;
    article.style.height = `${innerH}px`;
    article.style.width = "100%";
    article.style.maxWidth = "none";
    article.style.margin = "0";
    article.style.padding = "0";
    article.style.columnWidth = `${this.pageWidth}px`;
    article.style.columnGap = `${this.gap}px`;
    article.style.columnFill = "auto";

    const width = article.scrollWidth;
    const stride = this.pageWidth + this.gap;
    this.columns = Math.max(1, Math.round((width + this.gap) / stride));
    this.spreads = Math.max(1, Math.ceil(this.columns / this.pages));
    if (this.index > this.spreads - 1) this.index = this.spreads - 1;

    this.sheet.classList.toggle("spread", this.pages === 2);
    this.sheet.classList.remove("turning");
    this.applyTransform();
    this.onChange();
  }

  /** Distance from one spread to the next, including the gutter after the right page. */
  private step(): number {
    if (this.spreadWidth < 40) return 1;
    return this.pages === 2 ? this.spreadWidth + this.gap : this.spreadWidth;
  }

  private applyTransform(): void {
    this.article.style.transform = `translateX(${-this.index * this.step()}px)`;
  }

  /** Drop the column layout so the article can scroll as a normal document. */
  private release(): void {
    const article = this.article;
    for (const prop of ["height", "width", "max-width", "margin", "padding", "column-width", "column-gap", "column-fill", "transform"]) {
      article.style.removeProperty(prop);
    }
    this.sheet.classList.remove("spread", "turning");
    this.index = 0;
    this.spreads = 1;
    this.columns = 1;
  }

  private onClick = (e: MouseEvent): void => {
    if (!this.enabled || e.button !== 0) return;
    if ((window.getSelection()?.toString() || "").trim()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest("a, button, summary, input, textarea, select, label, mark.hl, td, th, [contenteditable]")) return;
    const rect = this.sheet.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.16) this.prev();
    else if (x > rect.width * 0.84) this.next();
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled || e.ctrlKey || e.metaKey) return;
    const host = e.target instanceof Element ? e.target.closest(".code-pre, .artifact-slot, .source-input") : null;
    if (host instanceof HTMLElement && host.scrollHeight > host.clientHeight + 4) {
      const down = e.deltaY > 0;
      const atEnd = host.scrollTop + host.clientHeight >= host.scrollHeight - 2;
      const atStart = host.scrollTop <= 0;
      if ((down && !atEnd) || (!down && !atStart)) return;
    }
    e.preventDefault();
    const now = performance.now();
    if (now - this.wheelAt < 420) return;
    if (Math.abs(e.deltaY) < 8 && Math.abs(e.deltaX) < 8) return;
    this.wheelAt = now;
    const forward = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX > 0 : e.deltaY > 0;
    if (forward) this.next();
    else this.prev();
  };
}
