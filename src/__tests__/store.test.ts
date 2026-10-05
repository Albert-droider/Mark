import { describe, it, expect, beforeEach } from "vitest";
import { getPosition, setPosition, getSettings, setSettings } from "../store";
import { DEFAULT_SETTINGS } from "../types";

beforeEach(() => {
  localStorage.clear();
  setSettings(structuredClone(DEFAULT_SETTINGS));
});

describe("reading position", () => {
  it("round-trips an offset per file", () => {
    setSettings({ ...getSettings(), recent: ["C:/a.md", "C:/b.md"] });
    setPosition("C:/a.md", 1234);
    setPosition("C:/b.md", 4);
    expect(getPosition("C:/a.md")).toBe(1234);
    expect(getPosition("C:/b.md")).toBe(4);
  });

  it("returns 0 for an unknown or empty key", () => {
    expect(getPosition("never-opened.md")).toBe(0);
    expect(getPosition("")).toBe(0);
  });

  it("clamps negatives to 0 and rounds fractions", () => {
    setSettings({ ...getSettings(), recent: ["x.md"] });
    setPosition("x.md", -50);
    expect(getPosition("x.md")).toBe(0);
    setPosition("x.md", 10.6);
    expect(getPosition("x.md")).toBe(11);
  });

  it("forgets files that fell out of the recent list", () => {
    setSettings({ ...getSettings(), recent: ["a.md", "b.md"] });
    setPosition("a.md", 100);
    setPosition("b.md", 200);
    expect(getPosition("a.md")).toBe(100);

    // b.md drops out of recent -> the next write prunes it
    setSettings({ ...getSettings(), recent: ["a.md"] });
    setPosition("a.md", 150);
    expect(getPosition("b.md")).toBe(0);
    expect(getPosition("a.md")).toBe(150);
  });

  it("survives corrupt stored data", () => {
    localStorage.setItem("mark.positions.v1", "{not json");
    expect(getPosition("a.md")).toBe(0);
    expect(() => setPosition("a.md", 5)).not.toThrow();
  });
});
