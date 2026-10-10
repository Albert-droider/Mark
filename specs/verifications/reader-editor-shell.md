---
type: verification
context: reader-editor-shell / BUG-001
baseline: a630522
branch: feat/reader-editor-shell
date: 2026-10-08
status: automated-and-browser-passed-native-acceptance-pending
---

# Reader/editor shell — verification

**Purpose:** Record what passed, preserve the source-safety contract, and provide the remaining desktop acceptance steps.

## Delivered scope

- Attach appears only during explicit relinking. Selection alone never commits a replacement anchor. Escape cancels.
- File, Notes, and reading/appearance actions replace the crowded permanent header controls. Common controls use a 32 px height.
- A separate document-like Markdown writer supports passage notes, standalone drafts, and editable source copies.
- Formatting controls, insertion templates, sanitized preview, and Markdown export support writing without changing the original source.
- Table, code, and artifact actions export original Markdown or bounded agent context. Tables also export spreadsheet-safe CSV.

This advances the writing and responsive parts of plan steps 1.2/1.3. It does not complete a notebook, shared search, library, or board.

## Executed gates

| Command | Result |
| --- | --- |
| `npm test` | 182 passed, 1 skipped. 19 suites passed, 1 skipped. |
| `npm run build -- --logLevel warn` | TypeScript and Vite passed. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Passed. |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | 12 Rust tests passed. |
| `node scripts/reader-smoke.mjs` | 30 browser checks passed. Zero unhandled exceptions. |
| `git diff --check` | Passed. |
| `npm audit --omit=dev --json` | 0 critical/high/moderate, 2 low affected entries. See security notes. |

No repository lint command exists. No lint pass is claimed. The skipped alignment test requires private book/audio fixtures.

The production audit exits 1 for the low findings. It is an evaluated exception, not a clean audit.

### Browser evidence

Runner: `scripts/browser-harness.mjs`, using Node WebSocket/CDP, an isolated Chrome profile, temporary fixtures, and an owned Vite process. No automation package or user data was added.

Latest successful run:

- `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-wP723T/results.json`
- `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-wP723T/reader-and-writer.png`
- `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-wP723T/notes-460.png`
- `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-wP723T/notes-audio-footprint-460.png`

A final rerun exposed a reload race in the test harness: a selector matched the old page before navigation finished. The harness now waits for a new JavaScript context before dropping another file. All 30 checks passed after that correction and the sample update.

The script asserts real mouse interactions and actual downloads. It covers:

1. Ordinary-selection Attach visibility, explicit relinking, cancellation, and preservation of note/group/color.
2. Reader scroll without writer closure, Markdown indentation, formatting, insertion, preview, and draft restart recovery.
3. Table Markdown with original CRLF, CSV formula protection, agent context, and fenced-code exports.
4. Document-copy isolation, Markdown export, and standalone drafts without an open source.
5. Math, Mermaid, code, book turns, and sharing menus outside transformed book pages.
6. Header/editor geometry at 1200×820, 800×600, and 460×340, including simulated native controls and audio-strip space.

Native controls and the audio strip are layout footprints in this test. They are not proof of native window events or audio playback.

## Defect-class sweep

BUG-001 came from CSS overriding the browser's default hidden styling. Unit tests checked DOM properties, not computed visibility.

The sweep reviewed 98 display-declaration lines across the stylesheets. That count is not a count of bugs. The global hidden rule protects interactive controls. Print expansion rules concern source content.

Artifact: [hidden-control sweep](generalize-sweep-BUG-001-attach.json).

verify: `bash C:/Users/vandi/.pi/agent/npm/node_modules/bigpowers/scripts/verify-generalize-sweep.sh C:/Finish/MARK/specs/verifications/generalize-sweep-BUG-001-attach.json`

## Parent self-review and security

This feature received parent self-review, not a new independent reviewer pass. The earlier independent review applies to the reader foundation only.

- Existing annotation groups and draft envelope version 1 remain intact. Document drafts use an optional purpose/name extension.
- Markdown notes preserve indentation and surrounding whitespace. Empty-only notes still clear the note text.
- Editor previews use a separate renderer and clean up old menus and asynchronous diagram work.
- Export completion status stays bound to the captured draft/text. A later edit does not receive a stale saved status.
- Block actions use parser-generated provenance, not trusted attributes from author HTML. UI labels stay outside quote/audio text indexing.
- Agent context contains the selected block, display filename, line range, and SHA-256 of decoded source text. It does not upload data.
- CSV neutralizes formula prefixes. Markdown/context retain the original source content.
- Native export accepts contents/name/format, never a renderer-selected destination path. Rust owns the save dialog.
- Native writes use `create_new(true)`, `write_all`, and `sync_all`. Existing files are never overwritten. Failed writes can leave a partial new file.
- Text export limits content to 16 MiB and validates format/extension. Native acknowledgement follows the completed write.
- No runtime dependency or filesystem capability was added. Existing large App/Viewer orchestration remains, with new responsibilities in separate modules.

Residual advisory: KaTeX and Mermaid are two affected entries for one low advisory, [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7). It concerns existing prototype pollution bypassing trust restrictions. Sanitization is not a proof that the advisory cannot apply. No forced major upgrade or downgrade was made.

Build warnings remain for large bundles and a mixed static/dynamic Tauri-core import. Startup performance was not measured.

## Remaining desktop acceptance

Run `npm run tauri:dev` to use the new code. A previously installed binary does not contain these changes.

1. Open a real book and README. Check File/Notes/⋯, window drag, minimize/maximize/close, and keyboard focus.
2. Resize to 460×340. Check menu access, writing, Save, and Export with real audio controls visible.
3. Relink an unattached passage. Confirm the anchor changes only after Attach. Cancel a second attempt with Escape.
4. Edit a passage note and an independent source copy. Restart and recover both drafts. Check that the source file bytes remain unchanged.
5. Export Markdown, CSV, and context through the native dialog. Check cancel, a new destination, an existing destination, and write failure.
6. Play real narration and verify karaoke/follow in Document and Book. Run the private alignment fixture separately.
7. Build and inspect the native installer before release.

## Known boundaries

- This is Markdown input plus preview, not full Word/WYSIWYG or a visual table-cell editor.
- Standalone documents remain local drafts until export. Storage is localStorage, not the future filesystem/SQLite repository.
- A failed local write leaves session-only data. Restart cannot recover that data without an external export.
- Reader backup excludes source books/audio. Import is not implemented.
- Path-based source identity and recent-25 position pruning remain foundation limitations until step 0.5.
- PDF/EPUB, full notebooks, whiteboards, shared search, and learning automation remain future work.

## Next decision

This is a local feature checkpoint, with `SAMPLE.md` documenting the working demo and its limits. No push, release, or workspace migration is included.

The requested follow-up is a living Markdown demo: persistent task toggles, editable tables, and artifact controls. Start on an editable copy. Complete desktop acceptance, and choose workspace storage, source linking/copying, and browser scope before plan step 0.5.

verify: `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml --locked && node scripts/reader-smoke.mjs`
