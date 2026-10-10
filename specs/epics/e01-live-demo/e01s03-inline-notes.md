---
type: story
context: e01s03 one Markdown reading and annotation workspace
status: audit_blocked
baseline: 90f89e7
owner_decisions: [m02059, m02124]
---

# e01s03 — Notes live in the reading file

The owner replaced separate note authoring with one reading surface. A future mode for creating Markdown files is out of scope.

## Contract

- Selection → Note opens a small floating writing control, not a separate editor or a block in the text.
- Only a subtle underline identifies a noted passage. Hover shows the note. Click revises it.
- Note data is retained in Markdown at the file end, with a stable ID and quote/context metadata. MARK does not render these data blocks into the reading flow.
- Typing updates the current source. Existing five-second autosave and thirty-day versions apply unchanged.
- Current Markdown exports contain notes. No annotation database is required to recover new notes.
- Existing local notes and drafts are never removed. Matched legacy notes can be copied into the source without deleting their originals.
- File actions do not offer a separate new-note or raw-editor workflow.
- No threads, boards, cloud, new packages, or workspace storage redesign.

## Safety

Only parser-owned source locations can receive a passage note. Ambiguous or unsupported locations report a failure instead of guessing. Note edits use an exact-source guard. New controls exclude UI text from quotes and copy/export content.

## Verify

1. Codec: exact source round-trip, CRLF/BOM, unsafe metadata, stale edits, and quoted marker examples.
2. Reader: select a repeated passage, show only an underline, write in a floating control, hover, reopen, edit/delete, and retain legacy data.
3. Geometry: article dimensions and line positions stay unchanged when notes are added or shown.
4. Storage: native/browser existing save paths receive the note Markdown, with failed-save status and close protection.
5. Actual Chrome: note never opens the separate editor, remains in reader, survives reload, and appears in a real Markdown download.
6. Full tests, build, security self-review, and updated strict audit. No review, commit, or push while that gate remains blocked.

Functional evidence: [same-file notes](../../verifications/e01s03-reader-notes.md). Release gate: [NOT READY](../../verifications/AUDIT-e01-s03.md).
