import { isTauri } from "./platform";
import { clearRecent, forgetOtherPlaces, getRecent } from "./store";
import { basename, dirname, el } from "./util";

/** Recent-file button, menu, and the list on the empty state. */
export class RecentFiles {
  readonly button: HTMLElement;
  readonly menu: HTMLElement;
  readonly wrap: HTMLElement;
  private cursor = 0;
  private emptyList: HTMLElement | null = null;

  constructor(private hooks: { openPath: (path: string) => void; placeKey: () => string }) {
    this.button = el("button", {
      class: "icon-btn recent-btn",
      type: "button",
      title: "Recent files (R)",
      "aria-label": "Recent files",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
    }, ["Recent"]);
    this.menu = el("div", { class: "recent-menu", role: "menu" }, []);
    this.wrap = el("div", { class: "recent-wrap" }, [this.button, this.menu]);
    if (!isTauri) this.button.classList.add("hidden");
  }

  attachEmpty(list: HTMLElement): void {
    this.emptyList = list;
  }

  isOpen(): boolean {
    return this.menu.classList.contains("open");
  }

  contains(node: Node | null): boolean {
    return !!node && this.menu.contains(node);
  }

  refresh(): void {
    this.fillEmpty();
    this.fillMenu();
  }

  toggle(): void {
    if (!isTauri) return;
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.fillMenu();
    this.menu.classList.add("open");
    this.button.setAttribute("aria-expanded", "true");
    this.cursor = 0;
    const items = this.items();
    items.forEach((b, i) => b.classList.toggle("active", i === 0));
    (items[0] ?? this.button).focus();
  }

  close(): void {
    this.menu.classList.remove("open");
    this.button.setAttribute("aria-expanded", "false");
  }

  /** Menu arrows, enter, tab, and escape. Returns true when the event belongs to the menu. */
  consumeKey(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey;
    if (!this.isOpen() || mod) return false;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== "Escape" && e.key !== "Tab") {
      return false;
    }
    const items = this.items();
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      this.close();
      this.button.focus();
      return true;
    }
    if (items.length === 0) return true;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.cursor = (this.cursor + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.cursor = (this.cursor - 1 + items.length) % items.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[this.cursor]?.click();
      return true;
    }
    items.forEach((b, i) => b.classList.toggle("active", i === this.cursor));
    items[this.cursor]?.focus();
    return true;
  }

  private items(): HTMLButtonElement[] {
    return [...this.menu.querySelectorAll<HTMLButtonElement>(".recent-menu-item")];
  }

  private fillEmpty(): void {
    const list = this.emptyList;
    if (!list) return;
    const recent = getRecent();
    list.replaceChildren();
    if (!isTauri || recent.length === 0) {
      list.append(el("div", { class: "empty-recent-none" }, ["No recent files yet."]));
      return;
    }
    list.append(el("div", { class: "empty-recent-title" }, ["Recent"]));
    for (const p of recent.slice(0, 8)) {
      const item = el("button", { class: "recent-item", type: "button", title: p }, [
        el("span", { class: "recent-name" }, [basename(p)]),
        el("span", { class: "recent-dir" }, [dirname(p) || p]),
      ]);
      item.addEventListener("click", () => this.hooks.openPath(p));
      list.append(item);
    }
  }

  private fillMenu(): void {
    const recent = getRecent();
    this.menu.replaceChildren();
    if (recent.length === 0) {
      this.menu.append(el("div", { class: "recent-empty" }, ["No recent files"]));
      return;
    }
    for (const p of recent.slice(0, 12)) {
      const item = el("button", { class: "recent-menu-item", type: "button", role: "menuitem", title: p }, [
        el("span", { class: "recent-name" }, [basename(p)]),
        el("span", { class: "recent-path" }, [p]),
      ]);
      item.addEventListener("click", () => {
        this.close();
        this.hooks.openPath(p);
      });
      this.menu.append(item);
    }
    const clear = el("button", { class: "recent-clear", type: "button" }, ["Clear recent"]);
    clear.addEventListener("click", () => this.clearAll());
    this.menu.append(clear);
  }

  private clearAll(): void {
    const key = this.hooks.placeKey();
    clearRecent();
    forgetOtherPlaces(key ? [key] : []);
    this.close();
    this.refresh();
  }
}
