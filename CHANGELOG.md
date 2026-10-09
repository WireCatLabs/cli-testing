# Changelog

Notable changes to `@wirecat/cli-testing`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

Every entry says what changed as a caller sees it, why, and what to watch for — the rules are
[`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md#the-changelog).

## Unreleased

### Added

- **The suite groups** — `SUITE_GROUPS`: security, contract, performance, ux, analyzers, live, seed.
  No suite runs yet.
- **The security audit, written down to repeat** — `docs/security/` (method, runbook, agent test,
  reviewer prompts, lessons) and the scripts it uses: `scripts/security/scan`,
  `scripts/security/socket`, `scripts/agent/run-agent`, `scripts/agent/run-payload`.
