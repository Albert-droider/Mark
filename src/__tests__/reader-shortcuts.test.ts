import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderShortcuts } from "../reader-shortcuts";

const listeners: EventListenerOrEventListenerObject[] = [];

function shortcutFixture() {
  const commands = {
    open: vi.fn(), find: vi.fn(), "find-next": vi.fn(), contents: vi.fn(), reload: vi.fn(),
    close: vi.fn(), recent: vi.fn(), theme: vi.fn(), layout: vi.fn(), settings: vi.fn(),
    "zoom-in": vi.fn(), "zoom-out": vi.fn(), "zoom-reset": vi.fn(), print: vi.fn(),
  };
  const services = {
    recent: { consumeKey: vi.fn(() => false), isOpen: vi.fn(() => false), close: vi.fn() },
    find: { consumeKey: vi.fn(() => false), hidden: true, close: vi.fn() },
    panel: { isOpen: false, setOpen: vi.fn() }, outline: { isOpen: false, setOpen: vi.fn() },
    fileMenu: { isOpen: false, hide: vi.fn() }, viewMenu: { isOpen: false, hide: vi.fn() },
    desktop: false, refreshChrome: vi.fn(), readKey: vi.fn(), commands,
  };
  const addListener = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "keydown") listeners.push(listener);
    addListener(type, listener, options);
  });
  const shortcuts = new ReaderShortcuts(services);
  shortcuts.mount();
  return { shortcuts, services, commands };
}

function pressKey(key: string, options: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const listener of listeners.splice(0)) window.removeEventListener("keydown", listener);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("reader keyboard event ownership", () => {
  it("does not interrupt IME composition with a global command", () => {
    const { commands } = shortcutFixture();
    const event = pressKey("o", { ctrlKey: true, isComposing: true });
    expect(commands.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves an event already handled by an editor alone", () => {
    const { commands } = shortcutFixture();
    const input = document.createElement("textarea");
    document.body.append(input);
    input.addEventListener("keydown", event => event.preventDefault());
    pressKey("o", { ctrlKey: true }, input);
    expect(commands.open).not.toHaveBeenCalled();
  });

  it("routes commands with Ctrl or Command and leaves unknown chords alone", () => {
    const { shortcuts, commands } = shortcutFixture();
    expect(pressKey("o", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(pressKey("f", { metaKey: true }).defaultPrevented).toBe(true);
    shortcuts.runCommand("print");
    expect(commands.open).toHaveBeenCalledOnce();
    expect(commands.find).toHaveBeenCalledOnce();
    expect(commands.print).toHaveBeenCalledOnce();
    expect(pressKey("q", { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it("only enables the unmodified recent shortcut in the desktop shell", () => {
    const { services, commands } = shortcutFixture();
    expect(pressKey("r").defaultPrevented).toBe(false);
    expect(commands.recent).not.toHaveBeenCalled();
    services.desktop = true;
    expect(pressKey("r").defaultPrevented).toBe(true);
    expect(commands.recent).toHaveBeenCalledOnce();
  });

  it("gives recent and find their own key events before global routing", () => {
    const { services, commands } = shortcutFixture();
    services.recent.consumeKey.mockReturnValue(true);
    pressKey("o", { ctrlKey: true });
    expect(services.find.consumeKey).not.toHaveBeenCalled();
    services.recent.consumeKey.mockReturnValue(false);
    services.find.consumeKey.mockReturnValue(true);
    pressKey("o", { ctrlKey: true });
    expect(commands.open).not.toHaveBeenCalled();
  });

  it("pages the reader without stealing keys from inputs or controls", () => {
    const { services } = shortcutFixture();
    const pageEvent = pressKey("PageDown");
    expect(services.readKey).toHaveBeenCalledWith(pageEvent);
    services.readKey.mockClear();
    for (const tag of ["input", "textarea", "select", "button", "a"]) {
      const control = document.createElement(tag);
      document.body.append(control);
      expect(pressKey(" ", {}, control).defaultPrevented).toBe(false);
    }
    expect(services.readKey).not.toHaveBeenCalled();
  });

  it("leaves editable cells and modified paging keys with their owner", () => {
    const { services } = shortcutFixture();
    const editor = document.createElement("div");
    Object.defineProperty(editor, "isContentEditable", { value: true });
    document.body.append(editor);
    pressKey("ArrowDown", {}, editor);
    pressKey("PageDown", { ctrlKey: true });
    expect(services.readKey).not.toHaveBeenCalled();
    expect(pressKey("x").defaultPrevented).toBe(false);
  });

  it("dismisses find before recent when Escape reaches the shell", () => {
    const { services } = shortcutFixture();
    services.find.hidden = false;
    services.recent.isOpen.mockReturnValue(true);
    expect(pressKey("Escape").defaultPrevented).toBe(true);
    expect(services.find.close).toHaveBeenCalledOnce();
    expect(services.recent.close).not.toHaveBeenCalled();
    services.find.hidden = true;
    pressKey("Escape");
    expect(services.recent.close).toHaveBeenCalledOnce();
  });

  it("dismisses the file menu before the view menu and restores focus", () => {
    const { services } = shortcutFixture();
    services.fileMenu.isOpen = true;
    services.viewMenu.isOpen = true;
    pressKey("Escape");
    expect(services.fileMenu.hide).toHaveBeenCalledWith(true);
    expect(services.viewMenu.hide).not.toHaveBeenCalled();
    services.fileMenu.isOpen = false;
    pressKey("Escape");
    expect(services.viewMenu.hide).toHaveBeenCalledWith(true);
  });

  it("dismisses settings before contents and refreshes the contents state", () => {
    const { services } = shortcutFixture();
    services.panel.isOpen = true;
    services.outline.isOpen = true;
    pressKey("Escape");
    expect(services.panel.setOpen).toHaveBeenCalledWith(false);
    expect(services.outline.setOpen).not.toHaveBeenCalled();
    services.panel.isOpen = false;
    pressKey("Escape");
    expect(services.outline.setOpen).toHaveBeenCalledWith(false);
    expect(services.refreshChrome).toHaveBeenCalledOnce();
    services.outline.isOpen = false;
    pressKey("Escape");
    expect(services.refreshChrome).toHaveBeenCalledOnce();
  });
});
