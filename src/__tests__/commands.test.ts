import { describe, it, expect } from "vitest";
import { matchCommand } from "../commands";

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

const desk = { typing: false, desktop: true };

describe("shortcuts", () => {
  it("tells contents and open apart by shift", () => {
    expect(matchCommand(key({ key: "o", ctrlKey: true, shiftKey: true }), desk)).toBe("contents");
    expect(matchCommand(key({ key: "o", ctrlKey: true }), desk)).toBe("open");
  });

  it("treats ctrl+shift+= as a larger reading size", () => {
    expect(matchCommand(key({ key: "=", ctrlKey: true, shiftKey: true }), desk)).toBe("zoom-in");
    expect(matchCommand(key({ key: "-", ctrlKey: true }), desk)).toBe("zoom-out");
    expect(matchCommand(key({ key: "0", ctrlKey: true }), desk)).toBe("zoom-reset");
  });

  it("keeps recent files on the desktop, and out of a text field", () => {
    expect(matchCommand(key({ key: "r" }), desk)).toBe("recent");
    expect(matchCommand(key({ key: "r" }), { typing: false, desktop: false })).toBeNull();
    expect(matchCommand(key({ key: "r" }), { typing: true, desktop: true })).toBeNull();
    expect(matchCommand(key({ key: "r", ctrlKey: true }), { typing: true, desktop: true })).toBe("reload");
  });
});
