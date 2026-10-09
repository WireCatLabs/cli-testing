# Changelog

Notable changes to `@wirecat/cli-testing`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

Every entry says what changed as a caller sees it, why, and what to watch for — the rules are
[`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md#the-changelog).

## Unreleased

### Added

- **Security and agent commands create private run folders.** `security scan`, `security socket` and
  `agent` wrap the existing scripts, record pins and exit codes, and leave crashes incomplete. Agent
  runs require an explicit live flag, caller-owned configuration, and a passing blocked-write canary.

- **Run comparison distinguishes new, fixed and returning scanner observations.** Carry history with
  `--previous`; legacy scanner runs are read without edits. Transcript redactions support file snapshots.

- **The suite groups** — `SUITE_GROUPS`: security, contract, performance, ux, analyzers, live, seed.

- **The security audit, written down to repeat** — `docs/security/` (method, runbook, agent test,
  reviewer prompts, lessons) and the scripts it uses: `scripts/security/scan`,
  `scripts/security/socket`, `scripts/agent/run-agent`, `scripts/agent/run-payload`.
