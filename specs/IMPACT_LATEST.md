# Reader/editor shell — impact

Baseline: `a630522`. Request: Attach fails; inconsistent sizing; overloaded topbar; document-like notes; Markdown controls and shareable tables for reading, study and code.

## Targets and dependents

- `src/viewer.ts`: annotation selection, drafts, relinking and block actions. Called by `src/app.ts`; text mutations are consumed by `src/karaoke.ts`, `src/find.ts` and `src/book.ts`.
- `src/recovery.ts`: recovery entry points, used by Viewer. Saved notes need a distinct writing surface, not a recovery-only list.
- `src/app.ts` and `src/styles/app.css`: chrome, menus, responsive reader shell, native window controls. Preserve File/Open/Recent, contents, find, reading layouts, settings, theme and keyboard commands.
- `src/renderer/markdown.ts`: source-block mapping and sanitized output. Rendering also serves note previews; never share mutable document metadata between these callers.
- `src/backup.ts` / native export boundary: reuse acknowledged, user-chosen, new-file-only export semantics. Do not allow renderer-supplied filesystem paths or overwrite source files.
- `src/drafts.ts` / `src/highlights.ts`: retain existing identities and storage formats; no implicit workspace migration.

## Affected plan steps

Reader correctness 0.1–0.3 and responsive shell 1.3. This request brings shell and existing-note editing forward without choosing the 0.5 repository or claiming a notebook/board workspace.

## Test coverage and gaps

- `src/__tests__/viewer-highlight.test.ts`: annotations, drafts, warnings and hover. Gap: CSS can display a button whose hidden property is true; programmatic clicks do not cover browser visibility.
- `src/__tests__/highlights.test.ts`, `src/__tests__/drafts.test.ts`, `src/__tests__/store.test.ts`: preserve legacy data and failed-write recovery.
- `src/__tests__/renderer.test.ts`: sanitization and Markdown features. Add source-block provenance and round-trip export cases.
- `src/__tests__/book-turn.test.ts`, `src/__tests__/audioplayer.test.ts`, `src/__tests__/karaoke.test.ts`: reading/audio contracts.
- Browser gaps: actual Attach visibility/interaction, compact native-control footprint, long filenames, editor focus/scroll independence, table exports. Use isolated browser profiles, not the running reader's data.

## Risk: High

Shared rendering and shell APIs have multiple callers and partial integration coverage. Keep source rendering separate from editor state, test each behavioral change before implementing it, and validate real CSS in Chrome. Native exports require independent Rust checks; browser layout cannot prove native save-dialog behavior.

## Recommended action

Reproduce Attach first. Then build vertical slices: hidden-action contract → compact grouped chrome → separate existing-note document editor → content-level Markdown/CSV/agent-context sharing. Keep all source files unchanged and disclose limits of the Markdown editor rather than claiming full Word/WYSIWYG compatibility.
