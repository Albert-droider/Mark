---
type: code_audit
context: "e01s03 reader notes and authorized audit remediation, baseline 90f89e7"
status: not_ready
---
# e01s03 — strict self-audit

Date: 2026-10-09. Auditor: parent. No new independent review, commit, or push.

**Verdict: NOT READY.** The reader works and several prior failures are fixed. Remaining checklist failures are not waived.

## Review priority

Git's 90-day churn ranked changed hotspots first. The repository has no `scripts/bp-churn-rank.sh`.

| Path | Added / removed lines | Current responsibility |
| --- | --- | --- |
| `src/styles/app.css` | 1536 / 125 | Ordered style imports |
| `src/app.ts` | 1074 / 198 | Composition root |
| `src/viewer.ts` | 990 / 137 | Rendering and source surface |
| `src/highlights.ts` | 570 / 69 | Legacy annotation storage |
| `src-tauri/src/lib.rs` | 523 / 11 | Native registration and text reads |
| `src/styles/markdown.css` | 414 / 20 | Ordered prose/extension imports |

New modules have zero historical churn. Their large changes still require review.

## Supply chain and security

- FAIL ✗ A formal slopcheck script is unavailable. Dependency checks and source review do not prove that named gate ran.
- PASS ✓ No known SLOP package added. `@vitest/coverage-v8` matches official Vitest 4.1.11. Rust uses `flate2` 1.1.9 with `rust_backend`.
- PASS ✓ Secret-pattern inspection identified no credentials in the reviewed change scope.
- PASS ✓ OWASP review traced Markdown/SVG, parser provenance, native paths, file writes, storage, and explicit exports.
- PASS ✓ No confirmed unaddressed HIGH security finding remains from the source review. This is not a penetration test.
- PASS ✓ Full and production npm audits each report 0 critical/high/moderate entries and 2 low package entries.

[Security boundaries](../security/REVIEW.md) include codec limits and residual native-writer races.

## Provenance and metadata

- PASS ✓ New planning, audit, security, and benchmark artifacts include `type` and `context` metadata.
- PASS ✓ Decisions reference baseline `90f89e7` and owner requests m01322/m01385/m02059/m02124/m02366.

## Law of Demeter

- PASS ✓ History calls the immediate session contract: `versions()` and `readVersion(version)`.
- PASS ✓ Reader roles communicate through focused actions/services. DOM traversal stays within the owned surface.

## Repository rules

- PASS ✓ New documents are in `specs/`. Existing README and plan are updated in place.
- PASS ✓ No `gh issue create` call introduced.
- PASS ✓ No new `gh` command introduced.
- PASS ✓ No direct GitHub REST call introduced.
- FAIL ✗ Required local `CONVENTIONS.md`, `skills/enforce-first`, and `skills/request-review` are absent. Empty prerequisites are not a fix.

## Scope

- PASS ✓ Direct tasks/cells, same-file notes, versions, sharing, and lifecycle protection match owner requests.
- PASS ✓ No speculative notebook, board, cloud, AI, IDE, framework, or real-time collaboration.
- PASS ✓ Remediation stays within reader/versioning scope. Diagnostics use owned fixtures, not private books.
- PASS ✓ Reproduced failures received fixes and regression tests or real native evidence.
- PASS ✓ Gate failures were addressed rather than dismissed as pre-existing. BUG-002 records the native close permission fix.

## Boy Scout Rule

- PASS ✓ Opened controllers now own focused roles. Parser provenance, native media, and styles each use separate modules.
- PASS ✓ Retired default editor routes are removed. Legacy recovery remains intentional compatibility code.
- PASS ✓ No new commented-out implementation identified.

## Types and safety

- PASS ✓ TypeScript passes. No new `any` type introduced. Existing renderer `any[]` parameters now use `Token[]`.
- PASS ✓ No new `@ts-ignore` or lint suppression introduced.
- PASS ✓ No production double cast bypassing safety introduced.
- PASS ✓ Stored data, source provenance, version identities, and snapshot lengths have runtime guards.
- PASS ✓ Notes display plain text. Markdown/SVG remain sanitized. Code and agent content never execute automatically.

## Test coverage

- FAIL ✗ Every new function is not covered. V8 collection is now real, but collection alone does not close gaps.
- PASS ✓ Known bug fixes have regressions, including unchanged save states, stale reload errors, failed history restore, IME keyboard isolation, and obsolete image/layout completion.
- PASS ✓ Tests call public interfaces. No private-method access is required for the new role tests.
- PASS ✓ Unit tests isolate storage/clocks. Browser/native diagnostics use owned fixtures and acknowledged persistence.
- PASS ✓ The one alignment skip requires unavailable private `MARK_DOC_ALIGN` and `MARK_TIMING_ALIGN` fixtures.

Current suite: **307 passed, 1 skipped** across 39 passing files. Native: **26 passed**.

Run `npm run test:coverage` to regenerate `coverage/coverage-summary.json` and `coverage/coverage-final.json`. [Current functional gates](e01s04-gates.json) record command results and collected coverage.

| Entire frontend | Measured coverage |
| --- | --- |
| Statements | 69.1% |
| Branches | 62.11% |
| Functions | 64.52% |
| Lines | 72.99% |

ReaderNavigation and ReaderShortcuts now each have 100% function and line coverage. Their public-event tests reproduce obsolete layout completion and IME routing failures before the fixes. This is not complete application coverage.

Representative function coverage: DocumentSession 100%, ReaderAppearance 80%, ReaderFiles 61.11%, Viewer 67.56%, ReaderAnnotations 79.26%.

