# Mark

A small, fast **markdown reader** for the desktop — built with Tauri v2 + TypeScript. Parses GitHub-flavored markdown the way VS Code's preview does, out of the box.

## Features

- Full GFM: headings, tables, task lists, strikethrough, autolinks, fenced code
- Syntax highlighting (highlight.js, all languages) with per-block copy button
- Math via KaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`)
- Footnotes, abbreviations, definition lists, sub/sup, `==mark==`, emoji `:shortcodes:`
- Callout blocks: `:::tip / info / note / warning / danger / success` and GitHub alerts (`> [!NOTE]`)
- Collapsible `:::details` blocks
- Heading anchors and a contents list, find in the document, sanitized HTML (DOMPurify)
- Drag-and-drop, recent files, links to other documents open in Mark, web links open in the browser
- Remembers your place in each file (and reloads when the file changes on disk)
- Two reading layouts: a scrolling document, and a two-page book
- One paper light and one e-ink dark, with a fixed reading face
- Diagrams (`mermaid`), charts (`chart`), and progress plans (`plan`) in either layout
- Narration when a sibling audio file is present, with word-level karaoke from `<name>.words.json`
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

Open **Settings** (top-right, or `Ctrl+,`). **Document** scrolls the file. **Book** turns two pages on a paper spread; arrow keys and the side buttons turn the page. Choose light, dark, or auto. Reading size, line height, column width, and padding are adjustable. The typeface is fixed: body ink stays quieter than bold and headings. Charts, plans, and diagrams render in both layouts. Toggle auto-linking, smart quotes, emoji, math, and task lists. Reset appearance keeps your recent files.

If the open file has audio beside it (`name.mp3`, or `audio/name.mp3`, also m4a, wav, ogg), a player appears under the page. A matching `name.words.json` (`{ "woorden": [{ "w", "t", "d" }] }`) highlights the spoken word. Follow keeps that word on the page.

Select a passage to mark it yellow, green, or pink, or to attach a note. The mark stays on that sentence after you close the file. Click it again to edit the note or remove it.

A fenced `mermaid` block draws a diagram (flow, gantt, pie, sequence). A `chart` block draws bars, a line, or a pie. A `plan` block draws a progress list:

````markdown
```plan
title Quarter
Research | 40
Draft | 80
```
````

Shortcuts: `Ctrl/Cmd+O` open · `Ctrl/Cmd+F` find · `Ctrl/Cmd+G` or `F3` next match · `Ctrl/Cmd+Shift+O` contents · `Ctrl/Cmd+R` reload · `Ctrl/Cmd+W` close file · `R` recent files · `Ctrl/Cmd+Shift+T` light/dark · `Ctrl/Cmd+Shift+B` document/book · `Ctrl/Cmd+,` settings · `Ctrl/Cmd+P` print · `Ctrl/Cmd +/-` reading size · `Ctrl/Cmd+0` reset size · `Space` next page in book, or down in document · `Esc` close the front panel.

## Project structure

```
src/
  main.ts                 entry (loads CSS, mounts app)
  app.ts                  shell: chrome, shortcuts, and how the pieces connect
  session.ts              open document, reading place, file watch
  outline.ts              contents column
  find.ts                 find bar and in-document marks
  recent.ts               recent-file menu
  commands.ts             shortcut list shared with the key handler
  viewer.ts               renders documents, copy buttons, document and web links
  settings.ts             settings panel (live, persisted)
  themes.ts               the light and dark theme, applied as CSS variables
  store.ts                appearance, recent files, and reading place (localStorage)
  files.ts                file picking/reading (Tauri command + browser fallback)
  renderer/
    base.ts               DocRenderer interface  ← add new formats (e.g. plain text) here
    markdown.ts           markdown-it stack + highlight.js + KaTeX + DOMPurify
    text.ts               plain-text renderer (foundation for a future text-reader mode)
    index.ts              renderer factory by file kind
  styles/                 markdown.css (document), app.css (chrome/panel)
src-tauri/                Rust shell: text and image reads, CLI/single-instance, plugins
src/__tests__/            vitest suite for the renderer, themes, paths, and store
```

## Adding the "text reader" mode later

The viewer picks a renderer by file kind (`detectKind`). A `TextRenderer` already exists. To extend, add a new `DocRenderer` and branch on extension in `renderer/index.ts`.

## Notes

- The JS bundle is ~560 KB gzip (mostly highlight.js + KaTeX). It loads from local disk, so startup stays fast. To shrink it, register only the highlight.js languages you need in `src/renderer/markdown.ts`.
- HTML in markdown is allowed and sanitized with DOMPurify; `id`/`name` values that would clobber DOM globals are dropped (rare).
