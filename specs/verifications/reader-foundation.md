---
type: verification
context: MARK_PLAN.md steps 0.1–0.4, reader reliability before workspace expansion
---

# Reader foundation — checkpoint

Branch: `feat/reader-foundation`. Baseline: `c8fb838`. No changes to source books.
This checkpoint implements the foundation, not the notebook/whiteboard workspace.
The owner requested a local checkpoint commit and will review the application tomorrow.

## Implemented

- Resolve quote/context matches across the document before painting highlights. Ambiguous, missing, changed or overlapping passages retain their notes in a separate recovery panel. Explicit relinking keeps the original note and color.
- Persist exact note drafts separately from the selection popup. Scroll, Escape, source switching and reload retain acknowledged drafts. Failed writes retain a session copy, show a warning and support retry/export. Saving a new highlight and its note is atomic; stable group identity prevents retry duplicates.
- Validate legacy storage before mutation. Corrupt/unsupported raw values remain intact. Preserve a raw pre-change snapshot once; export all readable MARK keys and unsaved session drafts. External books are not included. Import is not implemented yet.
- Browser exports report a download request, not a confirmed disk write. Native exports use a user-selected new JSON file, reject existing files, validate the envelope and size, and acknowledge only after write and sync. No unrestricted renderer-path write API was added.
- Update Markdown parser dependencies and compatible development dependencies without forced breaking upgrades. Keep both lockfiles.
- Keep the expanded note editor within a compact viewport; keyboard selection inside its textarea no longer replaces the editor. Storage warnings do not depend on a toast callback; successful export retry clears only its own warning.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 130 passed; 1 existing alignment test skipped because private fixtures are absent |
| `npm run build` | TypeScript and Vite passed; existing large-chunk warning remains |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | 9 passed |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Passed |
| `git diff --check` | Passed |
| `npm audit` and `npm audit --omit=dev` | 0 critical/high/moderate; 2 low affected dependency entries |
| Isolated Chrome cold-start smoke | 23 assertions passed, 0 unhandled exceptions |

Browser checks cover Markdown/math/Mermaid/code, Book navigation, repeated quotes, exact drafts after scroll/switch/reload, keyboard input, save/cleanup, missing-note recovery, relinking, quota failure/session recovery/retry, actual backup downloads with corrupt raw bytes and session drafts, source-file exclusion, and note-editor geometry at 460×340.

Latest local browser evidence: `C:/Users/vandi/AppData/Local/Temp/mark-foundation-Ipapfp/results.json` and `compact-editor.png` in the same directory. Reproducer: `C:/Users/vandi/AppData/Local/Temp/mark-foundation-smoke.mjs`. These are machine-local temporary artifacts, not a portable CI harness. They use an isolated Chrome profile and generated/sample documents, not private books.

## Self-audit and security

- Correctness: regressions added before fixes; public storage and Viewer behavior tested. Inputs remain captured against their original file identity.
- Security: source rendering remains DOMPurify-sanitized. Recovery content uses text nodes. Stored IDs do not reach CSS selectors. Native backup destinations come from the dialog, and `create_new(true)` prevents overwriting books or previous backups. No new execution, network, authentication or SQL surface.
- Performance: one untouched text index per annotation repaint; matching stops after two candidates prove ambiguity. No startup or large-library performance claim. Draft writes are synchronous in this legacy foundation; scalable repository work belongs to step 0.5.
- Clarity/scope: dedicated anchor, draft, storage, recovery and export modules. Existing large Viewer/App files are not rewritten solely to meet a generic style threshold. No new runtime dependency.
- No CONVENTIONS.md, lint script, lifecycle YAML or catalog verification scripts exist here. Their checks are not claimed to pass. One fresh independent reviewer is used in the bounded workflow; a dual-review release gate is not claimed.
- Residual advisory: `GHSA-238p-pmpm-9mq7`, KaTeX and transitively Mermaid, requires existing prototype pollution. Audit suggests breaking KaTeX 0.19.0 / Mermaid 10.8.0 changes; not applied blindly. No exploit demonstration or zero-vulnerability claim.

## Open before release / tomorrow

- Independent final review completed: **OK with notes**, no issues found in a timeboxed working-tree inspection. The reviewer inspected code/tests/browser evidence but did not independently execute tests; not an exhaustive adversarial/concurrency audit. All four workflow children (three scouts plus reviewer) completed. See `reader-foundation-review.md`.
- Native save-dialog interaction, cancellation/failure, close warning, installer, actual audio/karaoke playback and full native UAT are not verified by browser or mocked IPC tests.
- Existing header overflow at the native minimum 460×340 remains; tracked in step 1.3. The note popup fits, but not every header action does.
- Legacy identity still uses path/browser filename. Move/rename, identical browser names and recent-25 position pruning require step 0.5. This checkpoint does not claim to fix them.
- A failed persistence write cannot survive process termination. Keep MARK open and export session work. The pre-change copy shares localStorage quota and is not an independent disk backup.
- Before 0.5: decide filesystem/Markdown/JSON versus SQLite, linked versus copied source files, and browser workspace versus reader-only. Before boards: confirm cards/connections versus pen/freehand. No notebooks, boards, PDF/EPUB support or measured 10× improvement has been shipped here.

## Suggested manual check tomorrow

1. In Tauri, open a sample book, write a note, scroll, switch files and restart; inspect drafts and recovery.
2. Export to a new JSON file; cancel once, then attempt an existing filename. Confirm no source or previous backup is overwritten.
3. Check Document/Book, audio/follow and compact-window controls.
4. Confirm the storage/source/platform choices before continuing to step 0.5.
