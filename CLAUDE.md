# cli-testing — working rules

Test suites for the WireCat CLIs, published as `@wirecat/cli-testing` and used by max-cli and tg-cli
as a development dependency. Start with the one page that covers what you are about to touch:

- [`docs/dev/ARCHITECTURE.md`](docs/dev/ARCHITECTURE.md) — the suite groups and how a CLI plugs in.
- [`docs/dev/BACKLOG.md`](docs/dev/BACKLOG.md) — what comes next, in order.
- [`docs/security/`](docs/security/METHOD.md) — how a security audit is run and repeated; its
  scripts are in `scripts/security/` and `scripts/agent/`.
- [`docs/dev/CONVENTIONS.md`](docs/dev/CONVENTIONS.md) — the shared conventions, and what differs here.
- [`docs/dev/TESTING.md`](docs/dev/TESTING.md) — the checks and the coverage floor.
- [`docs/dev/agents.md`](docs/dev/agents.md) — what an agent may change here, and what stops it.

## The constraints that shape everything

1. **A suite drives a CLI from the outside.** Its binary, its MCP server, its published package —
   never its source. What a CLI must supply (its MCP command, how the test account sends and
   deletes, which chats are test chats) is config in that CLI's repository. `biome.json` refuses
   messenger libraries and cli-messaging under `src/`.
2. **Nothing touches a real account on its own.** `live` and the agent suite run only when the owner
   starts them, on the test profiles and test chats of a private cast that is never committed.
3. **Public tools, private results.** Run results, the findings register and the cast live in the
   private `cli-private` repository. Nothing here names an unfixed vulnerability.
4. **Speed of development comes first.** No suite runs on a pull request or a commit: on a release,
   on demand or on a schedule only.
5. **No message, token or phone number in a fixture, an output file or a document.** Seed data is
   synthetic.
6. **Every external tool is pinned** — a version, and a checksum where it is a downloaded binary —
   and each run records the versions it used.

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
