# Testing

```sh
pnpm lint            # biome, with the import boundary
pnpm typecheck       # the package, then the tests, then scripts/
pnpm test            # vitest
pnpm test:coverage   # the same, with the floor below; CI runs this one
pnpm docs:check      # links, anchors, the changelog's shape, spelling and Markdown form
pnpm smoke:bun       # the real exports, executed under Bun
pnpm test:slow       # the slowest tests and files
```

CI runs all but the last, plus a secret scan over the whole history, through cli-core's reusable
[`node-ci.yml`](https://github.com/leemour/cli-core/blob/main/.github/workflows/node-ci.yml).

## Checked once

On 2026-10-04: a file under `src/` importing `node:sqlite`, `bun:sqlite`, `node:fs`, cli-messaging,
Drizzle and mtcute failed `pnpm lint` on each line; a type error in a test and in `scripts/` failed
`pnpm typecheck`.

## No sandbox

The package touches no file, keyring or network, and the lint rule keeps it that way, so there is no
`setupFiles` sandbox. Add one with the first thing that touches the machine.

## Coverage has a floor

[`vitest.config.ts`](../../vitest.config.ts) holds it, just under what the suite reached on
2026-10-04 (100 % lines, 98.4 % statements, 96.7 % functions, 95.6 % branches), and every file at
least 50 % of its lines. Raise it when coverage rises; never lower it to let a change through.

## Live checks

The suites never contact a messenger. [`bin/live-tasks`](../../bin/live-tasks) `tg|max`, run by the owner
from a terminal, checks the task rules on a real test chat: the second account asks, the owner's `review`
opens a task, the owner's reply closes it, and both messages are deleted by their own senders. The chats and
profiles are in `.live/cast.env`, which git ignores; the script prints no id and no text.
