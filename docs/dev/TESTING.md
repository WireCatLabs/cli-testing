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
2026-10-04 by the code this package was copied from; reset it once the first suite lands. Every file at
least 50 % of its lines. Raise it when coverage rises; never lower it to let a change through.

## Live checks

This package's own tests never contact a messenger or start a real CLI. The `live` and agent suites
it ships do, but only when the owner runs them, on the test profiles named in a private cast that
git ignores; they record shapes, never ids or text.
