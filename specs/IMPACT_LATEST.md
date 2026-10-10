---
type: impact
context: e01s04 release recovery after the interrupted strict audit
baseline: 90f89e7
---

# Impact: reader release recovery

## Current change

Owner approval m00282 resolves the two storage policy questions. Implement a configurable 1 GiB limit per document, warn at 80 percent use, and refuse over-budget saves without changing source or history. Keep pending edits exportable. Native editing has one active writer with best-effort external-change detection. No atomic collaboration guarantee is promised.

### Storage dependents and tests

- `src/browser-documents.ts` and `src/document-records.ts` own the browser working source, compressed payloads, metadata validation, and retention. `src/document-database.ts` serializes and acknowledges their transactions. Budget rejection must abort before any put, add, or prune.
- `src-tauri/src/versions.rs` owns the native command boundary and registry gate. `src-tauri/src/versions/storage.rs` plans and writes snapshots. `src-tauri/src/versions/snapshots.rs` controls compression. Add `src-tauri/src/versions/budget.rs` for pre-write byte accounting. Extract the existing encoding and replacement helpers into `src-tauri/src/versions/source.rs` to keep these modules below 300 lines without changing replacement semantics. Check the full projected byte count before writing a candidate snapshot or replacing the source.
- `src/document-store.ts` selects the platform store. `src/document-session.ts`, `src/reader-documents.ts`, and `src/app.ts` consume save receipts and bindings. Add optional storage-use data without changing acknowledged-save semantics or the five-second clock.
- `src/types.ts`, `src/store.ts`, and `src/settings.ts` supply a persisted budget setting. Existing preferences must still load. Reset appearance must not silently change a chosen storage limit.
- Existing tests: `src/__tests__/document-session.test.ts`, `src/__tests__/document-records.test.ts`, `src/__tests__/store.test.ts`, and `src-tauri/src/versions/tests.rs`. `scripts/document-storage-smoke.mjs` supplies real IndexedDB migration, corruption, and rollback coverage.
- Add boundary, compression accounting, quota rejection, pending-source/export, lowered-limit, and detected-conflict tests. Small injected budgets avoid allocating 1 GiB in tests.

Shared storage and receipt interfaces make this a high-risk change. No new dependency, source rewrite, retention change, forced reload, or history downsampling is needed.

### Completed earlier slice

`src/reader-shortcuts.ts` and `src/reader-navigation.ts` now have public-flow tests and 100 percent measured function coverage. Preserve their IME/event ownership and late-layout race fixes.

## Existing reader scope

Normal `Viewer.openNote` and toolbar Notes use a floating control beside the reader. Persist bodies in the current Markdown, not `mark.highlights.v1`.

The initial visible note-block approach was rejected. The final contract is an underline and hover, with zero reading-flow movement.

## Dependents

- `src/viewer.ts`: selection, reader lifetime, legacy highlights, recovery and drafts.
- `src/renderer/markdown.ts` and `src/renderer/base.ts`: source maps and sanitized note rendering.
- `src/in-place-reader.ts`: parser-owned edits and editing-state guard.
- `src/app.ts`: toolbar/file actions, autosave, Book layout, file transitions.
- `src/anchors.ts`: reader controls and note contents must not affect source anchors.
- `src/reader-documents.ts` and `src/document-session.ts`: unchanged versioned-source boundary.
- `src/share.ts` and source export: current source includes notes automatically.

## Affected stories

Current e01s03 replaces separate note authoring from e01s01. e01s02 task/table/versioning remains active. Full notebook/board choices remain gated.

## Coverage

Existing renderer, viewer-highlighting, in-place-reader, document-session, and reader-documents tests cover their old contracts. Add codec, reader-note and real Chrome save/reload/export regressions. Existing editor-specific browser checks need relabeling or updating, not false passes.

## Risk: High

Shared renderer/reader interfaces and user-authored data cross the change. Use exact-source guards, parser provenance, retained legacy data and vertical tests. Existing strict audit remains blocked independently of functional success.
