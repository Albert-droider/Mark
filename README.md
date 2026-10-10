# MARK

A local reader and Markdown work surface for books, study, READMEs, and code knowledge. Built with Tauri 2 and TypeScript.

The reading page is also the annotation surface. Passage notes live in the same Markdown file. Full notebooks and whiteboards remain roadmap steps.

## Read and work

Drop a Markdown or text file, or choose **File → Open document…**.

- Tick a task directly on the reading page.
- Double-click a table cell to type in that same cell. Press **Enter** to finish, or **Esc** to cancel the cell edit.
- Select text and choose **Note** to write in a small floating control.
- Use **File → Version history…** to inspect or restore a saved version.
- Hover an underlined passage to read its note. Click to revise it.
- Use **Notes** to find an existing file note or annotate a selection.
- Use **⋯** for contents, find, appearance, settings, print, and reading layout.
- Choose **Document** to scroll or **Book** for page spreads.

The renderer supports tables, tasks, code, math, footnotes, callouts, details, Mermaid, charts, and progress plans. DOMPurify sanitizes HTML. Authored stylesheets and forms are removed.

PDF and EPUB are not supported. Plain text remains read-only. If version storage cannot open safely, source controls stay disabled.

## Autosave and versions

**Desktop:** MARK updates the opened Markdown file. Changed content saves on a five-second clock. Opening, switching, and closing use guarded persistence.

**Browser:** uploaded files do not grant filesystem-write permission. MARK keeps the working Markdown and versions in IndexedDB. Export Markdown to send the changes elsewhere.

Idle intervals do not create duplicate versions. History retains versions for 30 days and always keeps the latest version. MARK never automatically deletes the working source file.

Cleanup runs on document-history access or save. It is not a background system service. Native writes preserve the original encoding, BOM, and line endings.

History restore requires confirmation and creates another saved version. It does not delete the history. External changes detected during a native save cause a conflict, not a silent acknowledgement.

CAUTION: After a save failure, keep MARK open. Export the current Markdown. Do not treat pending edits as saved.

Native history preserves an attempted version before replacing the source. Browser write failures retain a session copy until retry. A failed browser write cannot survive restart without export.

Native history uses `document-versions-v1` inside the application data directory. Back up that directory and your source files separately.

Concurrent external writers remain a limitation. Two source checks reduce races, but do not provide a cross-process transaction or collaborative editing.

## Try the living test page

1. Open `SAMPLE.md`.
2. Tick a task on the reading page.
3. Double-click a table cell.
4. Type new text.
5. Press **Enter**.
6. Wait for the **Saved** status.
7. Open **File → Version history…**.
8. Export the current Markdown from **File**.

The original desktop Markdown includes these changes. In the browser, the export contains the working Markdown. No live-copy route or duplicate table is required.

Use contextual controls to edit code or artifact Markdown. Code is text and is never executed. Unsupported tables remain read-only in MARK.

Normal File actions do not open a raw editor or create separate note files. A future Markdown-creation mode is out of scope.

## Write notes without interrupting the text

1. Select a passage.
2. Choose **Note**.
3. Type in the floating control.
4. Close the control and wait for **Saved**.

The passage receives a subtle underline, not a note block. Hover shows plain note text outside the article. Click the underline to edit or delete the note.

Note marks, hover, and writing controls do not add reading lines or Book columns. The prose remains unchanged.

Notes use the existing five-second save clock and thirty-day source versions. Failed writes remain visible. Keep MARK open and export the current Markdown before closing after a failure.

The file contains note bodies and quote/context metadata at its end. MARK hides those data blocks from the reading flow. Other Markdown readers can show the note bodies as callouts.

New file notes do not require localStorage to travel with the document. Existing local highlights, notes, and drafts remain intact; they are not silently migrated or deleted.

Matched legacy notes can be copied into the file. **Notes & backup** retains recovery for old drafts and unresolved annotations. The legacy draft writer is recovery-only, not the normal note workflow.

