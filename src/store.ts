import { DEFAULT_SETTINGS } from "./types";
import type { Settings } from "./types";

const KEY = "mark.settings.v1";

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();
let current: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return merge(DEFAULT_SETTINGS, parsed);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function merge(base: Settings, patch: Partial<Settings>): Settings {
  const out = { ...base, ...patch } as Settings;
  out.custom = { ...base.custom, ...(patch.custom || {}) };
  out.render = { ...base.render, ...(patch.render || {}) };
  out.recent = Array.isArray(patch.recent) ? patch.recent.slice(0, 25) : base.recent.slice();
  return out;
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage might be unavailable; ignore */
  }
}

export function getSettings(): Settings {
  return current;
}

export function setSettings(s: Settings): void {
  current = s;
  persist(s);
  for (const l of listeners) l(s);
}

export function updateSettings(patch: Partial<Settings>): void {
  setSettings(merge(current, patch));
}

export function onSettings(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Push a path to the front of the recent list (deduplicated, capped). */
export function pushRecent(path: string): void {
  const recent = [path, ...current.recent.filter((p) => p !== path)].slice(0, 25);
  updateSettings({ recent });
}

const POS_KEY = "mark.positions.v1";

/**
 * Reading position per file, deliberately kept OUT of Settings: updateSettings
 * notifies listeners, and App's listener re-renders the document — so saving a
 * scroll offset through Settings would rebuild the whole document mid-read.
 */
export function getPosition(key: string): number {
  if (!key) return 0;
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, number>;
    return typeof all[key] === "number" ? all[key] : 0;
  } catch {
    return 0;
  }
}

export function setPosition(key: string, top: number): void {
  if (!key) return;
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, number>;
    all[key] = Math.max(0, Math.round(top));
    // Drop files that fell out of `recent` so this map cannot grow forever.
    const keep = new Set(current.recent);
    for (const k of Object.keys(all)) if (!keep.has(k) && k !== key) delete all[k];
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable; ignore */
  }
}
