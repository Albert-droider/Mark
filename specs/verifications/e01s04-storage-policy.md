---
type: verification
context: "e01s04 approved storage policy against 90f89e7"
status: functional_pass_audit_blocked
owner_decision: m00282
---
# Document storage policy — verification

The owner approved the recommendation in m00281. This checkpoint does not authorize review, commit, or push.

## Implemented contract

- Default: 1 GiB per document, or 1,024 MiB in Settings.
- Settings accepts integer limits from 64 through 16,384 MiB. Invalid stored values use the default without changing document data.
- A visible warning starts at 80 percent use. Changing the budget preserves pending edits and the current save status.
- Over-budget saves stop before source writes, snapshot insertion, or expiration. They do not make space by deleting history.
- Pending Markdown remains editable and available for explicit export. Raising the limit permits the normal five-second retry.
- Thirty-day retention, the exact retention boundary, and latest-version protection remain unchanged.
- Native saves use the approved single-writer contract. Detected external changes fail visibly. The final comparison and rename are not cross-process compare-and-swap.

The byte model includes the working source, stored snapshot payloads, and document metadata. Browser metadata has a conservative overhead allowance. Native accounting uses encoded source bytes and retained regular history files.

This is a managed-data limit, not a physical disk quota. Database allocation, filesystem allocation, temporary replacement files, and explicit exports are outside the model. Browser save receipts can conservatively include expired rows from the successful transaction.

## Actual reader proof

`node scripts/document-budget-smoke.mjs` passed five checks in an owned Chromium profile with a synthetic near-16-MiB document.

1. The reader used the configured 64-MiB limit.
2. It showed an 82-percent warning at 54,687,018 accounted bytes. All three protected versions remained readable.
3. A rejected autosave retained the pending checkbox edit, acknowledged source, original snapshot, and latest snapshot.
4. An actual new-file Markdown download matched the pending source's SHA-256 hash exactly.
5. Increasing the limit to 128 MiB permitted retry. Four versions remained, and the acknowledged source matched exactly.

[Detailed browser evidence](e01s04-document-budget.json) records warning, rejection, and retry states. This does not prove packaged native behavior.

## Core and regression proof

Five native budget tests passed. They cover refusal without source/history changes, exact retained-byte receipts, idle deduplication, settings bounds, and the 80-percent threshold.

The UTF-16 boundary test confirms the existing encoded-size guard. A file of exactly 16 MiB remains readable. Adding one UTF-16 character exceeds that limit and leaves source and history unchanged. No UTF-16 production fix was required.

A reproduced status-formatting defect produced two sentence separators after a period-terminated save error. Public session tests failed before normalization and passed afterward. Pending edits remain dirty in both cases.

DocumentSession, document-budget, document-store, ReaderNavigation, and ReaderShortcuts each have 100-percent V8 function coverage. App, BrowserDocumentStore, and DocumentDatabase still have zero V8 unit coverage. Chromium assertions are separate evidence, not merged unit coverage.

## Complete functional checkpoint

[Functional gates](e01s04-policy-gates.json):

- Frontend: 317 passed, one explained private-fixture skip.
- Native: 31 passed.
- TypeScript, Vite production build, Rust formatting, and Git whitespace checks passed.
- Frontend coverage: 66.34 percent functions and 74.37 percent lines.

[All seven Chromium scripts](e01s04-policy-browser-gates.json) passed. They cover five budget checks, sixteen storage checks, thirty-eight direct-reader checks, twenty-one legacy checks, and fourteen note checks. The other scripts measure history and large-reader latency.

The 257-version history dialog opened at 21.9 ms p95. Its metadata list took 3.4 ms p95, and saves took 17.4 ms p95. Oldest and latest sources remained exact.

For the 16-MiB reader fixture, input-handler p95 was 10.9 ms and open time was 2,835.2 ms. The existing budgets remain 16 ms for input and 5,000 ms for open.

Full and production dependency audits each report two low entries and zero moderate, high, or critical entries. The existing KaTeX/Mermaid advisory remains recorded.

## Still blocked

The [strict audit](AUDIT-e01-s03.md) remains NOT READY. Function/style/identity cleanup, unit-coverage gaps, and real project tooling remain unresolved.

Packaged startup, native budget warnings/refusal/export/restart, hover, audio, and installer acceptance remain pending. The previous native preview is not evidence for this revision. It requires a rebuilt binary and fresh verification.

The history corpus is synthetic and same-day. It does not prove thirty-day continuous editing or native history latency. Browser data can still be evicted outside MARK.

No independent reviewer, commit, or push ran. Existing books and the separate `C:/Projects/Mark` session were not used by these tests.
