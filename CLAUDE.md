# cli-tasks — working rules

Open tasks waiting on the owner — an unanswered question, a request, a mention, a promise — published
as `@leemour/cli-tasks`. `cli-messaging` feeds it from messages and mounts its commands into tg-cli
and max-cli. Start with the one page that covers what you are about to touch:

- [`docs/dev/ARCHITECTURE.md`](docs/dev/ARCHITECTURE.md) — the modules, the storage seam, who consumes it.
- [`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md) — the shared conventions, and what differs here.
- [`docs/dev/TESTING.md`](docs/dev/TESTING.md) — the checks and the coverage floor.
- [`docs/dev/agents.md`](docs/dev/agents.md) — what an agent may change here, and what stops it.

## The constraints that shape everything

1. **Nothing here knows a messenger or a database.** A task points at its source by a locator string;
   the host stores tasks behind `TaskStore` and resolves a locator to a message. `biome.json` refuses
   SQLite, `node:fs`, Drizzle, cli-messaging and messenger libraries under `src/`.
2. **A task never holds message text.** Only the locator. A deleted message leaves nothing here.
3. **`cli-messaging` depends on this package, never the other way round.**
4. **A closed task never opens again.** A rule seeing the same source returns the task it already made;
   only a person or an agent adds a second task to a source, and only of another kind.
5. **A change reaches tg-cli and max-cli only through a release** of this package, then of
   cli-messaging, which both CLIs pin exactly.

## Comments

Sparse, and only *why*. No comment restating the line, no banners, no narrating the change.

## Deletions

Never delete or clean up mid-task. Append a line to [`CLEANUP.md`](CLEANUP.md) — the path, why, the
date — and do the removals in one batch after the owner confirms. Never kill a process by name —
find the PID, confirm it is yours, kill that PID.

## Committing

Conventional commits. Before committing:

```sh
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm docs:check
```

A branch off `main`, in a worktree, and a pull request. A change a caller can see gets a line under
`## Unreleased` in [`CHANGELOG.md`](CHANGELOG.md). `bin/release` on `main` publishes —
[README](README.md#releasing).
