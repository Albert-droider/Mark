import { DEFAULT_SETTINGS } from "./types";
import type { RenderOptions, Settings } from "./types";
import { explicitDarkTheme, themeFamily } from "./themes";
import { canonicalPath } from "./util";

const KEY = "mark.settings.v1";
const RECENT_KEY = "mark.recent.v1";
const POS_KEY = "mark.positions.v1";

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();
let current: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return normalizeStored(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Fold old saves into the current settings shape. Safe to call more than once. */
export function normalizeStored(parsed: Partial<Settings>): Settings {
  const merged = merge(DEFAULT_SETTINGS, parsed);
  // v2 introduced the house theme + serif body font. A stored v1 blob would keep
  // the old github-light/system-ui defaults, so the new look would never reach
  // anyone who had already opened the app. Applies once.
  if ((parsed.version ?? 1) < 2) {
    merged.themeId = DEFAULT_SETTINGS.themeId;
    merged.fontFamily = DEFAULT_SETTINGS.fontFamily;
  }
  // v3: a stored dark preset used to ignore Light/Dark/Auto. Keep that
  // explicit dark choice once, then let the mode control own it.
  if ((parsed.version ?? 1) < 3) {
    if (explicitDarkTheme(parsed.themeId)) merged.mode = "dark";
    merged.version = DEFAULT_SETTINGS.version;
  }
  merged.themeId = themeFamily(merged.themeId);
  if (merged.layout !== "book" && merged.layout !== "scroll") merged.layout = "scroll";
  merged.fontFamily = DEFAULT_SETTINGS.fontFamily;
  merged.codeFontFamily = DEFAULT_SETTINGS.codeFontFamily;
  merged.accent = DEFAULT_SETTINGS.accent;
  return merged;
}

function merge(base: Settings, patch: Partial<Settings>): Settings {
  const raw = patch as Partial<Settings> & { recent?: unknown };
  const { custom, render, ...rest } = raw;
  delete (rest as { recent?: unknown }).recent;
  return {
    ...base,
    ...rest,
    custom: { ...base.custom, ...(custom ?? {}) },
    render: pickRender(base.render, render),
  };
}

function pickRender(base: RenderOptions, patch: Partial<RenderOptions> | undefined): RenderOptions {
  return {
    linkify: patch?.linkify ?? base.linkify,
    typographer: patch?.typographer ?? base.typographer,
    emoji: patch?.emoji ?? base.emoji,
    math: patch?.math ?? base.math,
    taskLists: patch?.taskLists ?? base.taskLists,
  };
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

/** Appearance defaults. Recent files live in their own store and stay put. */
export function resetSettings(): void {
  setSettings(structuredClone(DEFAULT_SETTINGS));
}

export function onSettings(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function parsePathList(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((p): p is string => typeof p === "string").slice(0, 25);
}

/**
 * Recent files are not part of Settings. A settings change re-renders when the
 * parse options change; opening a file must not take that path.
 */
function readRecent(): string[] {
  try {
    const own = localStorage.getItem(RECENT_KEY);
    if (own != null) return parsePathList(own);
  } catch {
    return [];
  }
  let migrated: string[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { recent?: unknown };
      if (Array.isArray(parsed.recent)) {
        migrated = parsed.recent.filter((p): p is string => typeof p === "string").slice(0, 25);
      }
    }
  } catch {
    migrated = [];
  }
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(migrated));
  } catch {
    /* storage might be unavailable; ignore */
  }
  return migrated;
}

function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 25)));
  } catch {
    /* storage might be unavailable; ignore */
  }
}

export function getRecent(): string[] {
  return readRecent();
}

/** Push a path to the front of the recent list (deduplicated, capped). */
export function pushRecent(path: string): void {
  if (!path) return;
  const key = canonicalPath(path);
  writeRecent([path, ...readRecent().filter((p) => canonicalPath(p) !== key)]);
}

export function removeRecent(path: string): void {
  if (!path) return;
  const key = canonicalPath(path);
  writeRecent(readRecent().filter((p) => canonicalPath(p) !== key));
}

export function clearRecent(): void {
  writeRecent([]);
}

/** A ratio survives font-size and window changes. Old builds stored pixels. */
export interface ReadingPlace {
  ratio: number | null;
  legacyTop: number | null;
}

type StoredPlace = number | { r: number };

function readPlaces(): Record<string, StoredPlace> {
  return JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, StoredPlace>;
}

/**
 * Reading place per file, deliberately kept OUT of Settings: updateSettings
 * notifies listeners, and a parse-affecting change re-renders the document —
 * so saving a scroll offset through Settings would rebuild the whole document mid-read.
 */
export function getReadingPlace(key: string): ReadingPlace {
  const empty = { ratio: null, legacyTop: null };
  if (!key) return empty;
  try {
    const v = readPlaces()[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return { ratio: null, legacyTop: Math.max(0, Math.round(v)) };
    }
    if (v && typeof v === "object" && typeof v.r === "number" && Number.isFinite(v.r)) {
      return { ratio: clamp01(v.r), legacyTop: null };
    }
    return empty;
  } catch {
    return empty;
  }
}

export function setReadingPlace(key: string, ratio: number): void {
  if (!key) return;
  try {
    const all = readPlaces();
    all[key] = { r: clamp01(ratio) };
    prunePlaces(all, key);
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable; ignore */
  }
}

export function forgetPlace(key: string): void {
  if (!key) return;
  try {
    const all = readPlaces();
    delete all[key];
    delete all[canonicalPath(key)];
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable; ignore */
  }
}

/** Drop places for files no longer in `keep`. Keys are canonical path strings. */
export function forgetOtherPlaces(keep: string[]): void {
  try {
    const all = readPlaces();
    const keepSet = new Set(keep.map((k) => canonicalPath(k)));
    for (const k of Object.keys(all)) if (!keepSet.has(canonicalPath(k))) delete all[k];
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable; ignore */
  }
}

function prunePlaces(all: Record<string, StoredPlace>, key: string): void {
  const keep = new Set(readRecent().map((p) => canonicalPath(p)));
  const canon = canonicalPath(key);
  for (const k of Object.keys(all)) {
    if (!keep.has(canonicalPath(k)) && canonicalPath(k) !== canon) delete all[k];
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
