// Audio preferences, deliberately outside Settings.
//
// updateSettings notifies listeners and App re-renders the document, so a speed or
// volume change routed through Settings would rebuild the page under the reader
// mid-sentence. Same reasoning as the reading position and the reader highlights.

export interface AudioPrefs {
  /** Playback rate. */
  speed: number;
  /** 0..1 */
  volume: number;
  /** Auto-scroll to the spoken word (karaoke). */
  follow: boolean;
  /** Seconds to jump back / forward. */
  back: number;
  forward: number;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  speed: 1,
  volume: 1,
  follow: true,
  back: 15,
  forward: 30,
};

const KEY = "mark.audio.v1";

/** Speeds offered in the player. 1.25-1.5 is the useful range for narrated study text. */
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

let current: AudioPrefs = load();

function load(): AudioPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_AUDIO_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    const merged = { ...DEFAULT_AUDIO_PREFS, ...parsed };
    // Guard against a hand-edited or corrupted blob: a bad rate makes the audio silent
    // and a bad volume makes it a no-op slider.
    merged.speed = SPEEDS.includes(merged.speed) ? merged.speed : DEFAULT_AUDIO_PREFS.speed;
    merged.volume = clamp01(merged.volume);
    merged.back = sane(merged.back, DEFAULT_AUDIO_PREFS.back);
    merged.forward = sane(merged.forward, DEFAULT_AUDIO_PREFS.forward);
    merged.follow = merged.follow === false ? false : true;
    return merged;
  } catch {
    return { ...DEFAULT_AUDIO_PREFS };
  }
}

function clamp01(v: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

function sane(v: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 600 ? Math.round(v) : fallback;
}

export function getAudioPrefs(): AudioPrefs {
  return current;
}

export function setAudioPrefs(patch: Partial<AudioPrefs>): AudioPrefs {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable; session-only is fine */
  }
  return current;
}
