---
type: remediation_plan
context: "Strict owner audit m01393, e01s02, baseline 90f89e7"
status: open
---
# e01s02 — Remaining hard-gate work

Functional verification is green. [Strict self-audit](../../verifications/AUDIT-e01-s02.md) is not ready. No independent review or commit is authorized by this failed gate.

## Implemented corrections

History uses an immediate contract, not `session.store`. Restore failure permits retry. Late results cannot close a newer dialog.

Cell keyboard actions use a location contract. Failed cancellation retains the editable cell and reports the failure.

Word statistics avoid full-source scans during pending input. [Synthetic measurements](../../verifications/e01s02-reading-performance.json) cover 1, 5, and 16 MiB, not the whole reader.

## Further implemented corrections

App and Viewer now compose focused shell, host, appearance, file, navigation, keyboard, selection, legacy recovery, and annotation owners. Parser provenance and native media have separate modules. Ordered CSS imports preserve the existing cascade.

Browser/native gzip snapshots retain raw fallback and legacy reads. Browser metadata transactions prevent full payload scans and roll back failed writes. Thirty-day/latest semantics remain unchanged.

Real V8 coverage collection is wired with official Vitest/coverage-v8 4.1.11 `[OK]`. Native compression uses `flate2` 1.1.9 `[OK]`, Rust backend, no default features. Formal slopcheck remains unavailable.

The [real-reader benchmark](../../verifications/e01s03-reader-latency.json) covers 1/5/16-MiB generated books. It does not cover packaged startup or long history.

Owner question m02707 now has explicit regressions: unchanged content emits no save state, creates no write/version, and cannot hide failed-save status.

## Remaining work

1. Audit focused collaborators at function level. Smaller files do not prove full compliance.
2. Complete typed identity and dependency contracts. Remove the recorded Data Clumps and Primitive Obsession.
3. Apply the literal function, file, naming, nesting, and Stepdown rules to the changed scope.
4. Produce per-function coverage evidence through public flows. Close uncovered failure paths.
5. Establish real project conventions and test/review tooling. Do not create empty prerequisite files.
6. Measure packaged native startup and long-history budgets. Full-reader input/open now has bounded synthetic evidence.
7. Define a total storage budget without silently discarding 30-day/latest history. Compression alone does not bound growth.
8. Resolve the simultaneous external-writer contract. Two checks are not a transaction.
9. Accept actual audio after edits, native restart, export dialog, and installer behavior.

Storage budget and cross-process guarantees need explicit product decisions. Unapproved caps, silent pruning, and false save acknowledgement are not acceptable fixes.

## Exit

Re-run the complete self-audit and functional gates. Request independent review only after every applicable hard-gate item passes.
