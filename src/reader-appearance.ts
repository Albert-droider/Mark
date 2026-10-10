import { applySettings, resolvedMode } from "./themes";
import { rebuildRenderers } from "./renderer";
import { debounce } from "./util";
import { DEFAULT_SETTINGS, FONT_SIZE_MAX, FONT_SIZE_MIN, type Settings, type ReadingLayout } from "./types";
import type { Viewer } from "./viewer";
import type { ReaderNavigation } from "./reader-navigation";
import type { ReaderChrome } from "./reader-chrome";

export interface ReaderPreferences {
  read(): Settings; update(patch: Partial<Settings>): void;
  subscribe(listener: (settings: Settings) => void): () => void;
}
export interface ReaderAppearanceServices {
  viewer: Pick<Viewer, "file" | "rerender">;
  navigation: Pick<ReaderNavigation, "ratio" | "setLayout" | "restyle" | "paint" | "updateProgress" | "markReading" | "scrollToRatio">;
  chrome: Pick<ReaderChrome, "refreshAppearance" | "zoomRoot">;
  preferences: ReaderPreferences;
}
/** Owns settings changes and reading-scale feedback, without file transitions. */
export class ReaderAppearance {
  private renderedRender: string;
  private pendingRatio = 0;
  private pendingFile = "";
  private zoomTimer = 0;
  private lastZoom = 0;
  private rerender = debounce(() => {
    const file = this.services.viewer.file;
    const identity = file?.path || file?.name || "";
    const ratio = identity === this.pendingFile ? this.pendingRatio : this.services.navigation.ratio();
    rebuildRenderers(); this.services.viewer.rerender(); this.services.navigation.paint(ratio);
  }, 120);
  constructor(private services: ReaderAppearanceServices) {
    this.renderedRender = JSON.stringify(services.preferences.read().render);
  }
  mount(): void {
    this.services.preferences.subscribe(settings => this.onSettingsChange(settings));
    this.apply();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (this.services.preferences.read().mode === "system") { this.apply(); this.services.navigation.restyle(); }
    });
  }
  apply(): void {
    const settings = this.services.preferences.read();
    applySettings(settings); this.services.navigation.setLayout(settings.layout);
    this.services.chrome.refreshAppearance(settings.layout);
  }
  private onSettingsChange(settings: Settings): void {
    const navigation = this.services.navigation, viewer = this.services.viewer, ratio = navigation.ratio();
    const parseChanged = JSON.stringify(settings.render) !== this.renderedRender;
    this.apply();
    if (!viewer.file) return;
    if (parseChanged) {
      this.renderedRender = JSON.stringify(settings.render); this.pendingRatio = ratio;
      this.pendingFile = viewer.file.path || viewer.file.name; this.rerender(); return;
    }
    navigation.restyle(ratio);
    requestAnimationFrame(() => { navigation.scrollToRatio(ratio); navigation.updateProgress(); navigation.markReading(); });
  }
  chooseLayout(layout: ReadingLayout): void {
    if (this.services.preferences.read().layout !== layout) this.services.preferences.update({ layout });
  }
  toggleLayout(): void { this.chooseLayout(this.services.preferences.read().layout === "book" ? "scroll" : "book"); }
  toggleTheme(): void { this.services.preferences.update({ mode: this.isDark() ? "light" : "dark" }); }
  isDark(): boolean { return resolvedMode(this.services.preferences.read().mode) === "dark"; }
  onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault(); const now = performance.now();
    if (now - this.lastZoom < 40) return;
    this.lastZoom = now; this.zoom(event.deltaY < 0 ? 1 : -1);
  }
  zoom(step: number): void {
    const fontSize = this.services.preferences.read().fontSize;
    const next = step === 0 ? DEFAULT_SETTINGS.fontSize : fontSize + step;
    const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next));
    if (clamped !== fontSize) this.services.preferences.update({ fontSize: clamped });
    const toast = this.services.chrome.zoomRoot;
    toast.textContent = `${clamped} px`; toast.hidden = false; window.clearTimeout(this.zoomTimer);
    this.zoomTimer = window.setTimeout(() => { toast.hidden = true; }, 700);
  }
}
