---
type: verification
context: e01s03 subtle same-file reader notes against 90f89e7
status: functional_pass_audit_blocked
owner_decisions: [m02059, m02124]
---
# Reader notes without text interruption

Date: 2026-10-09. Verifier: parent. No new reviewer, commit, or push.

The note-block approach is superseded. The primary reader now uses underlines and floating controls, not a separate writer.

## Delivered contract

- Select text and choose Note. Write beside the reader.
- A noted passage has a subtle underline. Hover shows plain note text. Click revises or deletes the note.
- Note data lives at the Markdown file end. MARK does not render those data blocks in the article.
- Autosave uses the existing five-second clock. The same thirty-day versions protect notes and source.
- Normal File actions do not offer raw editing or separate note creation.
- Legacy notes, highlights, and drafts remain intact. The legacy writer is recovery-only.

A future Markdown-creation mode, comment threads, notebooks, and whiteboards are not implemented.

## Automated gates

| Check | Result |
| --- | --- |
| `npm run test:coverage` | 307 passed, one explained private-fixture skip |
| `npm run build` | TypeScript and Vite passed |
| Rust format and locked offline tests | Format passed, 26 tests passed |
| Keyboard/navigation public tests | 27 passed, both roles have 100% function coverage |
| `node scripts/document-storage-smoke.mjs` | 15 actual IndexedDB checks passed |
| `node scripts/reader-notes-smoke.mjs` | 14 passed |
| `node scripts/live-demo-smoke.mjs` | 38 passed |
| `node scripts/reader-smoke.mjs` | 21 passed |
| Production dependency audit | Zero moderate/high/critical; two low package entries |
| Documentation lint | Three current targets, zero errors and warnings |
| YAML parsing and Git whitespace | Active YAML files parsed, whitespace check passed |

The dependency entries share GHSA-238p-pmpm-9mq7 through KaTeX and Mermaid. Remediation adds dev-only `@vitest/coverage-v8` 4.1.11 and reuses Rust `flate2` 1.1.9.

Main JavaScript is 1,877.64 kB, or 604.94 kB gzip. Large-chunk and mixed Tauri import warnings remain. Packaged native startup remains unproved.

[Functional gates](e01s04-gates.json) record command results and measured frontend coverage: 64.52% functions and 72.99% lines. [Browser gates](e01s04-browser-gates.json) record all four Chrome scripts.

The [257-version history benchmark](e01s03-long-history.json) measures 21ms dialog p95 across 25 samples. Saves are 11ms p95. Metadata listing is 3.3ms p95. Oldest and latest Markdown read back exactly. This synthetic, same-day fixture does not prove thirty-day or native history performance.

## Geometry and browser persistence

The note suite checks the second of two identical paragraphs. Only that passage receives a mark.

Adding the note changes paragraph positions and article dimensions by exactly **0px**. Real hover also changes geometry by **0px**.

Book-mode hover retains columns and pagination. Neither the writing control nor tooltip enters the reading article.

Real IndexedDB acknowledgement, fresh reload, actual Markdown download, current note edits, and minimum-window geometry pass. The download contains note data and unchanged prose.

Artifacts:

- Notes: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-tiDoEQ/results.json`.
- Direct reader: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-GzZpbY/results.json`.
- Legacy regression: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-BR3pFA/results.json`.

The latter suite verifies math, diagrams, Book, legacy drafts and notes, Attach/Escape, real exports, quota warning, and compact chrome.

## Actual native note integration

Ten assertions passed in the running Tauri WebView with the real native document store.

A separate hidden Viewer and owned temporary fixture kept the owner's visible document unchanged. This was native IPC/filesystem integration, not native mouse-hover acceptance.

The fixture retained its original BOM and CRLF prose prefix. Five-second persistence wrote the note to that same file. Latest-version readback contained the note.

The store had two versions: original and changed source. Pending and saved states were observed after actual acknowledgement. No visible note block was inserted.

Evidence: `C:/Users/vandi/AppData/Local/Temp/mark-native-notes-qQTQK1/results.json`.
Reproducer: `C:/Users/vandi/AppData/Local/Temp/mark-native-notes-proof.mjs`.

## Regression and safety coverage

Codec and reader tests cover exact source guards, multiline data, CRLF/BOM, escaped metadata, malformed markers, fenced examples, and unsafe note text.

Global quote matching uses context before selecting duplicate text. Ambiguous or missing passages are not guessed. Notes remain in the file for explicit discovery.

Rejected source writes retain the input for retry. Failed persistence does not become Saved. Existing close protection and export paths remain active.

Keyboard tests reproduce and fix Ctrl shortcuts during IME composition. Navigation tests reproduce and fix delayed layout callbacks that reset a newer upload or position. Public tests also cover close/reset and source-commit invalidation.

[Storage checks](e01s03-browser-storage.json) verify corrupt metadata, invalid UTF-8 payloads, unsupported records, and aborted legacy migration. Rejected writes preserve the acknowledged source and history.

File note markup is owned by parser records. Tooltip text is not HTML. No eval, shell, remote request, new package, or automatic upload was added.

[Security review](../security/REVIEW.md) records the boundaries.

## Limits and next step

The strict [self-audit remains NOT READY](AUDIT-e01-s03.md). Unit-coverage gaps, function style, project tooling, external-writer races, and the total history budget remain open.

Compression and metadata-only reads now pass real-browser checks. They do not prove a total storage limit or safety against arbitrary external writers.

A missing passage retains its note but not an automatic mark. Other Markdown readers can show the callout bodies at the file end.

Browser uploads do not overwrite the original disk file. Export transfers current Markdown. Browser storage can be evicted outside MARK.

Native hover acceptance, export dialog, restart, actual audio alignment after edits, and installer acceptance remain pending.

The latest native preview remains open from `C:/Finish/MARK`. No original book or old `C:/Projects/Mark` session was edited.

Next: [active audit remediation](../epics/e01-live-demo/e01s04-audit-remediation.md). Do not run independent review, commit, or conditional push while the hard gate fails.
