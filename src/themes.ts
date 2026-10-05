import type { Settings, ThemeMode, CustomColors } from "./types";

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  vars: Record<string, string>;
}

/**
 * Each preset defines page variables and syntax-highlight variables.
 * Syntax vars are consumed by `.hljs` token rules in markdown.css.
 */
export const THEMES: ThemePreset[] = [
  {
    id: "github-light",
    name: "GitHub Light",
    mode: "light",
    vars: {
      "--bg": "#ffffff", "--fg": "#1f2328", "--heading": "#1f2328",
      "--link": "#0969da", "--muted": "#656d76", "--border": "#d0d7de",
      "--code-bg": "rgba(175,184,193,0.2)", "--code-block-bg": "#f6f8fa",
      "--quote": "#57606a", "--chrome-bg": "#f6f8fa", "--chrome-fg": "#1f2328",
      "--chrome-border": "#d0d7de", "--select": "rgba(9,105,218,0.15)",
      "--syn-keyword": "#cf222e", "--syn-string": "#0a3069", "--syn-comment": "#6e7781",
      "--syn-number": "#0550ae", "--syn-fn": "#8250df", "--syn-type": "#953800",
      "--syn-attr": "#0550ae", "--syn-tag": "#116329", "--syn-punct": "#6e7781",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    mode: "dark",
    vars: {
      "--bg": "#0d1117", "--fg": "#e6edf3", "--heading": "#e6edf3",
      "--link": "#4493f8", "--muted": "#7d8590", "--border": "#30363d",
      "--code-bg": "rgba(110,118,129,0.4)", "--code-block-bg": "#161b22",
      "--quote": "#8b949e", "--chrome-bg": "#161b22", "--chrome-fg": "#e6edf3",
      "--chrome-border": "#30363d", "--select": "rgba(68,147,248,0.2)",
      "--syn-keyword": "#ff7b72", "--syn-string": "#a5d6ff", "--syn-comment": "#8b949e",
      "--syn-number": "#79c0ff", "--syn-fn": "#d2a8ff", "--syn-type": "#ffa657",
      "--syn-attr": "#79c0ff", "--syn-tag": "#7ee787", "--syn-punct": "#8b949e",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    mode: "dark",
    vars: {
      "--bg": "#282a36", "--fg": "#f8f8f2", "--heading": "#f8f8f2",
      "--link": "#ff79c6", "--muted": "#6272a4", "--border": "#44475a",
      "--code-bg": "#44475a", "--code-block-bg": "#21222c", "--quote": "#6272a4",
      "--chrome-bg": "#21222c", "--chrome-fg": "#f8f8f2", "--chrome-border": "#44475a",
      "--select": "rgba(255,121,198,0.2)",
      "--syn-keyword": "#ff79c6", "--syn-string": "#f1fa8c", "--syn-comment": "#6272a4",
      "--syn-number": "#bd93f9", "--syn-fn": "#50fa7b", "--syn-type": "#8be9fd",
      "--syn-attr": "#50fa7b", "--syn-tag": "#ff79c6", "--syn-punct": "#f8f8f2",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    mode: "light",
    vars: {
      "--bg": "#fdf6e3", "--fg": "#586e75", "--heading": "#073642",
      "--link": "#268bd2", "--muted": "#93a1a1", "--border": "#eee8d5",
      "--code-bg": "#eee8d5", "--code-block-bg": "#eee8d5", "--quote": "#93a1a1",
      "--chrome-bg": "#eee8d5", "--chrome-fg": "#586e75", "--chrome-border": "#d8d0b8",
      "--select": "rgba(38,139,210,0.15)",
      "--syn-keyword": "#859900", "--syn-string": "#2aa198", "--syn-comment": "#93a1a1",
      "--syn-number": "#d33682", "--syn-fn": "#268bd2", "--syn-type": "#b58900",
      "--syn-attr": "#268bd2", "--syn-tag": "#859900", "--syn-punct": "#586e75",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    mode: "dark",
    vars: {
      "--bg": "#002b36", "--fg": "#93a1a1", "--heading": "#eee8d5",
      "--link": "#268bd2", "--muted": "#586e75", "--border": "#073642",
      "--code-bg": "#073642", "--code-block-bg": "#073642", "--quote": "#586e75",
      "--chrome-bg": "#073642", "--chrome-fg": "#93a1a1", "--chrome-border": "#0a4252",
      "--select": "rgba(42,161,152,0.2)",
      "--syn-keyword": "#859900", "--syn-string": "#2aa198", "--syn-comment": "#586e75",
      "--syn-number": "#d33682", "--syn-fn": "#268bd2", "--syn-type": "#b58900",
      "--syn-attr": "#268bd2", "--syn-tag": "#859900", "--syn-punct": "#93a1a1",
    },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    mode: "light",
    vars: {
      "--bg": "#fbf1c7", "--fg": "#3c3836", "--heading": "#282827",
      "--link": "#076678", "--muted": "#928374", "--border": "#d5c4a1",
      "--code-bg": "#ebdbb2", "--code-block-bg": "#ebdbb2", "--quote": "#928374",
      "--chrome-bg": "#ebdbb2", "--chrome-fg": "#3c3836", "--chrome-border": "#d5c4a1",
      "--select": "rgba(7,102,120,0.15)",
      "--syn-keyword": "#9d0006", "--syn-string": "#79740e", "--syn-comment": "#928374",
      "--syn-number": "#8f3f71", "--syn-fn": "#427b58", "--syn-type": "#b57614",
      "--syn-attr": "#427b58", "--syn-tag": "#9d0006", "--syn-punct": "#7c6f64",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    mode: "dark",
    vars: {
      "--bg": "#282828", "--fg": "#ebdbb2", "--heading": "#ebdbb2",
      "--link": "#fabd2f", "--muted": "#928374", "--border": "#3c3836",
      "--code-bg": "#3c3836", "--code-block-bg": "#1d2021", "--quote": "#928374",
      "--chrome-bg": "#1d2021", "--chrome-fg": "#ebdbb2", "--chrome-border": "#3c3836",
      "--select": "rgba(250,189,47,0.18)",
      "--syn-keyword": "#fb4934", "--syn-string": "#b8bb26", "--syn-comment": "#928374",
      "--syn-number": "#d3869b", "--syn-fn": "#8ec07c", "--syn-type": "#fabd2f",
      "--syn-attr": "#8ec07c", "--syn-tag": "#fb4934", "--syn-punct": "#928374",
    },
  },
  {
    id: "nord",
    name: "Nord",
    mode: "dark",
    vars: {
      "--bg": "#2e3440", "--fg": "#d8dee9", "--heading": "#e5e9f0",
      "--link": "#88c0d0", "--muted": "#616e88", "--border": "#3b4252",
      "--code-bg": "#3b4252", "--code-block-bg": "#2e3440", "--quote": "#616e88",
      "--chrome-bg": "#292e39", "--chrome-fg": "#d8dee9", "--chrome-border": "#3b4252",
      "--select": "rgba(136,192,208,0.18)",
      "--syn-keyword": "#81a1c1", "--syn-string": "#a3be8c", "--syn-comment": "#616e88",
      "--syn-number": "#b48ead", "--syn-fn": "#88c0d0", "--syn-type": "#8fbcbb",
      "--syn-attr": "#88c0d0", "--syn-tag": "#81a1c1", "--syn-punct": "#d8dee9",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    mode: "dark",
    vars: {
      "--bg": "#282c34", "--fg": "#abb2bf", "--heading": "#e5c07b",
      "--link": "#61afef", "--muted": "#5c6370", "--border": "#3e4451",
      "--code-bg": "#2c313c", "--code-block-bg": "#21252b", "--quote": "#5c6370",
      "--chrome-bg": "#21252b", "--chrome-fg": "#abb2bf", "--chrome-border": "#3e4451",
      "--select": "rgba(97,175,239,0.18)",
      "--syn-keyword": "#c678dd", "--syn-string": "#98c379", "--syn-comment": "#5c6370",
      "--syn-number": "#d19a66", "--syn-fn": "#61afef", "--syn-type": "#e5c07b",
      "--syn-attr": "#d19a66", "--syn-tag": "#e06c75", "--syn-punct": "#abb2bf",
    },
  },
  {
    id: "mono-light",
    name: "Mono Paper",
    mode: "light",
    vars: {
      "--bg": "#f4f4f4", "--fg": "#111111", "--heading": "#000000",
      "--link": "#0033cc", "--muted": "#666666", "--border": "#cccccc",
      "--code-bg": "#eaeaea", "--code-block-bg": "#1d1f21", "--quote": "#666666",
      "--chrome-bg": "#eaeaea", "--chrome-fg": "#111111", "--chrome-border": "#cccccc",
      "--select": "rgba(0,51,204,0.12)",
      "--syn-keyword": "#c00000", "--syn-string": "#006600", "--syn-comment": "#888888",
      "--syn-number": "#0000cc", "--syn-fn": "#660099", "--syn-type": "#996600",
      "--syn-attr": "#0000cc", "--syn-tag": "#006600", "--syn-punct": "#666666",
    },
  },
];

export function getTheme(id: string): ThemePreset | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Build a variable map for the user-defined "custom" theme. */
export function customVars(c: CustomColors): Record<string, string> {
  return {
    "--bg": c.bg, "--fg": c.fg, "--heading": c.heading, "--link": c.link,
    "--muted": c.muted, "--border": c.border, "--code-bg": c.codeBg,
    "--code-block-bg": c.codeBg, "--quote": c.quote,
    "--chrome-bg": c.codeBg, "--chrome-fg": c.fg, "--chrome-border": c.border,
    "--select": hexA(c.link, 0.15),
    // Syntax colors derived from the user palette.
    "--syn-keyword": c.link, "--syn-string": c.heading, "--syn-comment": c.muted,
    "--syn-number": c.link, "--syn-fn": c.link, "--syn-type": c.heading,
    "--syn-attr": c.link, "--syn-tag": c.heading, "--syn-punct": c.muted,
  };
}

export function resolvedMode(mode: Settings["mode"]): ThemeMode {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let appliedKeys: Set<string> = new Set();

/** Apply settings (theme, fonts, sizes) to <html> as CSS variables + data attrs. */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  const mode = resolvedMode(s.mode);
  root.setAttribute("data-mode", mode);

  let vars: Record<string, string>;
  if (s.themeId === "custom") {
    vars = customVars(s.custom);
    root.setAttribute("data-theme", "custom");
  } else {
    const t = getTheme(s.themeId) ?? THEMES[0];
    vars = { ...t.vars };
    root.setAttribute("data-theme", t.id);
  }

  // Per-setting overrides (independent of preset).
  vars["--font"] = s.fontFamily;
  vars["--code-font"] = s.codeFontFamily;
  vars["--font-size"] = s.fontSize + "px";
  vars["--line-height"] = String(s.lineHeight);
  vars["--content-width"] = s.contentWidth + "px";
  vars["--padding"] = s.padding + "px";
  vars["--accent"] = s.accent;

  // Remove keys we previously set but are no longer present.
  for (const k of appliedKeys) {
    if (!(k in vars)) root.style.removeProperty(k);
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  appliedKeys = new Set(Object.keys(vars));

  const bg = vars["--bg"] || "";
  if (bg) root.style.backgroundColor = bg;
}

/** Convert #rrggbb + alpha to rgba() string. Falls back to the hex if not parseable. */
function hexA(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
