import { isRecord, readStored, reportStorageIssue, writeStored } from "./reader-storage";

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

function validPrefs(value: unknown): value is Partial<AudioPrefs> {
  if (!isRecord(value) || Object.hasOwn(value, "version")) return false;
  for (const key of ["speed", "volume", "back", "forward"]) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) return false;
  }
  return value.follow === undefined || typeof value.follow === "boolean";
}
let current: AudioPrefs = load();

function load(): AudioPrefs {
  try {
    const parsed = readStored(KEY, validPrefs, () => ({}));
    const merged = { ...DEFAULT_AUDIO_PREFS, ...parsed };
    // Guard against a hand-edited or corrupted blob: a bad rate makes the audio silent
    // and a bad volume makes it a no-op slider.
    merged.speed = SPEEDS.includes(merged.speed) ? merged.speed : DEFAULT_AUDIO_PREFS.speed;
    merged.volume = clamp01(merged.volume);
    merged.back = sane(merged.back, DEFAULT_AUDIO_PREFS.back);
    merged.forward = sane(merged.forward, DEFAULT_AUDIO_PREFS.forward);
    merged.follow = merged.follow === false ? false : true;
    return merged;
  } catch (error) {
    reportStorageIssue(error);
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
    readStored(KEY, validPrefs, () => ({}));
    writeStored(KEY, current);
  } catch (error) {
    reportStorageIssue(error);
  }
  return current;
}
