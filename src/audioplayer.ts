// The document's audio, with a player that fits reading along.

import { audioObjectUrl, findAudio } from "./workspace";
import { SPEEDS, getAudioPrefs, setAudioPrefs } from "./audioprefs";
import { el, basename } from "./util";
import { isTauri } from "./platform";
export interface LoadedAudio {
  url: string;
  /** Shown next to the controls (the audio file's name). */
  label: string;
}

/** Resolve the audio for a document. Injectable so tests don't need Tauri. */
export type AudioLoader = (docPath: string) => Promise<LoadedAudio | null>;

/** Default loader: the sibling mp3/m4a/wav, read as an object URL. */
export const loadDocAudio: AudioLoader = async (docPath) => {
  if (!isTauri || !docPath) return null;
  try {
    const found = await findAudio(docPath);
    if (!found) return null;
    return { url: await audioObjectUrl(found), label: basename(found) };
  } catch {
    // Missing or unreadable audio is not an error worth interrupting reading for.
    return null;
  }
};

/** "3:07" / "1:02:11" / "--:--" when the length isn't known (yet). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

export class AudioBar {
  readonly root: HTMLElement;
  /** The player itself — the karaoke hangs word-level sync off this clock. */
  readonly audio: HTMLAudioElement;

  private label: HTMLElement;
  private playBtn: HTMLButtonElement;
  private seek: HTMLInputElement;
  private timeEl: HTMLElement;
  private speedSel: HTMLSelectElement;
  private volInput: HTMLInputElement;
  private followInput: HTMLInputElement;
  private currentUrl = "";
  /** True while the thumb is being dragged, so ticks don't fight the drag. */
  private scrubbing = false;

  constructor(private load: AudioLoader = loadDocAudio) {
    const prefs = getAudioPrefs();
    this.audio = el("audio", { class: "audio-el", preload: "metadata" }) as HTMLAudioElement;

    this.playBtn = el("button", { class: "audio-btn audio-play", type: "button", title: "Play / pause", "aria-label": "Play" }, ["\u25b6"]) as HTMLButtonElement;
    this.playBtn.addEventListener("click", () => this.toggle());

    const backBtn = el("button", { class: "audio-btn audio-back", type: "button", title: `${prefs.back} seconds back` }, [`\u2212${prefs.back}`]) as HTMLButtonElement;
    backBtn.addEventListener("click", () => this.skip(-prefs.back));
    const forwardBtn = el("button", { class: "audio-btn audio-forward", type: "button", title: `${prefs.forward} seconds forward` }, [`+${prefs.forward}`]) as HTMLButtonElement;
    forwardBtn.addEventListener("click", () => this.skip(prefs.forward));

    this.seek = el("input", { class: "audio-seek", type: "range", min: "0", max: "1000", step: "1", value: "0", "aria-label": "Position" }) as HTMLInputElement;
    this.seek.addEventListener("input", () => {
      this.scrubbing = true;
      if (Number.isFinite(this.audio.duration)) {
        this.audio.currentTime = (Number(this.seek.value) / 1000) * this.audio.duration;
      }
    });
    this.seek.addEventListener("change", () => {
      this.scrubbing = false;
      this.syncTime();
    });

    this.timeEl = el("span", { class: "audio-time" }, ["--:-- / --:--"]);

    this.speedSel = el("select", { class: "audio-speed", title: "Speed", "aria-label": "Playback speed" }, SPEEDS.map((s) => el("option", { value: String(s) }, [`${s}\u00d7`]))) as HTMLSelectElement;
    this.speedSel.value = String(prefs.speed);
    this.speedSel.addEventListener("change", () => {
      const speed = Number(this.speedSel.value);
      setAudioPrefs({ speed });
      this.audio.playbackRate = speed;
    });

    this.volInput = el("input", { class: "audio-vol", type: "range", min: "0", max: "1", step: "0.05", value: String(prefs.volume), title: "Volume", "aria-label": "Volume" }) as HTMLInputElement;
    this.volInput.addEventListener("input", () => {
      const volume = Number(this.volInput.value);
      setAudioPrefs({ volume });
      this.audio.volume = volume;
    });

    this.followInput = el("input", { class: "audio-follow-box", type: "checkbox" }) as HTMLInputElement;
    this.followInput.checked = prefs.follow;
    this.followInput.addEventListener("change", () => setAudioPrefs({ follow: this.followInput.checked }));

    this.label = el("span", { class: "audio-label" }, []);
    this.root = el("div", { class: "audio-bar" }, [
      this.label,
      this.playBtn,
      backBtn,
      forwardBtn,
      this.seek,
      this.timeEl,
      this.speedSel,
      this.volInput,
      el("label", { class: "audio-follow", title: "Scroll along with the spoken word" }, [
        this.followInput,
        el("span", {}, ["Follow"]),
      ]),
    ]);
    this.root.hidden = true;

    this.audio.addEventListener("play", () => this.setPlaying(true));
    this.audio.addEventListener("pause", () => this.setPlaying(false));
    this.audio.addEventListener("ended", () => this.setPlaying(false));
    this.audio.addEventListener("loadedmetadata", () => this.syncTime());
    this.audio.addEventListener("timeupdate", () => this.syncTime());
    this.audio.addEventListener("error", () => this.fail());
    this.applyPrefs();
  }

  /** Follow the open document: load its audio, or hide the bar when there is none. */
  async setDocument(docPath: string): Promise<void> {
    const loaded = await this.load(docPath);
    this.release();
    if (!loaded) {
      this.root.hidden = true;
      this.audio.removeAttribute("src");
      this.label.textContent = "";
      this.timeEl.textContent = "--:-- / --:--";
      return;
    }
    this.currentUrl = loaded.url;
    this.audio.src = loaded.url;
    this.label.textContent = loaded.label;
    this.label.title = loaded.label;
    this.root.hidden = false;
    this.applyPrefs();
    // Don't autoplay: the reader decides when the voice starts.
    this.audio.load();
    this.setPlaying(false);
    this.syncTime();
  }

  /** Applied on construction and whenever a new track loads. */
  private applyPrefs(): void {
    const prefs = getAudioPrefs();
    this.audio.volume = prefs.volume;
    this.audio.playbackRate = prefs.speed;
    this.volInput.value = String(prefs.volume);
    this.speedSel.value = String(prefs.speed);
    this.followInput.checked = prefs.follow;
  }

  private toggle(): void {
    if (this.audio.paused) void this.audio.play().catch(() => this.fail());
    else this.audio.pause();
  }

  private skip(seconds: number): void {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.min(this.audio.duration, Math.max(0, this.audio.currentTime + seconds));
    this.syncTime();
  }

  private setPlaying(playing: boolean): void {
    this.playBtn.textContent = playing ? "\u23f8" : "\u25b6";
    this.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    this.root.classList.toggle("playing", playing);
  }

  private syncTime(): void {
    const duration = this.audio.duration;
    if (Number.isFinite(duration) && duration > 0) {
      if (!this.scrubbing) this.seek.value = String(Math.round((this.audio.currentTime / duration) * 1000));
      this.timeEl.textContent = `${formatTime(this.audio.currentTime)} / ${formatTime(duration)}`;
    } else {
      this.timeEl.textContent = `${formatTime(this.audio.currentTime)} / --:--`;
    }
  }

  /** The bar has no room for an error state; the app's toast is where it belongs. */
  private fail(): void {
    document.dispatchEvent(new CustomEvent("mark:toast", { detail: "Audio could not be played" }));
  }

  private release(): void {
    if (!this.currentUrl) return;
    try {
      URL.revokeObjectURL(this.currentUrl);
    } catch {
      /* already gone */
    }
    this.currentUrl = "";
  }
}
