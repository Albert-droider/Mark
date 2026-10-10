import { matchCommand, type CommandId } from "./commands";
interface ShortcutKeyConsumer { consumeKey(event: KeyboardEvent): boolean }
interface ShortcutPanel { readonly isOpen: boolean; setOpen(open: boolean): void }
interface ShortcutMenu { readonly isOpen: boolean; hide(restoreFocus: boolean): void }

export interface ReaderShortcutServices {
  recent: ShortcutKeyConsumer & { isOpen(): boolean; close(): void };
  find: ShortcutKeyConsumer & { readonly hidden: boolean; close(): void };
  panel: ShortcutPanel; outline: ShortcutPanel;
  fileMenu: ShortcutMenu; viewMenu: ShortcutMenu; desktop: boolean;
  refreshChrome(): void; readKey(event: KeyboardEvent): void;
  commands: Record<CommandId, () => void>;
}
/** Owns keyboard routing, not the operations invoked by commands. */
export class ReaderShortcuts {
  constructor(private services: ReaderShortcutServices) {}
  mount(): void { window.addEventListener("keydown", event => this.onKey(event)); }
  runCommand(command: CommandId): void { this.services.commands[command](); }


  private onKey(e: KeyboardEvent): void {
    // Editors own composition and any event they already handled.
    if (e.isComposing || e.defaultPrevented) return;
    if (this.services.recent.consumeKey(e)) return;
    if (this.services.find.consumeKey(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.dismiss();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (this.canPage(e) && !mod && isPagingKey(e)) {
      this.services.readKey(e);
      return;
    }
    const cmd = matchCommand(e, { typing: this.isTyping(e), desktop: this.services.desktop });
    if (!cmd) return;
    e.preventDefault();
    this.runCommand(cmd);
  }


  private dismiss(): void {
    if (!this.services.find.hidden) { this.services.find.close(); return; }
    if (this.services.recent.isOpen()) { this.services.recent.close(); return; }
    if (this.services.fileMenu.isOpen) { this.services.fileMenu.hide(true); return; }
    if (this.services.viewMenu.isOpen) { this.services.viewMenu.hide(true); return; }
    if (this.services.panel.isOpen) { this.services.panel.setOpen(false); return; }
    if (this.services.outline.isOpen) {
      this.services.outline.setOpen(false);
      this.services.refreshChrome();
    }
  }


  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }


  private canPage(e: KeyboardEvent): boolean {
    if (this.isTyping(e)) return false;
    const t = e.target as HTMLElement | null;
    if (!t) return true;
    return t.tagName !== "BUTTON" && t.tagName !== "A" && t.tagName !== "SELECT";
  }
}
function isPagingKey(event: KeyboardEvent): boolean {
  return [" ", "PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key);
}
