import type { NoteDraft } from "./drafts";
import type { UnresolvedHighlight } from "./highlights";
import { el } from "./util";

export interface RecoveryState {
  fileKey: string;
  unresolved: UnresolvedHighlight[];
  drafts: NoteDraft[];
  issues: string[];
}
interface Actions {
  resume: (draft: NoteDraft) => void;
  discard: (draft: NoteDraft) => void;
  edit: (group: string) => void;
  relink: (group: string) => void;
  export: () => void;
}

/** A separate, optional surface. Never inserts recovery text into a book page. */
export class AnnotationRecovery {
  readonly toggle: HTMLButtonElement;
  readonly root: HTMLElement;
  private items = el("div", { class: "recovery-items" }, []);
  private heading = el("h2", { id: "recovery-heading", tabindex: "-1" }, ["Notes & recovery"]);

  constructor(private actions: Actions) {
    this.toggle = el("button", { class: "btn annotation-toggle", type: "button",
      "aria-controls": "annotation-recovery", "aria-expanded": "false" }, ["Notes & backup"]) as HTMLButtonElement;
    const close = this.button("Close", () => this.hide());
    close.setAttribute("aria-label", "Close recovery");
    const backup = this.button("Export reader backup", actions.export);
    const help = el("p", { class: "recovery-help" }, [
      "Backup contains MARK data and raw storage values, not your source books. Keep source files separately. Backup import is not available yet.",
    ]);
    this.root = el("aside", { id: "annotation-recovery", class: "annotation-recovery",
      "aria-labelledby": "recovery-heading" }, [
      el("div", { class: "recovery-head" }, [this.heading, close]), this.items, backup, help,
    ]);
    this.root.hidden = true;
    this.toggle.addEventListener("click", () => this.root.hidden ? this.show() : this.hide());
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = el("button", { class: "btn", type: "button" }, [label]) as HTMLButtonElement;
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", action);
    return button;
  }

  show(): void {
    this.root.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.heading.focus({ preventScroll: true });
  }
  hide(): void {
    const wasOpen = !this.root.hidden;
    this.root.hidden = true;
    this.toggle.setAttribute("aria-expanded", "false");
    if (wasOpen) this.toggle.focus({ preventScroll: true });
  }
  dispose(): void { this.root.remove(); this.toggle.remove(); }

  refresh(state: RecoveryState): void {
    const count = state.unresolved.length + state.drafts.length;
    this.toggle.textContent = `Notes & backup${count ? ` (${count})` : ""}${state.issues.length ? " !" : ""}`;
    this.toggle.classList.toggle("has-storage-issue", state.issues.length > 0);
    this.toggle.setAttribute("aria-label", `Notes and backup: ${count} items${state.issues.length ? ", storage needs attention" : ""}`);
    this.items.replaceChildren();
    if (state.issues.length) {
      this.items.append(el("div", { class: "recovery-warning", role: "alert" }, [
        el("strong", {}, ["Some changes are not saved."]),
        ...state.issues.map((message) => el("p", {}, [message])),
        el("p", {}, ["Keep this window open. Export a backup before retrying or closing MARK."]),
      ]));
    }
    if (!count) this.items.append(el("p", {}, ["No drafts or unattached notes."]));
    if (state.drafts.length) this.items.append(el("h3", {}, ["Drafts"]));
    for (const draft of state.drafts) {
      const item = el("section", { class: "recovery-item", "data-draft-id": draft.id }, [
        el("small", {}, [draft.fileKey]),
        el("blockquote", {}, [draft.anchors.map((a) => a.text).join("")]),
        el("p", { class: "recovery-note" }, [draft.text || "(empty draft)"]),
        el("div", { class: "recovery-actions" }, [
          this.button(draft.fileKey === state.fileKey ? "Resume / retry" : "Open source to resume", () => this.actions.resume(draft)),
          this.button("Discard draft", () => this.actions.discard(draft)),
        ]),
      ]);
      this.items.append(item);
    }
    if (state.unresolved.length) this.items.append(el("h3", {}, ["Unattached passages"]));
    const reasons = { ambiguous: "More than one possible passage", missing: "Passage not found",
      changed: "Passage fragments no longer agree", overlap: "Overlapping passages need your choice" };
    for (const orphan of state.unresolved) {
      this.items.append(el("section", { class: "recovery-item" }, [
        el("small", {}, [reasons[orphan.reason]]), el("blockquote", {}, [orphan.quote]),
        el("p", { class: "recovery-note" }, [orphan.note || "(highlight without a note)"]),
        el("div", { class: "recovery-actions" }, [
          this.button("Edit note", () => this.actions.edit(orphan.group)),
          this.button("Attach to selected passage", () => this.actions.relink(orphan.group)),
        ]),
      ]));
    }
  }
}
