import { el } from "./util";

/** One accessible intent group, instead of permanent unrelated header buttons. */
export class ActionPopover {
  readonly wrap: HTMLElement;
  readonly root: HTMLElement;

  constructor(readonly button: HTMLButtonElement, content: Node[], id: string, portal = false) {
    this.root = el("div", { class: "action-popover", id, role: "dialog", "aria-label": button.getAttribute("aria-label") || "Actions" }, content);
    this.root.hidden = true;
    this.wrap = el("div", { class: "action-wrap" }, [button, this.root]);
    if (portal) document.body.append(this.root);
    button.setAttribute("aria-controls", id);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", this.toggle);
    this.root.addEventListener("keydown", this.onKey);
    document.addEventListener("pointerdown", this.onOutside);
    window.addEventListener("resize", this.onResize);
  }

  get isOpen(): boolean { return !this.root.hidden; }
  show(): void {
    this.root.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    const rect = this.button.getBoundingClientRect();
    const below = rect.bottom + 6, above = rect.top - this.root.offsetHeight - 6;
    const maxTop = window.innerHeight - this.root.offsetHeight - 8;
    this.root.style.top = `${below <= maxTop ? below : above >= 8 ? above : Math.max(8, maxTop)}px`;
    this.root.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - this.root.offsetWidth - 8))}px`;
    this.items()[0]?.focus({ preventScroll: true });
  }
  hide(focus = false): void {
    this.root.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    if (focus) this.button.focus({ preventScroll: true });
  }
  private toggle = (): void => { this.isOpen ? this.hide() : this.show(); };
  private onOutside = (event: PointerEvent): void => {
    if (event.target instanceof Node && !this.wrap.contains(event.target) && !this.root.contains(event.target)) this.hide();
  };
  private onResize = (): void => this.hide();
  private items(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
      .filter(button => !button.closest("[hidden],.hidden"));
  }
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); this.hide(true);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !(event.target instanceof Element && event.target.closest(".recent-menu"))) {
      const items = this.items();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); event.stopPropagation();
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };
  dispose(): void {
    this.button.removeEventListener("click", this.toggle);
    this.root.removeEventListener("keydown", this.onKey);
    document.removeEventListener("pointerdown", this.onOutside);
    window.removeEventListener("resize", this.onResize);
    this.root.remove(); this.wrap.remove();
  }
}
