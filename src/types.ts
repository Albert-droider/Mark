// Shared types for the Mark reader.

export type ThemeMode = "light" | "dark";
export type ModePref = "system" | "light" | "dark";
/** Document scrolls. Book turns a two-page spread. */
export type ReadingLayout = "scroll" | "book";
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
}

export interface Settings {
  version: number;
  /** Always the house theme. Older palette ids are folded on load. */
  themeId: string;
  mode: ModePref;
  /** Scroll the file, or turn it like a book. */
  layout: ReadingLayout;
  fontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  padding: number;
  accent: string;
  custom: CustomColors;
  render: RenderOptions;
}

/** Font-size bounds in px — shared by the settings slider and the Ctrl +/- shortcuts. */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 26;

/** Chrome face. Segoe UI is the system sans that matches the ReUI default on Windows. */
export const UI_FONT = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
/** Reading face. Sitka is the Windows book cut and has a real bold, unlike a faux weight. */
export const READING_FONT = '"Sitka Text", "Palatino Linotype", Georgia, serif';
/** Code, kbd, and the zoom toast. */
export const CODE_FONT = '"Cascadia Mono", "Cascadia Code", ui-monospace, Consolas, monospace';

export const DEFAULT_SETTINGS: Settings = {
  version: 3,
  themeId: "mark",
  mode: "system",
  layout: "scroll",
  fontFamily: READING_FONT,
  codeFontFamily: CODE_FONT,
  fontSize: 16,
  lineHeight: 1.7,
  contentWidth: 880,
  padding: 24,
  accent: "#171717",
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
  },
};
