// The document that belongs to the open file, with a player.

import { audioObjectUrl, findAudio } from "./workspace";
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

export class AudioBar {
  readonly root: HTMLElement;
  /** The player itself — a timing module can hang word-level sync off this. */
  readonly audio: HTMLAudioElement;
  private label: HTMLElement;
  private currentUrl = "";

  constructor(private load: AudioLoader = loadDocAudio) {
    this.audio = el("audio", { class: "audio-el", controls: "", preload: "none" }) as HTMLAudioElement;
    this.label = el("span", { class: "audio-label" }, []);
    this.root = el("div", { class: "audio-bar" }, [this.label, this.audio]);
    this.root.hidden = true;
  }

  /** Follow the open document: load its audio, or hide the bar when there is none. */
  async setDocument(docPath: string): Promise<void> {
    const loaded = await this.load(docPath);
    this.release();
    if (!loaded) {
      this.root.hidden = true;
      this.audio.removeAttribute("src");
      this.label.textContent = "";
      return;
    }
    this.currentUrl = loaded.url;
    this.audio.src = loaded.url;
    this.label.textContent = loaded.label;
    this.label.title = loaded.label;
    this.root.hidden = false;
    // Don't autoplay: the reader decides when the voice starts.
    this.audio.load();
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
