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

Full validation runs all but the last, plus a secret scan over the whole history, through cli-core's
reusable [`node-ci.yml`](https://github.com/WireCatLabs/cli-core/blob/main/.github/workflows/node-ci.yml).
It runs before release, monthly, or manually. Ordinary PR/main CI runs lint, Markdown,
config integrity, secrets, and typechecking. See the [CI guide](../ci/README.md) for the
cross-project timing table and monthly runbook.

## Checked once

On 2026-10-04: a file under `src/` importing `node:sqlite`, `bun:sqlite`, `node:fs`, cli-messaging,
Drizzle and mtcute failed `pnpm lint` on each line; a type error in a test and in `scripts/` failed
`pnpm typecheck`.

## Isolated test files

`test/sandbox.ts` points `TMPDIR` at a temporary directory removed after each test file.
Run-folder tests use synthetic scanner records there. Process runners are injected for scans and
agent cases; tests never run those suites against accounts. The process boundary test starts only
Node with a synthetic stdout value, and checks a missing executable. Messenger-library imports
remain forbidden by Biome.

## Coverage has a floor

[`vitest.config.ts`](../../vitest.config.ts) holds it, just under what the suite reached on
2026-10-04 by the code this package was copied from; the first suite keeps these floors. Every file at
least 50 % of its lines. Raise it when coverage rises; never lower it to let a change through.

## Live checks

This package's own tests never contact a messenger or start a real CLI. The `live` and agent suites
it ships do, but only when the owner runs them, on the test profiles named in a private cast that
git ignores; they record shapes, never ids or text.