Ambiguous quotes are not guessed. A note with a missing passage stays in the file; **Notes** reports the missing match.

## Share a block

Use the clipboard icon. Code places it in the former Copy slot. Tables and diagrams place it after their content.

- Choose **Copy code** to copy code without executing it.
- Choose **Copy Markdown** to copy the current block.
- Choose **Download Markdown…** to export the current block.
- Choose **Download CSV…** to export a table. Spreadsheet formulas are treated as text.
- Choose **Download context for agent…** to export the block, filename, line range, and current source-text SHA-256.

Context excludes the rest of the book and filesystem paths. It labels source content as data, not instructions. Attach the export yourself. MARK makes no automatic upload.

Desktop export acknowledges a completed new-file write. Browser export reports a download request, not proof that the file reached disk.

## Local data and recovery

New passage notes belong to the Markdown file. Legacy annotations, settings, reading places, and old note drafts still use localStorage. Versioned browser documents use IndexedDB.

This is not yet a complete workspace repository.

Use **File → Notes & backup** for legacy unresolved annotations, old drafts, warnings, and reader-backup export.

CAUTION: After a failed note-draft write, export the draft or reader backup before closing MARK. Session-only changes cannot survive restart.

Reader backups contain raw legacy data and session-only note drafts. They exclude document versions, original books, audio, and other source files. Backup import is not available.

Moving a source can break its path-based annotation identity. Recent files are not a complete library. Browser storage can be cleared or evicted outside MARK.

## Audio

The desktop player detects `name.mp3`, `.m4a`, `.wav`, or `.ogg` beside the document or inside a sibling `audio/` directory.

A matching `name.words.json` supplies word timing:

```json
{ "woorden": [{ "w": "word", "t": 0, "d": 0.3 }] }
```

Follow keeps the spoken word visible. Real playback and alignment with edited source still require manual acceptance.

## Development and verification

Use Node.js 24, npm, Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires WebView2.

```bash
npm ci
npm run dev
npm run tauri:dev

npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
node scripts/reader-smoke.mjs
node scripts/live-demo-smoke.mjs
node scripts/reader-notes-smoke.mjs
node scripts/reader-performance.mjs
```

The browser scripts require Chrome or Edge. Set `CHROME_PATH` for another installation. Scripts use isolated profiles and temporary fixtures, not your books or app data.

The private alignment test requires `MARK_DOC_ALIGN` and `MARK_TIMING_ALIGN`. Without those fixtures, it skips.

Current evidence: [subtle file notes](specs/verifications/e01s03-reader-notes.md). Strict audit: [NOT READY](specs/verifications/AUDIT-e01-s03.md). No independent review or commit follows a failed audit.

## Build and install

```bash
npm run tauri:build
```

Bundles appear under `src-tauri/target/release/bundle/`. Windows installers register Markdown file associations. A new installer, native export dialog, and native restart still require acceptance.

## Shortcuts

- `Ctrl/Cmd+O`: open. `Ctrl/Cmd+F`: find. `F3`: next match.
- `Ctrl/Cmd+Shift+O`: contents. `Ctrl/Cmd+R`: reload. `R`: recent documents.
- `Ctrl/Cmd+Shift+B`: document/book. `Ctrl/Cmd+,`: settings. `Ctrl/Cmd+P`: print.
- `Ctrl/Cmd+W`: close document. `Ctrl/Cmd +/-`: reading size. `Ctrl/Cmd+0`: reset size.
- Table cell: `F2` or `Enter` starts editing. `Enter` finishes. `Esc` cancels.
- Note control: `Esc` closes. Source autosave continues after closing.
- Legacy draft writer: formatting and undo shortcuts remain available for recovery.
- `Esc`: close the front panel or cancel pending Attach.

## Direction

[MARK_PLAN.md](MARK_PLAN.md) defines the reader → notebook → board direction. Current direct editing enables shared attention through Markdown, not real-time collaboration.

The library, cross-document search, notebook, whiteboard, and learning loop remain future work. Their workspace-storage decisions are still open.
