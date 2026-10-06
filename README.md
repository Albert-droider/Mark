# Mark

A small, fast, customizable **markdown reader** for the desktop — built with Tauri v2 + TypeScript. Parses GitHub-flavored markdown the way VS Code's preview does, out of the box.

## Features

- Full GFM: headings, tables, task lists, strikethrough, autolinks, fenced code
- Syntax highlighting (highlight.js, all languages) with per-block copy button
- Math via KaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`)
- Footnotes, abbreviations, definition lists, sub/sup, `==mark==`, emoji `:shortcodes:`
- Callout blocks: `:::tip / info / note / warning / danger / success`
- Collapsible `:::details` blocks
- Heading anchors, sanitized HTML (DOMPurify) for safety
- Drag-and-drop, recent files, external links open in your browser
- Reader highlights: select text, pick one of three colors, click a mark to remove it — stored per file
- Workspace sidebar (Ctrl+B): point Mark at a folder and every `.md`/`.txt` in it is one click away, grouped by subfolder
- Audio bar: if the open document has an mp3/m4a/wav next to it (or in an `audio/` folder beside it), a player shows up for reading along
- Karaoke: when the narration has a word timeline (`<naam>.words.json`), the spoken word is highlighted as it plays, and the page follows along
- Remembers your reading position per file, and resumes there when you reopen it
- Deep customization: 10 themes + custom colors, light/dark/auto, fonts, sizes, accent
- Remembers window size/position; single-instance + OS file association (open `.md` files with Mark)

## Requirements

- **Node.js** 18+ (and npm)
- **Rust** (rustup) — https://rustup.rs
- **Windows**: WebView2 runtime (preinstalled on Windows 10/11)
- **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `build-essential`

## Develop

```bash
npm install
npm run tauri:dev      # opens the app with hot reload
```

> You can also use `bun` instead of `npm` (faster). If you do, set `beforeDevCommand`/`beforeBuildCommand` in `src-tauri/tauri.conf.json` back to `bun run ...`.

## Build a native app

```bash
npm install
npm run tauri:build
```

Installers/binaries land in `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` and `.exe` (NSIS) installers + `Mark.exe`
- **macOS**: `.dmg` / `.app`
- **Linux**: `.deb`, `.AppImage`, `.rpm`

The Windows installer registers `.md`/`.markdown`/... file associations, so Mark appears in "Open with" and can be set as the default.

### Make Mark your default markdown reader

1. Build & install (above).
2. Right-click any `.md` file → **Open with** → **Choose another app** → pick **Mark** → **Always**.
   (The installer already advertises the association, so it should appear automatically.)

Double-clicking a `.md` launches Mark and opens the file; if Mark is already running, the file opens in the existing window (single-instance).

## Run the prebuilt Linux debug binary (WSL)

```bash
cd src-tauri && cargo tauri build --debug --no-bundle
LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 ./target/debug/mark
```

## Customize

Open **Settings** (gear, top-right, or `Ctrl+,`). Change theme, mode, fonts, font size, line height, content width, padding, accent color, and — when "Custom" is selected — every page color. Toggle auto-linking, smart quotes, emoji, math, and task lists. Everything persists.

Shortcuts: `Ctrl/Cmd+O` open · `Ctrl/Cmd+,` settings · `Ctrl/Cmd+Shift+T` toggle theme · `Ctrl/Cmd+P` print / save as PDF · `Ctrl/Cmd +/-` reading size · `Ctrl/Cmd+0` reset size · `Esc` close panel.

## Project structure

```
src/
  main.ts                 entry (loads CSS, mounts app)
  app.ts                  app shell: chrome, empty state, recent, drag-drop, shortcuts, Tauri wiring
  viewer.ts               renders documents, copy buttons, external links
  settings.ts             settings panel (live, persisted)
  themes.ts               theme presets + applies settings as CSS variables
  store.ts                settings persistence (localStorage)
  files.ts                file picking/reading (Tauri command + browser fallback)
  renderer/
    base.ts               DocRenderer interface  ← add new formats (e.g. plain text) here
    markdown.ts           markdown-it stack + highlight.js + KaTeX + DOMPurify
    text.ts               plain-text renderer (foundation for a future text-reader mode)
    index.ts              renderer factory by file kind
  styles/                 markdown.css (document), app.css (chrome/panel)
src-tauri/                Rust shell: read_text_file command, CLI/single-instance, plugins
src/__tests__/renderer.test.ts   vitest suite (jsdom) for the renderer
```

## Adding the "text reader" mode later

The viewer picks a renderer by file kind (`detectKind`). A `TextRenderer` already exists. To extend, add a new `DocRenderer` and branch on extension in `renderer/index.ts`.

## Notes

- The JS bundle is ~560 KB gzip (mostly highlight.js + KaTeX). It loads from local disk, so startup stays fast. To shrink it, register only the highlight.js languages you need in `src/renderer/markdown.ts`.
- HTML in markdown is allowed and sanitized with DOMPurify; `id`/`name` values that would clobber DOM globals are dropped (rare).
