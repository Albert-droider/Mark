---
type: code_audit
context: "e01s02 direct reader editing and versioned source writes, baseline 90f89e7"
status: not_ready
---
# e01s02 — strict self-audit

Date: 2026-10-08. Auditor: parent. No independent reviewer or commit followed this audit.

**Verdict: NOT READY.** Functional tests pass. The complete owner checklist does not.

## Review order

The repository has no `scripts/bp-churn-rank.sh`. Git history provided the fallback rank.

| Hotspot | Recent commits | Review priority |
| --- | --- | --- |
| `src/styles/app.css` | 12 | First |
| `src/app.ts` | 11 | First |
| `src-tauri/src/lib.rs` | 7 | First |
| `src/viewer.ts` | 6 | First |

New files have zero baseline churn. Their large changes still received source, boundary, and test review.

## Supply chain and security

- PASS ✓ Slopcheck: no new dependencies. Package files and both lockfiles are unchanged.
- PASS ✓ No SLOP package introduced. No approval exception is required.
- PASS ✓ Secret-pattern scan found no credentials in the inspected source, native code, scripts, or specs.
- PASS ✓ OWASP review traced HTML/SVG, parser authority, native paths, storage, source writes, and explicit exports.
- PASS ✓ Stylesheet/form hazards received fixes. This source review identified no remaining confirmed HIGH security finding.
- PASS ✓ Production and complete dependency audits report zero high, critical, or moderate entries. Two low package entries remain.

[Security details](../security/REVIEW.md) define the residual boundaries. This is not a penetration test.

## Provenance and metadata

- PASS ✓ New story, tasks, review, and benchmark artifacts include `type:` and `context:`.
- PASS ✓ Decisions reference baseline `90f89e7` and owner requests m01322/m01385. The source-write decision is explicit, not an inferred workspace migration.

## Law of Demeter

- PASS ✓ History no longer reaches through `session.store`. A focused contract exposes `versions()` and `readVersion(version)`.
- PASS ✓ New controllers communicate through immediate action interfaces. DOM traversal stays inside the owned surface.

## CONVENTIONS and repository rules

- PASS ✓ New audit, security, and story documents are in `specs/`. Existing README and plan text are updated in place.
- PASS ✓ No `gh issue create` call.
- PASS ✓ No new `gh` operation. No issue-management command is introduced.
- PASS ✓ No direct GitHub REST call.
- FAIL ✗ The prerequisite command cannot pass. There is no local `CONVENTIONS.md`, `skills/enforce-first`, or `skills/request-review`.
  Establish project tooling deliberately. Empty directories do not satisfy this requirement.

## Scope

- PASS ✓ Direct tasks, cells, source editing, sharing, versions, and lifecycle protection match the owner requests.
- PASS ✓ No speculative notebook, board, cloud, AI, framework, IDE, or collaboration implementation.
- PASS ✓ Changed source and tests stay within reader/versioning scope. Temporary native fixtures use an isolated app identifier.
- PASS ✓ Reproduced gate failures received fixes and regressions. The native close-permission defect is recorded as BUG-002.
- PASS ✓ Files opened for those defects received targeted cleanup. Historical failures were not called passes.

## Boy Scout Rule

- FAIL ✗ Every touched file is not demonstrably cleaner in structure. Large controllers still mix responsibilities.
  Focused bug cleanup does not waive the Boy Scout requirement.
- PASS ✓ Obsolete default live-copy actions and their smoke route were removed. No new dead implementation is identified.
- PASS ✓ No new commented-out implementation.

## Types and safety

- PASS ✓ TypeScript passes. No new `any` type or untyped public Python/Go function.
- PASS ✓ No new ignored type error or lint suppression.
- PASS ✓ No new production double cast that bypasses safety.
- PASS ✓ Parsed storage and snapshot identities have runtime guards. Native IDs are registered and validated.
- PASS ✓ Source HTML is sanitized. Code blocks never execute code or commands.

## Test coverage

- FAIL ✗ Complete per-function coverage is not established. Public-flow tests do not prove that every new function executes.
  Add a coverage map or collector. Close uncovered failure paths before marking this item PASS.
- PASS ✓ Fixed defects have regressions or actual failing/passing native evidence.
- PASS ✓ Tests exercise public editor/session/store interfaces, not private method access.
- PASS ✓ Unit tests isolate state and clocks. Diagnostics use owned fixtures and actual persistence.
- PASS ✓ The alignment skip is explained. Private `MARK_DOC_ALIGN` and `MARK_TIMING_ALIGN` fixtures are absent.

## SOLID and Chapter 17

- FAIL ✗ Single Responsibility remains incomplete. `src/app.ts` combines shell construction, file lifecycle, window events, navigation, and presentation.
  Extract focused shell and lifecycle collaborators with behavior-preserving tests.
