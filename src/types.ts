// Shared types for the Mark reader.

export type ThemeMode = "light" | "dark";
export type ModePref = "system" | "light" | "dark";
export type LinkTarget = "self" | "blank";
export type FileKind = "markdown" | "text";

export interface LoadedFile {
  /** Absolute path in Tauri mode; empty string in browser mode. */
  path: string;
  name: string;
  source: string;
  kind: FileKind;
}

/** Colors a user can override when the "custom" theme is selected. */
export interface CustomColors {
  bg: string;
  fg: string;
  heading: string;
  link: string;
  muted: string;
  border: string;
  codeBg: string;
  quote: string;
}

export interface RenderOptions {
  linkify: boolean;
  typographer: boolean;
  emoji: boolean;
  math: boolean;
  taskLists: boolean;
  linkTarget: LinkTarget;
}

export interface Settings {
  version: number;
  /** Preset id, or "custom". */
  themeId: string;
  mode: ModePref;
  fontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  padding: number;
  accent: string;
  custom: CustomColors;
  render: RenderOptions;
  /** Recent file paths (Tauri) or names (browser). */
  recent: string[];
}

/** Font-size bounds in px — shared by the settings slider and the Ctrl +/- shortcuts. */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 26;

export const FONT_PRESETS: { id: string; name: string; stack: string }[] = [
  { id: "system", name: "System UI", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: "sans", name: "Sans (Inter-like)", stack: '"Segoe UI", system-ui, Arial, sans-serif' },
  { id: "serif", name: "Serif (Georgia)", stack: 'Georgia, "Times New Roman", serif' },
  { id: "mono", name: "Mono (code)", stack: '"Cascadia Code", "JetBrains Mono", Consolas, monospace' },
];

export const CODE_FONT_PRESETS: { id: string; name: string; stack: string }[] = [
  { id: "cascadia", name: "Cascadia Code", stack: '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", Consolas, monospace' },
  { id: "jetbrains", name: "JetBrains Mono", stack: '"JetBrains Mono", "Fira Code", Consolas, monospace' },
  { id: "fira", name: "Fira Code", stack: '"Fira Code", "JetBrains Mono", Consolas, monospace' },
  { id: "consolas", name: "Consolas", stack: 'Consolas, "Liberation Mono", monospace' },
  { id: "mono", name: "System mono", stack: 'ui-monospace, "Cascadia Code", "Source Code Pro", monospace' },
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  themeId: "github-light",
  mode: "system",
  fontFamily: FONT_PRESETS[0].stack,
  codeFontFamily: CODE_FONT_PRESETS[0].stack,
  fontSize: 16,
  lineHeight: 1.7,
  contentWidth: 880,
  padding: 24,
  accent: "#0969da",
  custom: {
    bg: "#ffffff",
    fg: "#1f2328",
    heading: "#1f2328",
    link: "#0969da",
    muted: "#656d76",
    border: "#d0d7de",
    codeBg: "#f6f8fa",
    quote: "#57606a",
  },
  render: {
    linkify: true,
    typographer: true,
    emoji: true,
    math: true,
    taskLists: true,
    linkTarget: "blank",
  },
  recent: [],
};
