import { fileMtime } from "./files";
import { isTauri } from "./platform";
import { getReadingPlace, setReadingPlace, type ReadingPlace } from "./store";
import { canonicalPath } from "./util";

/**
 * The open document's identity, reading place, and disk watch.
 * Kept off the settings listener so scrolling and file changes do not restyle the page.
 */
export class ReadingSession {
  key = "";
  private posTimer = 0;
  private watchTimer = 0;
  private seenMtime = 0;

  private placeOf: { ratio: () => number; scrollToRatio: (ratio: number) => void } | null = null;

  constructor(
    private workspace: HTMLElement,
    private hooks: {
      hasFile: () => boolean;
      onChanged: () => void | boolean | Promise<boolean>;
      onMissing: (path: string) => void;
    },
  ) {}

  /** The book reports place as a spread ratio instead of a vertical scroll. */
  follow(placeOf: { ratio: () => number; scrollToRatio: (ratio: number) => void } | null): void {
    this.placeOf = placeOf;
  }

  ratio(): number {
    if (this.placeOf) return this.placeOf.ratio();
    const max = this.workspace.scrollHeight - this.workspace.clientHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, this.workspace.scrollTop / max));
  }

  place(): ReadingPlace {
    return this.key ? getReadingPlace(this.key) : { ratio: null, legacyTop: null };
  }

  queue(): void {
    window.clearTimeout(this.posTimer);
    this.posTimer = window.setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    window.clearTimeout(this.posTimer);
    this.posTimer = 0;
    if (!this.key || !this.hooks.hasFile()) return;
    setReadingPlace(this.key, this.ratio());
  }

  scrollToRatio(ratio: number): void {
    if (this.placeOf) {
      this.placeOf.scrollToRatio(ratio);
      return;
    }
    const max = this.workspace.scrollHeight - this.workspace.clientHeight;
    this.workspace.scrollTop = Math.min(1, Math.max(0, ratio)) * Math.max(0, max);
  }

  restore(place: ReadingPlace): void {
    if (place.ratio != null) this.scrollToRatio(place.ratio);
    else if (place.legacyTop != null) this.workspace.scrollTop = place.legacyTop;
  }

  watch(path: string): void {
    this.stop();
    if (!path || !isTauri) return;
    const tick = () => { void this.poll(path); };
    tick();
    this.watchTimer = window.setInterval(tick, 1500);
  }

  stop(): void {
    window.clearInterval(this.watchTimer);
    this.watchTimer = 0;
    this.seenMtime = 0;
  }

  private async poll(path: string): Promise<void> {
    const key = canonicalPath(path);
    if (this.key !== key) return;
    try {
      const m = await fileMtime(path);
      if (this.key !== key) return;
      if (this.seenMtime !== 0 && m !== this.seenMtime) {
        const accepted = await this.hooks.onChanged();
        if (this.key === key && accepted !== false) this.seenMtime = m;
        return;
      }
      this.seenMtime = m;
    } catch {
      if (this.key !== key) return;
      this.stop();
      this.hooks.onMissing(path);
    }
  }
}
