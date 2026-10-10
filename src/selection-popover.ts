import { HIGHLIGHT_COLORS, type HighlightColor } from "./highlights";
import { el } from "./util";
const POPOVER_MARGIN = 8;
interface SelectionActions { mark(color: HighlightColor): void; note(): void; remove(): void; attach(): void }

/** Owns only selection controls and their viewport placement. */
export class SelectionPopover {
  readonly root: HTMLElement;
  constructor(private actions: SelectionActions) {
    this.root = this.buildPop(); document.body.append(this.root);
  }
  show(rect: DOMRect, state: { existing: boolean; attaching: boolean; hasRange: boolean }): void {
    this.root.hidden = false; this.root.classList.toggle("existing", state.existing);
    const attach = this.root.querySelector<HTMLButtonElement>(".sel-relink")!;
    attach.hidden = !state.attaching; attach.disabled = !state.hasRange;
    const margin = POPOVER_MARGIN, width = this.root.offsetWidth, height = this.root.offsetHeight;
    const clamp = (value: number, max: number): number => Math.max(margin, Math.min(value, max));
    const left = clamp(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin);
    const above = rect.top - height - margin;
    const top = clamp(above >= margin ? above : rect.bottom + margin, window.innerHeight - height - margin);
    this.root.style.left = `${left}px`; this.root.style.top = `${top}px`;
  }
  hide(): void { this.root.hidden = true; }
  dispose(): void { this.root.remove(); }


  private buildPop(): HTMLElement {
    const row = el("div", { class: "sel-row" }, []);
    for (const color of HIGHLIGHT_COLORS) {
      const btn = el("button", {
        class: `sel-swatch sel-${color}`,
        type: "button",
        title: `Mark ${color}`,
        "aria-label": `Mark ${color}`,
      }, []);
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.actions.mark(color));
      row.append(btn);
    }
    const noteBtn = el("button", { class: "btn sel-note-btn", type: "button" }, ["Note"]);
    noteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    noteBtn.addEventListener("click", () => this.actions.note());
    const removeBtn = el("button", { class: "btn sel-remove", type: "button" }, ["Remove"]);
    removeBtn.addEventListener("mousedown", (e) => e.preventDefault());
    removeBtn.addEventListener("click", () => this.actions.remove());
    const attach = el("button", { class: "btn sel-relink", type: "button", title: "Attach the selected passage to the note. Esc cancels." }, ["Attach"]);
    attach.hidden = true;
    attach.addEventListener("mousedown", (e) => e.preventDefault());
    attach.addEventListener("click", () => this.actions.attach());
    row.append(noteBtn, removeBtn, attach);

    const pop = el("div", { class: "sel-pop", role: "dialog", "aria-label": "Selection" }, [row]);
    pop.hidden = true;
    return pop;
  }
}
