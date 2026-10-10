# MARK

A local reader and Markdown writing surface for books, study, READMEs, and code knowledge. Built with Tauri 2 and TypeScript.

The source stays read-only. Notes and editable copies live beside it, not inside the selection popup. Full notebooks and whiteboards remain separate roadmap steps.

## Read

Drop a Markdown or text file, or choose **File → Open document…**.

- Use **File** to open, revisit, close, or recover a document.
- Open **Notes** to write.
- Use **⋯** for reading layout, contents, find, appearance, settings, and print.
- Choose **Document** to scroll or **Book** for page spreads.

The renderer supports GFM tables, task lists, code highlighting, math, footnotes, callouts, details, Mermaid, charts, and progress plans. HTML passes through DOMPurify. Local document links, reading positions, and file-change detection remain available in the desktop app.

PDF and EPUB are not supported. Reading size, line height, width, and padding are available under **⋯ → Reading settings…**.

## Write notes and document copies

1. Select a passage.
2. Choose **Note**.
3. Write in the separate document pane.
4. Choose **Save note** to attach the text.

Reader scrolling does not close the writer. Drafts save locally, with visible status. Markdown indentation remains intact.

**Notes → New note** creates a standalone Markdown draft. **Edit source copy** starts from the current document. The textarea normalizes line endings, but neither action changes the original file.

Bold, italic, and heading buttons operate on selected text. **Insert** provides tables, lists, tasks, code, links, images, math, footnotes, callouts, details, and diagram templates. **Preview** renders sanitized Markdown. This is a document-like Markdown editor, not a full Word/WYSIWYG editor.

**Save draft** saves a standalone document locally. **Export .md** creates a separate file. Export does not overwrite an existing file in the desktop app.

For a missing passage, choose **Recovery & backup → Attach to selected passage**. Select the replacement text, then choose **Attach**. Only that confirmation changes the anchor. **Esc** cancels without changing the note.

## Share a table, code block, or diagram

Use the block's **Share** menu in the reader or note preview:

- Choose **Copy Markdown** to copy the original block.
- Choose **Download Markdown…** to export its source Markdown.
- Choose **Download CSV…** to export a table. Spreadsheet formulas become text.
- Choose **Download context for agent…** to export block context as JSON. This includes the filename, line range, and source-text SHA-256.

Context export excludes the rest of the book and filesystem-path metadata. It labels source content as data, not executable instructions. Attach the exported file to an agent conversation yourself. MARK makes no automatic upload.

Desktop export confirms a successful write to a new file. Browser export reports a download request, not proof that the file reached disk.

## Local data and recovery

Annotations, settings, reading places, and document drafts currently use localStorage. They are not yet a filesystem or SQLite workspace.

Use **File → Notes & backup** or **Notes → Recovery & backup** for unresolved annotations, drafts, storage warnings, and reader-backup export.

**CAUTION:** Keep MARK open after a failed draft write. Export the draft or reader backup before closing. Session-only changes cannot survive restart.

Reader backups preserve raw legacy data and include session-only drafts. They exclude original books, audio, and other source files. Backup import is not available. Keep source files separately.

Moving a source can still break its path-based identity. Recent files are not a complete library. These limitations belong to the workspace migration plan.

## Audio and reading features

The desktop player detects `name.mp3`, `.m4a`, `.wav`, or `.ogg` beside the document or inside a sibling `audio/` directory.

A matching `name.words.json` supplies word timing:

```json
{ "woorden": [{ "w": "word", "t": 0, "d": 0.3 }] }
```

Follow keeps the spoken word visible. Markdown math, diagrams, highlights, and document/book layouts remain reader features.

## Development

Use Node.js 24 and npm. Native development also requires Rust and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm run dev           # browser reader/editor
npm run tauri:dev     # desktop app with hot reload
```

Windows requires WebView2. Linux requires WebKitGTK and GTK development libraries. The current checks ran on Windows with Node.js 24.14.0.

## Verification

```bash
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
node scripts/reader-smoke.mjs
```

The browser smoke script requires Chrome or Edge. Set `CHROME_PATH` for another installation. It uses an isolated profile and temporary fixtures, not your books or app data.

The private audio-alignment test requires `MARK_DOC_ALIGN` and `MARK_TIMING_ALIGN`. Without those fixtures, that test skips.

See [reader/editor verification](specs/verifications/reader-editor-shell.md) for measured results, remaining native checks, and known limits.

## Build and install

```bash
npm run tauri:build
```

Bundles appear under `src-tauri/target/release/bundle/` for the build platform. Windows installers register Markdown file associations. Select MARK through **Open with** to use it as the default reader.

A new installer and native save-dialog flow still require manual acceptance for this change. Build warnings are not startup measurements.

## Shortcuts

- `Ctrl/Cmd+O`: open. `Ctrl/Cmd+F`: find. `F3`: next match.
- `Ctrl/Cmd+Shift+O`: contents. `Ctrl/Cmd+R`: reload. `R`: recent documents.
- `Ctrl/Cmd+Shift+B`: document/book. `Ctrl/Cmd+,`: settings. `Ctrl/Cmd+P`: print.
- `Ctrl/Cmd+W`: close document. `Ctrl/Cmd +/-`: reading size. `Ctrl/Cmd+0`: reset size.
- Writer: `Ctrl/Cmd+B`, `I`, `K`, and `S`: bold, italic, link, and save.
- `Esc`: close the front panel or cancel pending Attach.

## Direction

[MARK_PLAN.md](MARK_PLAN.md) defines the reader → notebook → board direction and its storage gates. The current change adds a writing surface and explicit context sharing. It does not complete the library, cross-document search, notebook, whiteboard, or learning loop.
