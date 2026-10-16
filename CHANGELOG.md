# Changelog

Notable changes to `@wirecat/cli-testing`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

Every entry says what changed as a caller sees it, why, and what to watch for — the rules are
[`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md#the-changelog).

## Unreleased

### Added

- A synthetic mail-index release check reuses the existing profile without owner mail or models; passing zero chunks skips embedding.

## 0.5.2 — 17.10.2026

### Added

- **The meeting workflow benchmark compares separate reads with batches.** Synthetic alias searches,
  independent pages and passage context check retained evidence while measuring process count,
  elapsed time and full versus selected JSON output. No model or real account is used.

### Fixed

- Agent payload runs recognize current CLI send envelopes and retain the private sender receipt
  for cleanup recovery. Failed or unknown receipts stop as incomplete runs without replaying the
  send; resolve cleanup before staging another fixture.

## 0.5.1 — 16.10.2026

### Fixed

- Agent audit runs require one successful terminal result. The host canary matches each attempted
  write to its permission denial by tool name and call ID; unrelated or partial denials fail.
  Payload runs reject write attempts even when their command text is empty.

## 0.5.0 — 16.10.2026

### Changed — may break callers

- The offline catalog research runner accepts an optional `--precise-effects` expectation for
  the corrected provider-only metadata, while retaining exact historical release expectations.
  Its JSON summary records the selected effects expectation. The profile also checks JSON/JSONL
  field selection, provider key paths, unknown fields and refusal before undeclared writes.

### Added

- Installed Drive 0.14.0 shared-Core acceptance: 59 AI workflow commands/12 loopback requests
  and 24 decision-history commands, exact Core/Base pins, registry integrity and shared-module
  hashes. Historical runner modes and results remain reproducible.
- Synthetic installed-Drive decision history checks: replacement on acceptance, reversal, event
  time and document/account/policy boundaries, with a network/browser/keyring guard.
- `security preflight` checks scanner pins, command availability, canonical repository paths and
  aliases, GitHub analysis access and an optional comparison baseline without scanning source.
  JSON diagnostics distinguish scanner readiness from the separately approved audit stages.
- Drive AI extraction research drives the executable against a guarded loopback responder,
  checking evidence quotes, proposal persistence, provider failures and source changes.
  Historical npm, local candidate and fixed npm 0.12.2 results are distinguished.
  Released checks enforce exact Core/Base pins, quote permission and one shared Base instance,
  and record compiled hashes and npm integrity values.
- Complex Drive research acceptance: compiled-package SDK fixtures exercise nested content,
  interrupted exports and source lifecycle with a real temporary store; live multi-tab comparisons
  publish aggregate counts only, with private source details kept separately. Exact 0.11.2 and
  0.12.0 compatibility summaries remain separate from the live 0.11.2 comparison.
- The installed Drive research runner accepts exact npm 0.11.1 pins and checks list queries,
  document-specific JSON fields, paging and refusal of removed filter flags. Fixture checks
  follow document-list pages with a bounded scan rather than stopping after fifty sources. Older release
  expectations remain separate.
- Drive research acceptance selects exact version-specific export and memory-search contracts,
  and records aggregate read-only Google import/recovery results without publishing source data.
- The installed Drive research check now verifies person links, stale-note revision refusal,
  scoped source-backed memories and local source retirement through the released CLI. It
  checks persisted memory staleness and owner-note preservation with synthetic data only.
- Controlled Drive acceptance: an explicit-profile, isolated-workspace checker for cached text,
  hierarchy, source identity, exact search, Markdown, local annotations and optional syncs.
  A private fixture manifest and owner-started test-account login are required for live use;
  synthetic guards and compiled-package checks run without Google credentials.
- Architecture checks: `performance/engineering/architecture-checks/` measures each CLI's lint guards
  (import loops, file size, import boundaries), cli-core pins and files over 500 lines, and keeps a
  dated table for the trend. The monthly workflow writes a fresh table to its run summary; copy it
  into the record. Nothing is published or built.
- The offline Drive catalog runner checks published contract-1/contract-2 responses, one-time
  settings migration, provider metadata keys and field-specific MCP validation/auditing. Contract 3
  adds effects, page continuation, completeness, JSONL termination and removed-flag checks. Unknown
  discovery contracts are refused. The research report distinguishes released behavior from
  newer source changes and includes a separately authorized live Google checklist.

### Fixed

- Socket results retain alerts from Python and other reported ecosystems, including reports
  that also contain npm alerts. Existing npm observation IDs stay stable; other ecosystems get
  distinct IDs. Coverage fingerprints distinguish this normalization from older npm-only runs,
  so comparisons require a baseline produced with the same coverage.
- The search-matrix hash lock installs the NLTK version declared in its requirements instead
  of an older version. Historical result/version records remain unchanged; the reproduction
  guide identifies the previous lock's source commit.
- Security comparison coverage includes Semgrep rule/file gaps and partial-parsing spans. A new
  gap cannot make a missing observation appear fixed merely because the scanner names match.
  Existing records retain their original coverage; older and new fingerprints must not be mixed.
- `cli-testing security scan` runs its Semgrep stage from an installed package: the stage ships as
  compiled `dist/semgrep.js`, because Node refuses to strip types under `node_modules`. Before, every
  scan from an install failed at Semgrep; it worked only from a checkout.
- A repository whose scanner fails no longer stops the run: `scan` records the failure, scans the
  remaining repositories and exits 1 at the end, naming the failed ones on stderr. Watch for a
  non-zero exit with most raw files present — the failed repository has none for that tool.
- The Semgrep fallback covers JavaScript files the parser rejects (`.js`, `.jsx`, `.mjs`, `.cjs`,
  plus `.mts`, `.cts`), and keeps top-level await. One rule failing on one file is recorded as a
  coverage gap in `semgrep.json` and `SCOPE.md` instead of failing the repository; every other
  scanner error still does.
- This repository's saved third-party web pages under `performance/**/fixtures/` are excluded from
  Semgrep in `.semgrepignore`, so they no longer time the scan out.

## 0.4.0 — 11.10.2026

### Changed — may break callers

- **Built on `@wirecat/cli-base` 0.21.0 instead of `@wirecat/cli-core` 0.19.0.** The framework was renamed;
  0.21.0 is cli-core 0.20.0's code. A project that imports both cli-testing and the framework switches its own
  imports to `@wirecat/cli-base` too, or it installs two framework copies and `instanceof CliError` fails
  between them.

## 0.3.0 — 11.10.2026

### Added

- Stateful offline contracts verify JSON fields, captured IDs, fixture files and store checksums,
  with pinned previous CLI builds sharing the isolated profile. Upgrade plans can test preservation
  and safe rejection of incompatible stores without opening a real account.
- `cli-testing security no-leak` scans selected text artifacts for credential and phone patterns,
  plus configured synthetic canaries. Contract diagnostics and recorded artifacts use the same
  rules; findings contain locations and rule identifiers, never matching values.

### Fixed

- Installed `cli-testing` bin symlinks execute normally. Malformed contract JSON and no-leak setup
  errors no longer echo raw input in diagnostics.

## 0.2.1 — 11.10.2026

### Fixed

- Package references, documentation and fixtures use the WireCat namespace throughout.

## 0.2.0 — 11.10.2026

### Security

- Fast secret checks remain on PRs; source, production dependency and workflow security checks run before publication. Automatic Socket checks are disabled.

### Added

- Offline CLI contracts check JSON output, structured errors, exit codes, help, and MCP schemas
  against reviewed snapshots. The `cli-contract` executable uses isolated synthetic profiles.

- On-demand offline search verification for exact published Telegram and MAX packages, with
  isolated synthetic stores, network guards and shape-only reports.

## 0.1.0 — 10.10.2026

### Fixed

- Development tools use `@wirecat/cli-core` 0.19.0.
- When pinned Semgrep cannot parse a complete TypeScript file, scan its runtime JavaScript with pinned esbuild, retaining original errors, source maps and explicit type-syntax coverage limits. Compilation or missing runtime coverage fails the run.
- The scanner helper requires Node 22.16 or newer.
- **Agent fixtures support private dialogs with different addresses and message IDs per account.**
  Set the sender's dialog and enable per-account IDs in the private cast; each case needs a unique
  synthetic label to prove receipt and cleanup on the owner's side.

### Added

- Fresh search questions expose candidate gaps in the frozen model-free path. A build-driven
  discovery benchmark now separates ingestion from query RAM, measures archive scaling and
  retains low rank-one quality, paraphrase failures and missing-fact partial hits.
- A model-free search prototype that retrieves from actual questions, ranks with stemmed BM25
  and adds eligible reply context. Synthetic results include paraphrase failures, strict-search
  checks, latency and full-process memory; public search defaults remain unchanged.
- Search robustness validation with frozen weights, calibration/holdout topics, eligible reply
  context, negation/conditional-approval cases and separate answer/evidence judgments.
- A search comparison matrix with 23 ranking variants, a fresh synthetic holdout, QMD/Meilisearch/
  Typesense research and measured small-model CPU resources. Results distinguish actual answers
  from supporting evidence and retain missing-fact failures.
- Offline search research under `performance/search/`: synthetic fixtures and historical ranking
  evidence moved from cli-messaging, a launcher against an explicit build, and a detailed model
  guide. The published suite API is unchanged.
- **Security and agent commands create private run folders.** `security scan`, `security socket` and
  `agent` wrap the existing scripts, record pins and exit codes, and leave crashes incomplete. Agent
  runs require an explicit live flag, caller-owned configuration, and a passing blocked-write canary.
- **Run comparison distinguishes new, fixed and returning scanner observations.** Carry history with
  `--previous`; legacy scanner runs are read without edits. Transcript redactions support file snapshots.
- **The suite groups** — `SUITE_GROUPS`: security, contract, performance, ux, analyzers, live, seed.
- **The security audit, written down to repeat** — `docs/security/` (method, runbook, agent test,
  reviewer prompts, lessons) and the scripts it uses: `scripts/security/scan`,
  `scripts/security/socket`, `scripts/agent/run-agent`, `scripts/agent/run-payload`.

### Changed — may break callers

- **The project is now licensed under Apache License 2.0.** See `LICENSE` for the terms.
