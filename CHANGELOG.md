# Changelog

Notable changes to `@leemour/cli-tasks`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

Every entry says what changed as a caller sees it, why, and what to watch for — the rules are
[`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md#the-changelog).

## 0.1.0 — 05.10.2026

### Added

- **The task model and its rules.** A task points at its source by a locator and holds no text of
  it; it is `open`, then `done` or `dismissed`, and a closed task never opens again.
- **`createTaskService`** adds, closes, lists and counts tasks over a `TaskStore` the host
  implements. A rule that sees a source again gets the task already there, whatever its state, so
  a dismissed task stays dismissed; a person or an agent may add a task of another kind to the same
  source.
- **`@leemour/cli-tasks/testing`** has `memoryTaskStore`, an in-memory `TaskStore` for tests.
