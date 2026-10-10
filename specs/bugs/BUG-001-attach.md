---
bug_id: BUG-001
status: fixed
severity: medium
scope: reader-ui
title: Attach appears without a relinking target
---

# Attach appears but does nothing

## Problem

Ordinary text selections show Attach even though no unattached note was selected. Clicking it has no effect. Attach should only appear after choosing an existing unattached passage to relink.

## Verified diagnosis

Reproduced in a fresh Chrome profile against the real app. The action's hidden property was true, but its computed display was flex and its width was 64.390625 px. An author-level button display rule overrides the browser's hidden styling. The action has no target in this state, so the handler returns without changing anything.

Existing annotation tests inspected hidden properties or used programmatic clicks, not rendered visibility. The relinking storage operation itself is not proven broken by this reproduction; test that workflow independently with real button interaction.

Security impact: NONE. No security exploit path identified. Risk: medium; the visibility contract affects multiple controls.

## TDD fix plan

1. RED: `node scripts/reader-smoke.mjs` must reject a visible Attach action during an ordinary selection. GREEN: honor hidden attributes consistently for UI controls.
2. RED: exercise choosing an unattached note, selecting a replacement passage and clicking the real Attach button. GREEN: preserve the selected note's identity/text/color and give explicit pending/cancel feedback.
3. Re-run annotation/draft suites and compact-layout browser checks. Keep original source files unchanged.

## Evidence

Initial RED: computed `{hidden:true, display:'flex', width:64.390625}`; assertion `Attach must be invisible unless a note is being relinked` failed. Browser artifact directory: `C:/Users/vandi/AppData/Local/Temp/mark-reader-smoke-ezXlje`.

## Validation

The global hidden rule fixes rendered visibility. Attach now requires an explicit target and selected range. Choosing a recovery item never commits automatically. Escape clears the pending target.

Final results: 182 frontend tests passed, one private-fixture test skipped, 12 Rust tests passed, and 30 real-browser checks passed. Relinking preserves the group, note text, and color. Compact chrome/editor checks passed at 460×340, including native-control and audio-strip footprints.

See [verification and desktop checks](../verifications/reader-editor-shell.md) and [defect-class sweep](../verifications/generalize-sweep-BUG-001-attach.json). Full native save-dialog/audio acceptance remains separate.

verify: `npm test && node scripts/reader-smoke.mjs`

## Acceptance

- [x] No Attach action during ordinary selection.
- [x] Explicit relinking succeeds and keeps the original note and color.
- [x] No annotation/draft regression; compact controls remain accessible.
