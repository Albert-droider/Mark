---
type: story
context: "Live Markdown demo following 90f89e7"
story_id: e01s01
risk: P1
status: superseded
superseded_by: e01s02
---

# e01s01 — Living Markdown test page

Historical story. The live-copy-first route is superseded by [e01s02](e01s02-in-place-reader.md). Optional live note previews remain available.

The owner approved this bounded follow-up to `90f89e7`. It does not choose the future notebook/board storage architecture.

## User story

As MARK's user, I can open `SAMPLE.md` as a live copy, tick tasks, fill and clear tables, change diagrams/charts/plans, and keep the resulting Markdown after reopening or exporting it.

## Contracts

- The original source stays read-only. File → Open live copy creates a named document draft and opens its interactive preview.
- Markdown is the only editable document state. HTML is a view, never the storage format.
- Only parser-mapped task markers and blocks get mutation controls. Repeated text and authored HTML cannot redirect an edit.
- Each live change uses the same acknowledged draft save and error/recovery path as typing. Failed storage keeps a session copy and warns the user.
- Table cells expose their Markdown source. Editing, adding/removing rows and columns, and clearing data do not silently remove headers or unrelated source text. Complex unsupported blocks remain editable in the Markdown source.
- Artifact/code edits change the exact fence in this draft. Code is never executed. Bad artifact syntax has a visible error and remains recoverable.
- Undo/redo applies to current-session edits; export and block context use the updated Markdown. There is no automatic upload.

## Vertical slices and acceptance

1. Tasks: enable only mapped preview checkboxes. Persist the correct marker, including repeated/nested/quoted/ordered tasks and frontmatter/CRLF. Reader tasks stay disabled.
2. Tables: open a cell editor, fill/clear, add/remove rows and columns, insert a new table, apply/cancel, and keep unrelated source intact. Test escaped pipes and unsafe HTML.
3. Artifacts/code: edit Mermaid/chart/plan bodies, insert artifacts, copy code, apply/cancel, and export the current fence/context.
4. Recover/demo: undo/redo, restart and resume the same draft, failed-save recovery, real browser clicks/downloads, and compact controls. Update `SAMPLE.md` and the README to match only working actions.

## Verification

`npm test`; `npm run build`; `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`; `node scripts/reader-smoke.mjs`; `node scripts/live-demo-smoke.mjs`; `git diff --check`.

Use isolated browser profiles and public/generated fixtures. Existing private audio-alignment skip remains explicit. Native save dialog and actual audio are separate human acceptance, not proved by browser automation.

Implementation checks pass: 196 frontend tests, 12 Rust tests, 41 live-browser checks, and 30 reader/editor checks. One private alignment test skips. Human native acceptance remains open. Evidence: [verification](../../verifications/e01s01-live-demo.md) and [structured gates](../../verifications/e01s01-verify.yaml).
