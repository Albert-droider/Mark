import { CODE_FONT, READING_FONT, type Settings, type ThemeMode } from "./types";

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  vars: Record<string, string>;
}

/**
 * One neutral light and one neutral dark. The pair follows the ReUI / shadcn
 * neutral tokens: near-black primary on white, near-white primary on black.
 * Older palette ids still resolve here so a saved GitHub or Dracula choice
 * cannot bring a second look back.
 */
export const THEMES: ThemePreset[] = [
  {
    id: "mark",
    name: "Mark",
    mode: "light",
    vars: {
      "--bg": "#f6f1e7", "--paper": "#f6f1e7", "--desk": "#e4dccf",
      "--fg": "#3f3830", "--ink": "#14110e", "--heading": "#14110e",
      "--link": "#1d4e89", "--muted": "#746c62", "--border": "#e3d9cb",
      "--code-bg": "#efe8da", "--code-block-bg": "#f3eee4", "--quote": "#5c5348",
      "--chrome-bg": "#f7f6f4", "--chrome-fg": "#14110e", "--chrome-border": "#e6e1d8",
      "--hover": "#efeae1", "--select": "rgba(20,17,14,0.12)",
      "--spine": "rgba(20,17,14,0.16)",
      "--primary": "#171717", "--primary-fg": "#fafafa", "--ring": "#a3a3a3",
      "--accent": "#171717", "--accent-fg": "#fafafa",
      "--syn-keyword": "#9a3412", "--syn-string": "#3f6212", "--syn-comment": "#a3a3a3",
      "--syn-number": "#1d4ed8", "--syn-fn": "#171717", "--syn-type": "#1e3a8a",
      "--syn-attr": "#1d4ed8", "--syn-tag": "#9a3412", "--syn-punct": "#525252",
    },
  },
  {
    id: "mark-dark",
    name: "Mark",
    mode: "dark",
    vars: {
      "--bg": "#1c1a17", "--paper": "#1c1a17", "--desk": "#0c0b0a",
      "--fg": "#b7b1a6", "--ink": "#f7f3ea", "--heading": "#f7f3ea",
      "--link": "#9ec1e8", "--muted": "#8a847a", "--border": "#2e2a26",
      "--code-bg": "#26231f", "--code-block-bg": "#221f1c", "--quote": "#a39c92",
      "--chrome-bg": "#121110", "--chrome-fg": "#f7f3ea", "--chrome-border": "#2a2724",
      "--hover": "#26231f", "--select": "rgba(247,243,234,0.16)",
      "--spine": "rgba(247,243,234,0.14)",
      "--primary": "#fafafa", "--primary-fg": "#171717", "--ring": "#525252",
      "--accent": "#fafafa", "--accent-fg": "#171717",
      "--syn-keyword": "#fdba74", "--syn-string": "#bbf7d0", "--syn-comment": "#737373",
      "--syn-number": "#93c5fd", "--syn-fn": "#fafafa", "--syn-type": "#bfdbfe",
      "--syn-attr": "#93c5fd", "--syn-tag": "#fdba74", "--syn-punct": "#a3a3a3",
    },
  },
];

const EXPLICIT_DARK = new Set([
  "mark-dark", "github-dark", "solarized-dark", "gruvbox-dark",
  "dracula", "nord", "one-dark", "mono-dark",
]);

/** True when a saved preset id is a dark variant (used once, on the v3 migration). */
export function explicitDarkTheme(themeId: string | undefined): boolean {
  return !!themeId && EXPLICIT_DARK.has(themeId);
}

/** Every stored palette folds onto the single house theme. */
export function themeFamily(_themeId: string): string {
  return "mark";
}

/** Light or dark variant. Mode wins over whatever palette id was stored. */
export function resolvePreset(_themeId: string, mode: ThemeMode): ThemePreset {
  return THEMES.find((t) => t.mode === mode) ?? THEMES[0];
}

export function getTheme(id: string): ThemePreset | undefined {
  return THEMES.find((t) => t.id === id);
}

export function resolvedMode(mode: Settings["mode"]): ThemeMode {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let appliedKeys: Set<string> = new Set();

/** Apply the locked theme and the reading measure to <html>. */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  const mode = resolvedMode(s.mode);
  const t = resolvePreset(s.themeId, mode);
  const vars: Record<string, string> = { ...t.vars };
  root.setAttribute("data-theme", t.id);
  const pageMode: ThemeMode = isDarkColor(vars["--bg"] || "") ? "dark" : "light";
  root.setAttribute("data-mode", pageMode);
  root.style.colorScheme = pageMode;

  vars["--font"] = READING_FONT;
  vars["--code-font"] = CODE_FONT;
  vars["--font-size"] = s.fontSize + "px";
  vars["--line-height"] = String(s.lineHeight);
  vars["--content-width"] = s.contentWidth + "px";
  vars["--padding"] = s.padding + "px";

  for (const k of appliedKeys) {
    if (!(k in vars)) root.style.removeProperty(k);
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  appliedKeys = new Set(Object.keys(vars));

  const bg = vars["--bg"] || "";
  if (bg) root.style.backgroundColor = bg;
}

function isDarkColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}
