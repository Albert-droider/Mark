import { el } from "./util";

export const NOTE_HOVER_MS = 2000;
interface HoverActions { canShow(): boolean; readNote(group: string): string; failed(error: unknown): void }

/** Legacy notes stay readable without putting their text in the article. */
export class LegacyNoteHover {
  private panel: HTMLElement;
  private text: HTMLElement;
  private timer = 0;
  private group: string | null = null;
  constructor(private root: HTMLElement, private actions: HoverActions) {
    const tip = this.buildTip(); this.panel = tip.tip; this.text = tip.text;
    document.body.append(this.panel);
    root.addEventListener("pointerover", this.onMarkOver);
    root.addEventListener("pointermove", this.onMarkMove);
    root.addEventListener("pointerout", this.onMarkOut);
  }
  dispose(): void {
    this.hideTip();
    this.root.removeEventListener("pointerover", this.onMarkOver);
    this.root.removeEventListener("pointermove", this.onMarkMove);
    this.root.removeEventListener("pointerout", this.onMarkOut);
    this.panel.remove();
  }


  /** A fixed tag on the body. It never sits in the scrolling column or the book. */
  private buildTip(): { tip: HTMLElement; text: HTMLElement } {
    const text = el("span", { class: "note-tip-text" }, []);
    const tip = el("div", { class: "note-tip", role: "tooltip", "aria-hidden": "true" }, [
      el("span", { class: "note-tip-kicker" }, ["Note"]),
      text,
    ]);
    tip.hidden = true;
    tip.style.position = "fixed";
    tip.style.pointerEvents = "none";
    tip.style.overflow = "hidden";
    return { tip, text };
  }


  hideTip(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.group = null;
    this.panel.hidden = true;
  }


  private onMarkMove = (e: PointerEvent): void => {
    if (this.group) return;
    this.onMarkOver(e);
  };


  private onMarkOver = (e: PointerEvent): void => {
    const target = e.target;
    if (!(target instanceof Element) || target.closest(".reader-note-mark")) return;
    const mark = target.closest("mark.has-note") as HTMLElement | null;
    if (!mark || !this.root.contains(mark)) return;
    const group = mark.dataset.hlGroup || "";
    if (!group || group === this.group) return;
    this.armTip(mark, group);
  };


  private onMarkOut = (e: PointerEvent): void => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const mark = target.closest("mark.has-note") as HTMLElement | null;
    if (!mark || mark.dataset.hlGroup !== this.group) return;
    const next = e.relatedTarget;
    if (next instanceof Element) {
      const stay = next.closest("mark.has-note") as HTMLElement | null;
      if (stay?.dataset.hlGroup === mark.dataset.hlGroup) return;
    }
    this.hideTip();
  };


  private armTip(mark: HTMLElement, group: string): void {
    window.clearTimeout(this.timer);
    this.panel.hidden = true;
    this.group = group;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.group !== group || !mark.isConnected || !this.actions.canShow()) {
        this.group = null;
        return;
      }
      try {
        const note = this.actions.readNote(group);
        if (!note) { this.group = null; return; }
        this.showTip(mark, note);
      } catch (error) { this.actions.failed(error); }
    }, NOTE_HOVER_MS);
  }


  private showTip(mark: HTMLElement, note: string): void {
    this.text.textContent = note;
    this.panel.dataset.color = mark.classList.contains("hl-pink")
      ? "pink"
      : mark.classList.contains("hl-green")
        ? "green"
        : "yellow";
    this.panel.hidden = false;
    this.placeTip(mark);
  }


  /** Pin the tag to the viewport. It is not in the document, so the column does not grow. */
  private placeTip(mark: HTMLElement): void {
    const rect = mark.getBoundingClientRect();
    const marginX = 12;
    const width = this.panel.offsetWidth;
    const height = this.panel.offsetHeight;
    const topSafe = 56;
    const bottomSafe = 64;
    let top = rect.top - height - 6;
    if (top < topSafe) top = rect.bottom + 6;
    const maxTop = window.innerHeight - height - bottomSafe;
    if (top > maxTop) top = Math.max(topSafe, maxTop);
    let left = rect.left;
    const maxLeft = window.innerWidth - width - marginX;
    if (left > maxLeft) left = Math.max(marginX, maxLeft);
    if (left < marginX) left = marginX;
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
  }
}
