# Do tg-cli, max-cli and whatsapp-cli pay cli-core's test-setup costs?

Measured 2026-10-18. Follows [cli-core-test-speed](../cli-core-test-speed/README.md).

## Why we ran it

[cli-core#1566](https://github.com/WireCatLabs/cli-core/pull/1566) cut cli-core's `validation / ci / check` from
6 min 54 s to about 4 min 30 s. It removed two costs paid in each test file: loading Drizzle from `node_modules`,
and migrating every new test store (about 400 statements). tg-cli, max-cli and whatsapp-cli use cli-core too.
Their pull-request checks take about 2 min 44 s, 3 min 4 s and 2 min 39 s.

The question: do the three consumers pay the same two costs, and does cli-core 0.343.0 (the first release with
#1566) remove them for free? The answer decided whether to open a pull request in each consumer. The bar was a
saving of at least 15 s on CI.

## Setup

- **CI.** GitHub's standard Linux runner (4 vCPU), cli-base's shared `node-ci.yml`. Step times from
  `gh api repos/WireCatLabs/<repo>/actions/runs/<run id>/jobs`.
- **Local machine.** AMD Ryzen AI 9 HX 470 (12 cores, 24 threads), Node 24.19.0, pnpm 11.20.0, vitest 5.0.3 with
  v8 coverage, `maxWorkers: 4`. Other agents' work was running; load average 5–14 during the runs.
- **Checkouts.** Fresh clones of `main`: tg-cli [`38bb5e8`](https://github.com/WireCatLabs/tg-cli/commit/38bb5e8)
  (cli-core 0.342.0, 72 test files), max-cli [`cefb41e`](https://github.com/WireCatLabs/max-cli/commit/cefb41e)
  (0.342.0, 131 files), whatsapp-cli [`16caa02`](https://github.com/WireCatLabs/whatsapp-cli/commit/16caa02)
  (0.341.0, 29 files).
- **Commands.**
  - Whole suite: `/usr/bin/time -f "WALL %e USER %U SYS %S" pnpm exec vitest run`, and with `--coverage`.
  - Import time per module, summed over all files: the earlier page's
    [`import-reporter.mjs`](../cli-core-test-speed/import-reporter.mjs),
    `pnpm exec vitest run --experimental.importDurations.limit=100000 --reporter=<path>/import-reporter.mjs`.
  - Stores opened: [`probe-stores.sh`](probe-stores.sh) `<consumer checkout> <output file>`. It swaps cli-core's
    `dist/store/sqlite/open-store.js` in that checkout for a copy that logs each writable open, runs the suite
    once, and puts the original back.
  - Modules one import loads: [`count-modules.mjs`](count-modules.mjs), and a cold
    `node -e "await import('@wirecat/cli-core/cli')"` timed three times.
  - What 0.343.0 ships: `npm pack @wirecat/cli-core@0.343.0`, then a search of the package for the new setup file.

## Results

### CI, `validation / ci / check`

| repository (run) | job | `pnpm test:coverage` | the rest |
|---|---|---|---|
| tg-cli ([39151051124](https://github.com/WireCatLabs/tg-cli/actions/runs/39151051124), [39140915602](https://github.com/WireCatLabs/tg-cli/actions/runs/39140915602)) | 137–175 s | 61–79 s | `contracts:upgrade` 17–21 s, setup 15 s, other checks 40 s |
| max-cli ([39153927122](https://github.com/WireCatLabs/max-cli/actions/runs/39153927122), [39150849647](https://github.com/WireCatLabs/max-cli/actions/runs/39150849647)) | 176–183 s | 102–103 s | `contracts:upgrade` 15–16 s, setup 13 s, other checks 40 s |
| whatsapp-cli ([39153065756](https://github.com/WireCatLabs/whatsapp-cli/actions/runs/39153065756), [39150996766](https://github.com/WireCatLabs/whatsapp-cli/actions/runs/39150996766)) | 56–63 s | 22–24 s | `checks` 15–16 s |

whatsapp-cli's long check is its `validation / engine` job (175–181 s in the two runs above: Go formatting check
49 s, cross-build 95 s), not the test job. The test suite cannot shorten that pull-request check.

### The suite, locally

| repository | wall | user CPU | vitest's split |
|---|---|---|---|
| whatsapp-cli | 8.4 s | 35 s | tests 58 %, import 35 %, setup 3 % |
| tg-cli | 27.8 s | 121 s | tests 47 %, import 47 %, setup 2 % |
| max-cli | 37.5 s | 168 s | import 46 %, tests 46 %, setup 4 % |
| max-cli, `--coverage`, two runs | 41–51 s | 190–225 s | import 47 %, tests 43–44 % |

### cli-core's two costs

| cost | whatsapp-cli | tg-cli | max-cli |
|---|---|---|---|
| Drizzle loaded per file | no: `dist` imports its own bundle, `dist/store/sqlite/drizzle/core.js` | no | no |
| new stores per run | 50 | 70 | 131 |
| migrating them | 56 ms each, 2.8 s CPU | 48 ms each, 3.4 s CPU | 48 ms each, 6.3 s CPU |
| reopening a store | 499 times, 2.6 ms | 592 times, 2.4 ms | 1,076 times, 2.5 ms |

About one new store per test file (two in whatsapp-cli). cli-core's fix still migrates once per test file, so a copy of a migrated
store would save almost nothing here. Even removing all migration time would save at most 6.3 s of CPU in
max-cli: about 1.6 s of wall time on 4 workers, about 4 s on CI.

**0.343.0 gives the consumers nothing for this.** The published package has no `fresh-store` file; it is a
vitest setup file in cli-core's own `src/testing/`, which `files` in `package.json` does not ship. It could not
reach a consumer's tests anyway: it mocks a module by its relative source path, and a consumer loads cli-core
from `dist` as an external module, which `vi.mock` does not intercept from inside the package.

### Where the import time goes

| module, summed over all files | whatsapp-cli | tg-cli | max-cli |
|---|---|---|---|
| `@wirecat/cli-core/cli` | 9.5 s in 19 files (500 ms each) | 22.2 s in 51 files (435 ms) | 52.0 s in 101 files (515 ms) |
| `@mtcute/node` | — | 13.5 s in 59 files (229 ms) | — |
| `@wirecat/cli-core/cli`, share of the suite's user CPU | 27 % | 18 % | 31 % |

A cold `import('@wirecat/cli-core/cli')` in plain Node takes 460–560 ms. It loads 887 modules, 697 of them
cli-core's own (of 822 in `dist`). A CPU profile of that import spends over 80 % in Node's module loader
(compiling, resolving, reading `package.json`) and garbage collection, and almost nothing in cli-core code.

### Two cheap fixes tried in max-cli

| try | result |
|---|---|
| `NODE_COMPILE_CACHE` in a scratch folder, `--coverage`, alternated with plain runs | 44.2 s and 44.4 s against 51.1 s and 41.3 s: no difference beyond the noise |
| vitest's SSR dependency optimizer bundling the cli-core entries, as cli-core does for Drizzle | does not load: native addons (`.node` files of `@resvg/resvg-js`, `@napi-rs/canvas`) and `bun:sqlite` must be left out of the bundle; then 108 of 131 files fail with `Identifier 'createRequire' has already been declared`, where vite's banner meets cli-core's own `createRequire` import. Eight cli-core modules also find files through `import.meta.url`, which a bundle in `node_modules/.vite` would break |

## What it showed

- **The consumers do not pay cli-core's two costs.** Drizzle is already bundled in `dist`. New stores are about
  one per test file, so their migration is a few seconds of CPU. No consumer pull request: no change clears the
  15 s bar.
- **Their cost is loading cli-core's `cli` entry in each test file:** about 500 ms and 700 modules per file, 18–31 %
  of each suite's CPU. On CI's 2–2.5 times slower runner that is probably 25–30 s of max-cli's 102 s test
  step and 10–15 s of tg-cli's. It is the "import of cli-core's own modules" left over on the earlier page, seen
  from the consumers' side.
- **The fix for that belongs in cli-core, not in the consumers.** The `cli` entry loads almost all of `dist`
  eagerly. Two possible changes, neither tried: load the heavy command groups on first use, or publish each entry
  as one bundled file, as `dist` already does for Drizzle. Either would also speed up each CLI's own start.
- **whatsapp-cli's check is bound by the Go engine job**, not by tests.

## What was not measured

- How much a lazier or bundled `cli` entry would actually save: it needs a cli-core change and a release.
- `@mtcute/node` in tg-cli (229 ms per file, 13.5 s CPU): mtcute's own module graph, not looked into.
- The consumers' CI with cli-core 0.343.0: none of the three had moved to it yet.
- Repeated runs, except the four coverage runs of max-cli above; the machine was shared.
