import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderAppearance, type ReaderAppearanceServices } from "../reader-appearance";
import { DEFAULT_SETTINGS, type Settings, type LoadedFile } from "../types";
vi.mock("../renderer", () => ({ rebuildRenderers: vi.fn() }));

function setup() {
  vi.stubGlobal("matchMedia", (media: string): MediaQueryList => ({
    media, matches: false, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => true,
  }));
  let settings: Settings = { ...DEFAULT_SETTINGS, render: { ...DEFAULT_SETTINGS.render } };
  let listener: ((settings: Settings) => void) | undefined;
  let file: LoadedFile = { name: "first.md", path: "", source: "first", kind: "markdown" };
  const services: ReaderAppearanceServices = {
    viewer: { get file() { return file; }, rerender: vi.fn() },
    navigation: {
      ratio: vi.fn(() => 0.2), setLayout: vi.fn(), restyle: vi.fn(), paint: vi.fn(),
      updateProgress: vi.fn(), markReading: vi.fn(), scrollToRatio: vi.fn(),
    },
    chrome: { refreshAppearance: vi.fn(), zoomRoot: document.createElement("div") },
    preferences: {
      read: () => settings,
      update: vi.fn(patch => { settings = { ...settings, ...patch }; listener?.(settings); }),
      subscribe: next => { listener = next; return () => { listener = undefined; }; },
    },
  };
  const appearance = new ReaderAppearance(services); appearance.mount();
  return { appearance, services, switchFile: () => { file = { ...file, name: "second.md", source: "second" }; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("reader appearance boundaries", () => {
  it("does not apply an old file position when a debounced parser change reaches a newer file", () => {
    vi.useFakeTimers(); const { services, switchFile } = setup();
    services.preferences.update({ render: { ...DEFAULT_SETTINGS.render, math: !DEFAULT_SETTINGS.render.math } });
    switchFile(); vi.mocked(services.navigation.ratio).mockReturnValue(0.8); vi.advanceTimersByTime(120);
    expect(services.viewer.rerender).toHaveBeenCalledOnce(); expect(services.navigation.paint).toHaveBeenCalledWith(0.8);
  });
  it("preserves the original document ratio when only its parser settings change", () => {
    vi.useFakeTimers(); const { services } = setup();
    services.preferences.update({ render: { ...DEFAULT_SETTINGS.render, math: !DEFAULT_SETTINGS.render.math } });
    vi.mocked(services.navigation.ratio).mockReturnValue(0.8); vi.advanceTimersByTime(120);
    expect(services.navigation.paint).toHaveBeenCalledWith(0.2);
  });
  it("restyles appearance changes without reparsing and clamps reading scale", () => {
    vi.useFakeTimers(); const { appearance, services } = setup();
    appearance.toggleTheme(); expect(services.preferences.read().mode).toBe("dark");
    expect(services.navigation.restyle).toHaveBeenCalledWith(0.2); expect(services.viewer.rerender).not.toHaveBeenCalled();
    appearance.chooseLayout("book"); expect(services.navigation.setLayout).toHaveBeenLastCalledWith("book");
    appearance.zoom(100); expect(services.preferences.read().fontSize).toBe(26);
    appearance.zoom(-100); expect(services.preferences.read().fontSize).toBe(12);
    appearance.zoom(0); expect(services.preferences.read().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(services.chrome.zoomRoot.hidden).toBe(false); vi.advanceTimersByTime(700);
    expect(services.chrome.zoomRoot.hidden).toBe(true);
  });
});
