# Changelog

Notable changes to `@wirecat/cli-testing`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

Every entry says what changed as a caller sees it, why, and what to watch for — the rules are
[`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md#the-changelog).

## Unreleased

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
