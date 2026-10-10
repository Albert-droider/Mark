---
type: remediation_plan
context: "Owner m02366 approves remaining audit work. Baseline 90f89e7."
status: implementing
---
# e01s04 — Close reader audit gaps

Keep the direct reader, zero-flow note marks, five-second save clock, thirty-day history, and latest-version retention. No workspace, board, cloud, or editor-first redesign.

## Ordered work

1. Compress new snapshots. Read existing uncompressed snapshots without rewriting them. Bound decompression and reject corrupt payloads. Keep native source encoding and bytes unchanged.
2. When listing or expiring browser versions, read metadata instead of full snapshot bodies. Use acknowledged transactions and a metadata index.
3. Implement the owner-approved 1 GiB budget for each document. Make the limit configurable and warn at 80 percent use. Account for the working source, stored snapshot payloads, and document metadata. Database and filesystem allocation overhead is outside this byte accounting. Refuse a save above the limit before writing or pruning. Preserve existing source, history, and the pending edit. Keep Markdown export available. Never shorten retention to satisfy the budget.
4. Use the owner-approved single-writer contract. Compare source bytes before replacement and reject detected external changes. Preserve pending edits for export. The final comparison and rename are not atomic against another editor. Do not promise transactional collaboration or protection from every external-writer race.
5. Extract shell, source rendering, selection notes, and lifecycle responsibilities. Preserve public-flow tests at each extraction. Remove duplicate identity and action contracts.
6. Add coverage collection and tests for uncovered public failure paths. Dependency `[OK]`: `@vitest/coverage-v8@4.1.11` matches installed Vitest. The official Vitest project supplies this MIT, dev-only package. No slopcheck executable exists here. Record registry provenance and dependency-audit checks, not a claimed script pass. Record actual coverage rather than infer it from the test count.
7. Add real project conventions and runnable quality checks. Keep user-requested style failures visible until addressed.
8. Measure reader typing, startup, and long-history latency. Test large-source and long-history fixtures. Distinguish component results from end-to-end results.
9. Repeat frontend, Rust, Chrome, native restart, export, audio, and release-build checks. Update the strict audit. Do not request independent review, commit, or push while the hard gate fails.

## Decisions

- Original Markdown writes were approved in m01322/m01385. Same-file subtle notes were approved in m02059/m02124.
- Owner approval m00282 accepts the recommendation in m00281: configurable 1 GiB per document, an early warning, refusal without deletion at capacity, and one active writer with best-effort conflict detection. Compression does not change retention.
- Implementation order: browser transaction budget check, native pre-write budget check, settings and warning display, then complete functional and browser regression gates. Use small limits in isolated tests; never fill the user's storage.
- Rust compression uses already-resolved `flate2` 1.1.9 with the Rust backend. Supply-chain review and lockfile verification remain required.
- Browser compression uses the platform Compression Streams API, not a runtime package.
- RED/GREEN runs stay local while the owner forbids commits before the audit passes. Generic skill commit/stash recipes do not override that gate.

## Verification

Test compression round trips and legacy reads. Test corrupt and oversized payloads with all source encodings. Test exact retention boundaries, idle deduplication, and save failures. Each change must preserve existing reader and note geometry checks.

Functional gates: `npm test`, `npm run build`, Rust formatting/tests, and the existing three Chrome smoke scripts. Final audit status must name every unresolved item.
