/** Shortcuts shared by the settings list and the key handler. */

export type CommandId =
  | "open"
  | "find"
  | "find-next"
  | "contents"
  | "reload"
  | "close"
  | "recent"
  | "theme"
  | "layout"
  | "settings"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "print";

interface CommandSpec {
  id: CommandId;
  label: string;
  /** "Mod" becomes Ctrl or ⌘. */
  keys: string;
  key: string;
  mod?: boolean;
  shift?: boolean;
  /** Shown in Settings. Defaults to true. */
  menu?: boolean;
  /** Matched from the window key handler. Defaults to true. */
  global?: boolean;
  /** Only when running in the desktop shell. */
  desktop?: boolean;
}

const COMMANDS: CommandSpec[] = [
  { id: "open", label: "Open", keys: "Mod O", key: "o", mod: true },
  { id: "find", label: "Find", keys: "Mod F", key: "f", mod: true },
  { id: "find-next", label: "Next match", keys: "Mod G", key: "g", mod: true, global: false },
  { id: "contents", label: "Contents", keys: "Mod Shift O", key: "o", mod: true, shift: true },
  { id: "reload", label: "Reload", keys: "Mod R", key: "r", mod: true },
  { id: "close", label: "Close file", keys: "Mod W", key: "w", mod: true },
  { id: "recent", label: "Recent", keys: "R", key: "r", desktop: true },
  { id: "theme", label: "Light / dark", keys: "Mod Shift T", key: "t", mod: true, shift: true },
  { id: "layout", label: "Document / book", keys: "Mod Shift B", key: "b", mod: true, shift: true },
  { id: "settings", label: "Settings", keys: "Mod ,", key: ",", mod: true },
  { id: "zoom-in", label: "Reading size", keys: "Mod +  −", key: "+", mod: true },
  { id: "zoom-out", label: "Reading size", keys: "Mod +  −", key: "-", mod: true, menu: false },
  { id: "zoom-reset", label: "Reset size", keys: "Mod 0", key: "0", mod: true },
  { id: "print", label: "Print", keys: "Mod P", key: "p", mod: true },
];

export function modifierName(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

export function formatKeys(pattern: string): string {
  return pattern.replaceAll("Mod", modifierName());
}

export function shortcutKeys(id: CommandId): string {
  const spec = COMMANDS.find((c) => c.id === id);
  return spec ? formatKeys(spec.keys) : "";
}

/** Rows for the settings panel, plus the keys that are not chords. */
export function shortcutRows(desktop: boolean): { label: string; keys: string }[] {
  const seen = new Set<string>();
  const rows: { label: string; keys: string }[] = [];
  for (const spec of COMMANDS) {
    if (spec.menu === false) continue;
    if (spec.desktop && !desktop) continue;
    if (seen.has(spec.label)) continue;
    seen.add(spec.label);
    rows.push({ label: spec.label, keys: formatKeys(spec.keys) });
  }
  rows.push(
    { label: "Turn pages (book)", keys: "\u2190 \u2192" },
    { label: "Scroll (document)", keys: "\u2191 \u2193" },
    { label: "Close a panel", keys: "Esc" },
  );
  return rows;
}

export function matchCommand(e: KeyboardEvent, ctx: { typing: boolean; desktop: boolean }): CommandId | null {
  const mod = e.ctrlKey || e.metaKey;
  if (ctx.typing && !mod) return null;
  for (const spec of COMMANDS) {
    if (spec.global === false) continue;
    if (spec.desktop && !ctx.desktop) continue;
    if (hits(e, spec)) return spec.id;
  }
  return null;
}

/** Ctrl/⌘ G and F3 move the find cursor. Shift selects the direction. */
export function isFindStep(e: KeyboardEvent): boolean {
  if (e.key === "F3") return true;
  const mod = e.ctrlKey || e.metaKey;
  return mod && e.key.toLowerCase() === "g";
}

function hits(e: KeyboardEvent, spec: CommandSpec): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!!spec.mod !== mod) return false;
  if (spec.id === "zoom-in") return e.key === "+" || e.key === "=" || e.code === "NumpadAdd";
  if (spec.id === "zoom-out") return e.key === "-" || e.code === "NumpadSubtract";
  if (spec.id === "zoom-reset") return e.key === "0" || e.code === "Numpad0";
  if (!!spec.shift !== e.shiftKey) return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return key === spec.key;
}