App, BrowserDocumentStore, DocumentDatabase, and the document-store selector still have zero V8 unit coverage. Real Chrome covers several public flows but does not appear in this collector. [Browser gates](e01s04-browser-gates.json) record all four successful scripts. [Storage evidence](e01s03-browser-storage.json) records 15 actual IndexedDB safety checks.

## SOLID and Chapter 17

- PASS ✓ App composes ReaderChrome, ReaderHost, ReaderAppearance, ReaderFiles, ReaderNavigation, and ReaderShortcuts.
- PASS ✓ Viewer delegates selection, legacy hover/drafts/recovery, and same-file notes to focused owners.
- PASS ✓ Existing behavior extends through the new action/service contracts rather than additional giant-controller branches.
- FAIL ✗ Dependency Inversion remains partial. Several roles still import global settings, storage, or platform services.
- FAIL ✗ F1/G30/G34 remain in long factories and mixed-abstraction functions. Smaller files do not prove these rules pass.
- PASS ✓ Cell actions use a location contract. Exact-source/provenance guards authorize mutations. Exports capture one immutable snapshot.

## Named Fowler smells

- FAIL ✗ Data Clumps: source identity/snapshot/action groups still repeat across reader/session/history.
- FAIL ✗ Primitive Obsession: document and version IDs remain plain strings at distinct boundaries.
- PASS ✓ The observed history Feature Envy was removed through its immediate contract.
- FAIL ✗ Mysterious Name: generic callback names remain in dense factories.
- PASS ✓ No new unjustified Middle Man or cross-module Message Chain identified.
- PASS ✓ Shared parser/table/source-replacement logic avoids competing mutation implementations.

## Code style

- FAIL ✗ Functions do not consistently meet the literal 4–20-line rule. Factories and terse accessors still fail it.
- FAIL ✗ Stepdown remains inconsistent in constructors and renderer installation.
- PASS ✓ Production TypeScript, Rust, and CSS modules contain fewer than 300 lines. App: 167, Viewer: 214, native lib: 178, renderer: 282.
- FAIL ✗ Generic names such as `open`, `render`, and `save` exceed the requested grep threshold.
- PASS ✓ Source mutation, table serialization, parser provenance, snapshot codecs, and history contracts are reused.
- FAIL ✗ Dense handlers still combine actions or exceed two conditional levels.
- FAIL ✗ Negative guards remain. Their usefulness does not satisfy the literal checklist.
- PASS ✓ New comments explain safety, ownership, and cascade-order reasons.

## Correctness and performance

- PASS ✓ Acknowledgement follows actual persistence. Pending edits are serialized and retained after failure.
- PASS ✓ Unchanged Markdown never writes or adds a version. An unchanged callback now emits no status and cannot hide an existing error.
- PASS ✓ Undo before the save tick performs no write. The five-second clock remains a check, not an unconditional write.
- PASS ✓ Stale reloads cannot remove a newer file. History retry and late-result isolation have regressions. A layout generation and file reference now prevent delayed image/artifact work from restoring an obsolete document position, including uploads with empty path keys.
- PASS ✓ Same-cell editing and subtle notes preserve reading flow. Chrome note creation/hover measured exactly 0px movement.
- FAIL ✗ Native external-writer safety remains best-effort. Another process can write between the final comparison and replacement.
- PASS ✓ Word metadata avoids full-source recounts on pending input.
- PASS ✓ Generated 1/5/16-MiB books meet measured real-reader input/open budgets. The 16-MiB input-handler p95 is 10.8ms. Open is 3071.8ms.
- PASS ✓ Actual Chrome history with 257 versions opens at 21ms p95 across 25 samples. Metadata listing is 3.3ms p95. Acknowledged saves are 11ms p95. Oldest and latest sources read back exactly. [Evidence and limits](e01s03-long-history.json) describe the owned, same-day synthetic corpus.
- FAIL ✗ Packaged native startup, native long-history latency, and a full thirty-day continuous-edit corpus are not proven.
- PASS ✓ Browser/native snapshots now use bounded gzip with raw fallback. Legacy raw snapshots remain readable. Metadata access avoids full history payloads.
- FAIL ✗ Compression is not a total storage budget. No unapproved cap or downsampling deletes required 30-day/latest history.
- PASS ✓ Actual IndexedDB checks cover transaction rollback, missing/corrupt metadata, invalid UTF-8 snapshots, unsupported working records, metadata-only access, schema upgrade, and stale tabs. A corrupt legacy migration aborts at schema version 1 without rewriting source or snapshot data.
- PASS ✓ Native gzip checks cover round trips, logical-size bounds, malformed/trailing data, retention, and Unicode.
- PASS ✓ Expiration preserves the newest version, the exact 30-day boundary, source files, and unknown files.

[Real-reader latency](e01s03-reader-latency.json) measures synchronous input handling, not raster/display latency. Development readiness is not packaged startup.

## Rationalizations rejected

- Rejected: small files prove clean design. Ownership improved, but function-level rules still fail.
- Rejected: a collector or two fully covered roles prove complete coverage. Several modules still show zero unit coverage.
- Rejected: compression bounds history. It reduces payload size, not total storage.
- Rejected: metadata speed proves reader speed. A separate real-reader benchmark measures input and open latency.
- Rejected: two source checks mean a transaction. External process writes remain a residual risk.
- Rejected: the timer can clear an error. Unchanged callbacks now leave failed-save status intact.

No checklist section is silently skipped. Missing tools and unproved guarantees remain failures.

## Handoff

Open: dependency/style/identity cleanup, public-flow coverage, real project tooling, history budget/concurrency decisions, and native acceptance.

Next: [active remediation tasks](../epics/e01-live-demo/e01s04-audit-remediation.md). The [ordered audit plan](../epics/e01-live-demo/e01s02-audit-remediation.md) remains incomplete. Independent review, commit, and conditional push remain blocked by the hard gate.
