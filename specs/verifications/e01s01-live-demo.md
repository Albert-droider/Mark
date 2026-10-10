---
type: verification
context: "e01s01 living Markdown demo, baseline 90f89e7"
status: superseded
superseded_by: e01s02
---

# Living Markdown demo — verification

**Historical checkpoint.** The owner replaced the live-copy-first workflow with direct reader editing and versions. Current behavior and gates are in [e01s02](e01s02-in-place-reader.md). The instructions and counts below describe the earlier checkpoint, not today's UI.

Reason for existence: reproduce the live-demo checks and define the remaining native acceptance.

Date: 2026-10-08. Branch: `feat/reader-editor-shell`. This follow-up is not yet committed.

## Delivered

Open `SAMPLE.md`, then choose **File → Open live copy…**. Notes opens an editable `SAMPLE-edited.md` draft.

- Mapped tasks change their own Markdown markers. Original reader tasks stay disabled.
- Tables support cell edits, row and column changes, Clear data, Apply, and Cancel.
- Insert adds editable tables, tasks, code, and artifact templates.
- Artifact controls change Mermaid, chart, and plan fences. Code editing never executes code.
- Undo/redo, local draft acknowledgement, reopen, and export use the same Markdown state.
- Share exports the edited block as Markdown, table CSV, or agent context. Context identifies the current snapshot.

No source file is overwritten. No cloud, automatic upload, workspace migration, or new dependency was added.

## Mechanical gates

| Command | Result |
| --- | --- |
| `npm test` | 196 passed, 1 skipped. 20 test files passed, 1 skipped. |
| `npm run build -- --logLevel warn` | Passed, including TypeScript. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Passed. |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | 12 passed. |
| `node scripts/live-demo-smoke.mjs` | 41 browser checks passed, 0 unhandled exceptions. |
| `node scripts/reader-smoke.mjs` | 30 browser checks passed. |
| `git diff --check` | Passed. |
| `ste_lint.py` on six changed Markdown documents | 0 errors. 6 non-blocking warnings. |
| Python `yaml.safe_load` on state, tasks, and structured gates | Passed. |

The private alignment test needs `MARK_DOC_ALIGN` and `MARK_TIMING_ALIGN`. Their absence explains the skip.

Vite still reports chunks larger than 500 kB and mixed static/dynamic imports of Tauri core. Startup performance was not measured.

## Real browser evidence

Both scripts boot a fresh Vite server and an isolated Chrome profile. They use public/generated documents and close only their own processes.

Live run: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-L1XKvl/results.json`.
Reader run: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-ToupbS/results.json`.
Screenshots: `live-page.png` and `live-460.png` in the live-run directory. These temporary paths are diagnostic artifacts, not permanent CI storage.

The 41 checks cover:

- Real task clicks, source-line targeting, focus retention, and persistent acknowledgement.
- Table fill, insertion, row/column changes, clear, cancel, undo, and redo.
- Chart/plan/Mermaid edits, rejection of invalid chart input, and actual clipboard code copy.
- Actual Markdown, CSV, context JSON, and complete-document downloads.
- Exact context/source hash and unchanged original `SAMPLE.md` bytes.
- Fresh-instance recovery without the original source file.
- Injected storage failure, visible session-only status, undo/redo, and retry without duplicate drafts.
- Reachable controls at 1200×820, 800×600, and 460×340.

The preceding 30 checks also cover Attach confirmation/cancellation, reader/book behavior, note retention, backup, and compact audio footprints.

## Defect found during UAT automation

The storage-warning toast intercepted a real Save draft click. Persistent storage therefore retained the previous task state after retry.

A dedicated hit-test regression failed before the fix. `src/styles/app.css` now makes informational toasts pointer-transparent.

A second regression showed the compact warning covering the footer visually. `src/styles/notes.css` now reserves footer space, including the audio footprint.

The complete 41-check run passed after both fixes. Failed runs remain separate from the final verdict:

- Click interception: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-Blz36F/results.json`.
- Footer overlap: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-a4yOqI/results.json`.

## Self-review

| Area | Verdict |
| --- | --- |
| Correctness | PASS: parser provenance, snapshot rejection, exact Markdown changes, and persistence paths exercised. |
| Security | PASS for the inspected diff. Details: [security review](../security/REVIEW.md). No independent reviewer was dispatched for this follow-up. |
| Supply chain | No package or lockfile change. Production audit: 0 high/critical/moderate, 2 low affected packages. |
| Performance | Bounded undo deltas and table dimensions. Whole-preview rerender remains; large-book latency is unmeasured. |
| Types | TypeScript passed. No new `any`, ignored errors, or double casts in live modules. |
| Design | Mutation, table/fence forms, and history have separate modules. Existing App/Viewer monoliths were not rewritten. |
| Tests | Public editor flows plus pure boundary tests and real-browser checks. No coverage percentage is claimed. |
| Metadata | New story/tasks/report identify e01s01 and baseline `90f89e7`. |
| Project tooling | No repository lint, CONVENTIONS, CI preflight, blind-spot, or completeness scripts exist. Those gates were not claimed. |

The existing low advisory is GHSA-238p-pmpm-9mq7, affecting KaTeX and transitively Mermaid. Forced major upgrades remain outside this follow-up.

## Limits

- Unapplied table/artifact form input is temporary. Cancel, editor close, or rerender discards it.
- Visual tables support 200 body rows and 24 columns. Unsupported nested, unclosed, or large blocks use Markdown source editing.
- Undo retains up to 100 changes and 2,000,000 changed characters. Reopening a draft resets history.
- A failed localStorage write retains only a session copy. Export before closing MARK.
- Browser export reports a request. Only the native backend acknowledges a completed file write.
- Native save dialog, installer, actual audio playback, and private alignment still need human acceptance.
- The filesystem/SQLite workspace and notebook/whiteboard decisions remain gated in `MARK_PLAN.md`.

## Human acceptance — still open

1. In the existing native preview, open `SAMPLE.md` and choose **File → Open live copy…**.
2. Tick a task and apply a table edit.
3. Apply a diagram edit.
4. Export to a new destination through the native save dialog.
5. Reopen MARK and resume `SAMPLE-edited.md` from Notes.
6. Check the writer alongside actual audio playback.

Automated implementation gates pass. The story remains `awaiting_manual_uat`, not release-approved.

Verify: `npm test && npm run build && node scripts/reader-smoke.mjs && node scripts/live-demo-smoke.mjs`.
