import { describe, it, expect, beforeEach } from "vitest";
import {
  getReadingPlace, setReadingPlace, getSettings, setSettings, resetSettings,
  getRecent, pushRecent, removeRecent, normalizeStored,
} from "../store";
import { DEFAULT_SETTINGS } from "../types";

beforeEach(() => {
  localStorage.clear();
  setSettings(structuredClone(DEFAULT_SETTINGS));
});

describe("reading position", () => {
  it("round-trips a ratio per file", () => {
    pushRecent("C:/a.md");
    pushRecent("C:/b.md");
    setReadingPlace("c:\\a.md", 0.25);
    setReadingPlace("c:\\b.md", 0.5);
    expect(getReadingPlace("c:\\a.md").ratio).toBeCloseTo(0.25);
    expect(getReadingPlace("c:\\b.md").ratio).toBeCloseTo(0.5);
  });

  it("keeps a place when the recent list uses a different windows spelling", () => {
    pushRecent("C:/Docs/A.md");
    setReadingPlace("c:\\docs\\a.md", 0.4);
    expect(getReadingPlace("c:\\docs\\a.md").ratio).toBeCloseTo(0.4);
  });

  it("returns an empty place for an unknown or empty key", () => {
    expect(getReadingPlace("never-opened.md")).toEqual({ ratio: null, legacyTop: null });
    expect(getReadingPlace("")).toEqual({ ratio: null, legacyTop: null });
  });

  it("clamps ratios to 0..1", () => {
    pushRecent("x.md");
    setReadingPlace("x.md", -0.2);
    expect(getReadingPlace("x.md").ratio).toBe(0);
    setReadingPlace("x.md", 4);
    expect(getReadingPlace("x.md").ratio).toBe(1);
  });

  it("reads a pixel offset left by an older build", () => {
    localStorage.setItem("mark.positions.v1", JSON.stringify({ "a.md": 1234 }));
    expect(getReadingPlace("a.md")).toEqual({ ratio: null, legacyTop: 1234 });
  });

  it("forgets files that fell out of the recent list", () => {
    pushRecent("b.md");
    pushRecent("a.md");
    setReadingPlace("a.md", 0.2);
    setReadingPlace("b.md", 0.4);
    expect(getReadingPlace("a.md").ratio).toBeCloseTo(0.2);

    removeRecent("b.md");
    setReadingPlace("a.md", 0.3);
    expect(getReadingPlace("b.md").ratio).toBeNull();
    expect(getReadingPlace("a.md").ratio).toBeCloseTo(0.3);
  });

  it("survives corrupt stored data", () => {
    localStorage.setItem("mark.positions.v1", "{not json");
    expect(getReadingPlace("a.md").ratio).toBeNull();
    expect(() => setReadingPlace("a.md", 0.5)).not.toThrow();
  });
});

describe("recent files", () => {
  it("migrates a list that still lives inside the settings blob", () => {
    localStorage.setItem("mark.settings.v1", JSON.stringify({ version: 2, recent: ["C:/old.md"] }));
    localStorage.removeItem("mark.recent.v1");
    expect(getRecent()).toEqual(["C:/old.md"]);
    expect(JSON.parse(localStorage.getItem("mark.recent.v1") || "[]")).toEqual(["C:/old.md"]);
  });
});

describe("stored settings", () => {
  it("folds a dark preset into its family and keeps that dark choice", () => {
    const s = normalizeStored({ version: 2, themeId: "github-dark", mode: "system" });
    expect(s.themeId).toBe("mark");
    expect(s.mode).toBe("dark");
    expect(s.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(s.version).toBe(3);
  });

  it("leaves an already chosen mode alone", () => {
    const s = normalizeStored({ version: 3, themeId: "github-dark", mode: "light" });
    expect(s.themeId).toBe("mark");
    expect(s.mode).toBe("light");
  });

  it("keeps book layout and defaults anything else to the scrolling document", () => {
    expect(normalizeStored({ version: 3, layout: "book" }).layout).toBe("book");
    expect(normalizeStored({ version: 3 }).layout).toBe("scroll");
    expect(normalizeStored(JSON.parse('{"version":3,"layout":"columns"}')).layout).toBe("scroll");
  });

  it("drops a retired link target from the parse options", () => {
    const s = normalizeStored(JSON.parse('{"version":3,"render":{"linkify":false,"linkTarget":"self"}}'));
    expect(s.render.linkify).toBe(false);
    expect("linkTarget" in s.render).toBe(false);
  });
});

describe("reset", () => {
  it("restores appearance and keeps recent files", () => {
    pushRecent("C:/kept.md");
    setSettings({ ...getSettings(), fontSize: 22 });
    resetSettings();
    expect(getSettings().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(getRecent()).toEqual(["C:/kept.md"]);
  });
});