- FAIL ✗ `src/viewer.ts` combines rendering, source editing, notes, drafts, recovery, and links.
  Split ownership without changing the public reader contract.
- FAIL ✗ Open/Closed remains partial. Extension still modifies large stable controllers.
- FAIL ✗ Dependency Inversion remains partial. Several UI services import global storage/platform state.
  Finish dependency contracts rather than adding flags to large classes.
- FAIL ✗ F1/G30/G34 remain in long functions and mixed abstraction levels.
  Cell keyboard actions now use a location contract. No production cell handler has four parameters.
- PASS ✓ Source mutation checks parser provenance and exact expected lines. Async context export captures one immutable snapshot.

## Named Fowler smells

- FAIL ✗ Data Clumps: source identity/snapshot/action groups repeat across reader/session/history.
- FAIL ✗ Primitive Obsession: document and version IDs remain plain strings across distinct boundaries.
- PASS ✓ The observed history Feature Envy was removed with the focused history contract.
- FAIL ✗ Mysterious Name: generic callback variables remain in dense factories.
- PASS ✓ No new unjustified Middle Man or cross-module Message Chain is identified.
- PASS ✓ Shared parser, table serialization, and source replacement avoid competing mutation implementations.

## Code style

- FAIL ✗ Functions do not consistently satisfy 4–20 lines. Factories, layout, and source helpers need focused decomposition.
- FAIL ✗ Stepdown is inconsistent in large constructors and renderer installation.
- FAIL ✗ File size remains too large. `src/app.ts` has 906 lines, `src/viewer.ts` 744, and `src-tauri/src/lib.rs` 317.
  `src/renderer/markdown.ts` has 300 lines. Existing CSS also exceeds 300.
- FAIL ✗ Generic names such as `open`, `render`, and `save` exceed the requested grep threshold.
  Apply domain names consistently. Renamed wrappers do not resolve unclear ownership.
- PASS ✓ Source mutation and serialization are reused. The shared history contract removes the observed reach-through duplication.
- FAIL ✗ Some dense handlers exceed two conditional levels or combine actions on one line.
- FAIL ✗ Negative conditionals remain. Useful guards still fail the literal checklist.
- PASS ✓ New comments explain boundaries and safety reasons, not change history.

## Correctness and performance

- PASS ✓ Browser/native source flows pass. Save acknowledgement follows persistence, not just an input event.
- PASS ✓ History restore failures remain visible and retryable. A late restore result cannot close a newer dialog.
- PASS ✓ Cell cancellation retains the edit after a failed mutation. Keyboard regressions cover F2, Enter, Escape, stale source, and disposal.
- FAIL ✗ A no-overwrite guarantee for simultaneous external writers is not established.
  Native save checks the source twice. Another process can write between the final check and replacement.
  Define the concurrency contract or provide supported locking before claiming transactional collaboration.
- PASS ✓ Word statistics no longer recount a large source on every pending input. Tests verify recount timing and current metadata.
- PASS ✓ The synthetic metadata benchmark passes a 16 ms input budget at 1, 5, and 16 MiB.
  At 16 MiB, measured p95 changed from 137.53 ms to 0.0021 ms for this component only.
- FAIL ✗ Full-reader typing, startup, and long-history latency still have no measured budget.
  Metadata-only results do not prove end-to-end latency. Version access still scans full history.
- FAIL ✗ Full-file snapshots have no total storage budget or compression.
  A 1 MB document changed every five seconds for eight hours daily creates 172,800 snapshots over 30 days.
  That is approximately 173 GB before overhead. Idle deduplication does not bound this worst case.
- PASS ✓ The 140,000-version retention regression avoids spread-argument overflow.
- PASS ✓ Cleanup preserves the latest version, exact 30-day boundary, source files, and unknown files.

Benchmark: [measured metadata results](e01s02-reading-performance.json). This is not a claim that the whole reader is faster by the same factor.

## Rationalizations rejected

- Rejected: “The large classes existed already, so size does not count.” Their size still fails the checklist.
- Rejected: “DOMPurify means all HTML is safe.” Stylesheets and forms reproduced separate hazards.
- Rejected: “Browser proof means native close works.” Native UAT exposed a missing destroy permission.
- Rejected: “Green tests prove complete coverage.” They do not establish coverage.
- Rejected: “Cached metadata proves reader latency.” The benchmark covers one component only.

No section was silently skipped. Unavailable tooling and unproved guarantees are failures or explicit limits, not invented passes.

## Gate and handoff

FAIL: Design, style, coverage, tooling, concurrency guarantee, and end-to-end performance/storage evidence.

Next: [bounded audit remediation](../epics/e01-live-demo/e01s02-audit-remediation.md). No independent review or commit until the applicable hard gate passes.

Functional evidence: [e01s02 verification](e01s02-in-place-reader.md).
