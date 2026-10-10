import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionPopover } from "../action-popover";
const menus: ActionPopover[] = [];
afterEach(() => { menus.forEach(menu => menu.dispose()); menus.length = 0; document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function menu(portal = false) {
  const trigger = document.createElement("button");
  trigger.setAttribute("aria-label", "File actions");
  const first = document.createElement("button"), second = document.createElement("button");
  const pop = new ActionPopover(trigger, [first, second], "test-actions", portal);
  menus.push(pop); document.body.append(pop.wrap);
  return { pop, trigger, first, second };
}
describe("grouped accessible actions", () => {
  it("opens on demand, navigates with arrows, and returns focus after Escape", () => {
    const { pop, trigger, first, second } = menu();
    expect(pop.root.hidden).toBe(true);
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(second);
    second.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(pop.root.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
  it("clamps a block menu horizontally and opens above a low trigger", () => {
    vi.stubGlobal("innerWidth", 460); vi.stubGlobal("innerHeight", 340);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
    const { pop, trigger } = menu();
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(440, 290, 32, 32));
    pop.show();
    expect(pop.root.style.left).toBe("272px");
    expect(pop.root.style.top).toBe("104px");
  });
  it("keeps portalled controls out of transformed book pages and disposes them", () => {
    const { pop, first } = menu(true);
    expect(pop.wrap.contains(pop.root)).toBe(false);
    pop.show();
    first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(pop.isOpen).toBe(true);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(pop.isOpen).toBe(false);
    pop.dispose();
    expect(document.getElementById("test-actions")).toBeNull();
  });
});
