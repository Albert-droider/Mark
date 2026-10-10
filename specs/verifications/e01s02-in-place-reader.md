---
type: verification
context: "e01s02 direct reader/versioning, baseline 90f89e7"
status: audit_blocked
---
# In-place reader — verification

Date: 2026-10-08. Branch: `feat/reader-editor-shell`. Changes remain uncommitted.

## Delivered behavior

The reading page owns task toggles and same-cell editing. No live-copy route, duplicate table, Notes pane, or Apply footer is required.

Code sharing uses one clipboard icon in the previous Copy slot. Table and artifact icons sit after their content.

Native source writes use the five-second clock and guarded lifecycle flushes. Browser working documents use IndexedDB and explicit export.

Versions retain 30 days and protect the latest snapshot indefinitely. Cleanup never deletes the working source.

## Mechanical evidence

| Gate | Result |
| --- | --- |
| Frontend | 236 passed, 1 private-fixture alignment test skipped. |
| TypeScript/Vite | Passed. Large-chunk and mixed Tauri-import warnings remain. |
| Rust format/tests | Passed. 21 tests. |
| Direct-reader Chrome | 40 checks, 0 unhandled exceptions. |
| Existing-reader Chrome | 30 checks. |
| Actual Tauri/WebView2 | 20 checks, including save-before-close. |
| Documentation lint | 7 targets, 0 errors, 0 warnings in the built-in checker. |
| Strict self-audit | NOT READY. No independent review or commit. |

The alignment test needs `MARK_DOC_ALIGN` and `MARK_TIMING_ALIGN`. No coverage percentage or startup improvement is claimed.

## Browser evidence

- Direct reader: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-DVIesc/results.json`.
- Existing reader: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-Lyki34/results.json`.

Public/generated sources and isolated profiles cover real clicks, cell typing, current exports, recovery, failure/retry, and persisted acknowledgement.

History and source-editing controls fit 1200×820, 800×600, and 460×340. The Markdown editor remains reachable from a later Book spread.

The public source file is unchanged by the smoke script.

## Actual native evidence

Artifact: `C:/Users/vandi/AppData/Local/Temp/mark-native-audit-yhk2sh/results.json`.

The temporary launcher uses app identifier `app.mark.reader.audit.pre1791475699374` and public/generated fixtures.

The 20 checks prove:

- Real original-file autosave, BOM/CRLF preservation, and idle deduplication.
- Actual WebView2 same-cell editing without a duplicate editor.
- Read-only write failure, visible error, retained attempted version, and interval retry.
- Read-only history preview and explicit restore to the real source.
- Rejection of traversal version IDs and unregistered document IDs.
- Synthetic 31-day cleanup with unknown files/source protected.
- Latest snapshot retention beyond 30 days.
- Dirty-source flush before the owned native window actually closes.

Native close initially failed because the API lacked destroy permission. The error was captured and repaired as [BUG-002](../bugs/BUG-002-native-close.md).

An early fixture contained edits entered by the owner. Those edits were preserved. Subsequent runs used fresh owned fixtures.

Only the audit window closed. The existing `C:/Projects/Mark` session was not stopped or modified.

The restore confirmation was stubbed during automation. Native export dialogs, full native restart, installer, and actual audio remain manual acceptance.

Temporary scripts and artifacts are diagnostics, not a permanent native CI runner.

## Audit defects fixed

- Inline image and math serialization lost original Markdown.
- Async agent context mixed source names and hashes.
- Raw editing from a later Book spread was offscreen.
- Deferred external-file reload consumed the modification time before acceptance.
- Changed annotated cells did not immediately expose the retained note in recovery.
- Malformed heading links threw an uncaught URI error.
- Default HTML sanitization retained global stylesheets and submitting forms.
- Native close lacked the permission required after guarded persistence.
- History reached through the session to its store. A focused contract now owns those operations.
- Failed history restore disabled retry. Late restore results affected newer dialogs.
- Cell cancellation did not safely report a failed mutation.
- Word statistics scanned and allocated the full source on each pending input.

Targeted regressions and real failing/passing native runs support these fixes.

Metadata-only performance uses 20 generated inputs per size. At 16 MiB, p95 changed from 137.53 ms to 0.0021 ms.

The 1, 5, and 16 MiB cases pass a 16 ms component budget. This is not a full-reader latency claim.

Results: [metadata benchmark](e01s02-reading-performance.json). Reproduce with `node scripts/reader-performance.mjs`.

## Owner preview

The latest native product is open in the foreground from `C:/Finish/MARK`, process 6964.

A separate public demo supplies three enabled task boxes and an editable table. No original book is changed for this preview.

Screenshot: `C:/Users/vandi/AppData/Local/Temp/mark-final-preview-hEFyKN/product.png`.

Native state: `C:/Users/vandi/AppData/Local/Temp/mark-final-preview-hEFyKN/visible-state.json`.

The owner requested a conditional push. The hard audit is not ready, so no commit or push occurred.

## Limits and next step

[Strict audit](AUDIT-e01-s02.md): NOT READY. Large classes/functions, coverage evidence, dependency boundaries, concurrency guarantees, and performance/storage budgets remain open.

Detected native conflicts are rejected. A writer racing the final source check is not covered by a cross-process transaction.

Full-file snapshots can consume substantial disk space. Native cleanup is access-driven, not a system timer.

Reader backup excludes version history. Browser data can be cleared outside MARK.

Workspace, notebook, board, and cross-document search remain owner-gated.

Verify:

```bash
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline
node scripts/live-demo-smoke.mjs
node scripts/reader-smoke.mjs
node scripts/reader-performance.mjs
```
