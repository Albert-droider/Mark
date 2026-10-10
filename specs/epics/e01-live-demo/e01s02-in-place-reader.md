---
type: story
context: "Owner-approved replacement for the live-copy-first UI"
story_id: e01s02
risk: P1
status: audit_blocked
baseline: 90f89e7
---

# e01s02 — The reading page is the work surface

## Contract

The clean reading page remains the work surface. Tasks are clickable on that page. Double-click a table cell to type inside the same cell.

No duplicate table form, Notes pane, Apply footer, or edited-copy title is required.

Changed Markdown saves every five seconds. Native saves update the opened Markdown file with durable version storage.

History retains 30 days of versions and always protects the latest content, even after inactivity. Markdown sent elsewhere includes the edits.

Owner requests m01322 and m01385 explicitly approve original writes, version retention, and direct reader interaction. This decision does not choose the full workspace repository.

## Scope

Direct tasks and table cells use the current source. Quiet contextual controls edit and share blocks.

Original-file autosave supports version history, restore, and visible save failures. Existing reader, Book, annotations, and audio remain part of the preservation contract.

Browser documents use persistent IndexedDB versions and explicit Markdown export. Uploaded files do not grant source-write permission.

## Acceptance

| Status | Criterion |
| --- | --- |
| Accepted | The original reader remains visually clean during ordinary reading. |
| Accepted | A task click changes its own Markdown marker and survives reopen. |
| Accepted | Double-click enters the actual cell, without a duplicate editor. |
| Accepted | Changes save on a five-second clock, without idle duplicates. |
| Accepted | Cleanup protects the latest content beyond 30 days. |
| Accepted | Native Markdown sent elsewhere contains the edits. |
| Accepted | Block/context exports identify the current source. |
| Open | External edits, missing files, and storage errors never silently overwrite or discard pending work. |
| Accepted | Confirmed history restore creates another saved version. |
| Open | Real audio remains aligned after source edits. Notes, Book, and selection have automated regressions. |

Public/generated fixtures support unit tests, browser interactions, geometry, and actual native saves. Native close passed after the permission fix.

Native restart, export dialog, installer, and audio still require acceptance. Detected conflicts pass tests. Simultaneous external writers remain best-effort.

Strict gate: [NOT READY](../../verifications/AUDIT-e01-s02.md). No independent review or commit follows this failed gate.

Evidence: [direct reader verification](../../verifications/e01s02-in-place-reader.md).
