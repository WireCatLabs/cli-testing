# Where cli-core's 7-minute pull-request check spent its time

Measured 2026-10-18. The fix is [cli-core#1566](https://github.com/WireCatLabs/cli-core/pull/1566), not yet merged when this was written.

## Why we ran it

The `validation / ci / check` job of cli-core took 6 min 54 s on
[PR #1562](https://github.com/WireCatLabs/cli-core/actions/runs/39123333517). The owner found that suspicious for a
library with no network and no real accounts in its tests. The suspects were requests to the network, the SQLite
store used wastefully, and too little parallel work on the runner's 4 vCPUs.

The question: where does the time go? The answer decided what to change in cli-core, and what to leave for
cli-base's shared workflow.

## Setup

- **CI.** GitHub's standard Linux runner (4 vCPU). The job is cli-base's shared
  [`node-ci.yml`](https://github.com/WireCatLabs/cli-base/blob/main/.github/workflows/node-ci.yml): install, lint,
  typecheck, `pnpm test:coverage`, build, then the repository's own checks. Step times come from
  `gh api repos/WireCatLabs/cli-core/actions/jobs/<job id>`, vitest's own summary from `gh run view --log`.
- **Local machine.** AMD Ryzen AI 9 HX 470 (12 cores, 24 threads), 30 GB RAM, NVMe, Linux 7.0, Node 24.19.0,
  pnpm 11.20.0, vitest 5.0.2 with v8 coverage. cli-core at
  [`1effa17c`](https://github.com/WireCatLabs/cli-core/commit/1effa17c) (0.342.0): 463 test files, 5,439 tests,
  `maxWorkers: 4`. Other agents' work was running; the load average is given with each run.
- **Commands.**
  - Whole suite: `/usr/bin/time -f "wall %e user %U sys %S" npx vitest run` (and `--coverage`).
  - Workers and configurations, pinned to 4 logical CPUs: [`measure.sh`](measure.sh)
    `<cli-core checkout> <output dir> w4 w2 w1 cov shm noiso`.
  - Import time per module, summed over all files: [`import-reporter.mjs`](import-reporter.mjs), a vitest reporter,
    `npx vitest run --experimental.importDurations.limit=100000 --reporter=./import-reporter.mjs`.
  - Per-file setup cost: 24 test files with one empty test each, run with and without the Drizzle preload line in
    `src/testing/sandbox.ts`.
  - Store opens: a temporary probe in `openStoreContext` appended `fresh|reopen <ms>` to a file for one full run.
    Fresh-open parts (`migrate` on a file, with `synchronous=OFF`, in `:memory:`) and the time of each migration
    statement: a temporary test file, 15 and 10 repetitions, median and mean. Neither was committed.

## Results

### CI, the job before the fix

| step | time |
|---|---|
| install (pnpm store cached) | 4 s |
| lint | 9 s |
| typecheck | 11 s |
| **`pnpm test:coverage`** | **5 min 48 s** (vitest: 346 s; tests 44 %, setup 31 %, import 19 %, transform 4 %) |
| build | 5 s |
| checks (docs, schema, dist, agent process) | 19 s |

The suite runs once, with coverage. No step runs it a second time.

### Where the suite's time went

| finding | measured |
|---|---|
| Drizzle preloaded in every test file | 24 trivial files: 2.84 s with the preload, 0.80 s without — about 340 ms per file, 463 files |
| Migrating every new store | 1,925 new stores per run, 53 ms each (102 s of CPU); reopening an existing store: 1,882 times, 1.7 ms |
| — of that, `migrate` | 38.8 ms on a file, 35.1 ms with `synchronous=OFF`, 33.1 ms in `:memory:`: CPU, not disk |
| — the statements | 399 statements; each `ALTER TABLE … ADD` takes about 1.1 ms, since SQLite re-parses the schema |
| Coverage | 150 s with v8 coverage, 147 s without (4 workers) |
| Network | 0 refusals from cli-base's network guard in every run; no test calls `allowNetwork` |
| Real waits | 2 tests wait on a hard-coded 1 s `busy_timeout` (about 2 s each); the other slow tests use CPU (wall ≈ user + sys) |
| `isolate: false` | 121 s, but 13 files fail: state leaks between files |
| Threads pool | 94 s against 98 s with forks, 2 files fail |

### Workers, pinned to 4 logical CPUs

| workers | before | after |
|---|---|---|
| 1 | 460 s (load 15) | 362 s (load 27) |
| 2 | 270 s (load 9) | 220 s (load 20) |
| 4 | 145 s (load 4) | 121 s (load 13) |

The suite scales close to linearly with workers, and 4 workers already keep 4 CPUs busy (468 % CPU unpinned).
The "after" column is noisy and is not a clean measurement of the fix: other sessions kept the load at 13–27 and
the machine rebooted during the series. Read it as a rough direction only. The cleaner comparison is the run with
no pinning, at load 7–12:

| | wall | user CPU |
|---|---|---|
| before | 147 s | 610 s |
| Drizzle bundled once | 110 s | 404 s |
| and new stores copied from a migrated one | 98 s | 366 s |
| with coverage, before → after | 150 s → 101 s | 618 s → 377 s |

### CI, after the fix

[Run 39140421171](https://github.com/WireCatLabs/cli-core/actions/runs/39140421171/job/117713542946): the job took
**4 min 51 s** (was 6 min 54 s); `pnpm test:coverage` 3 min 45 s (was 5 min 48 s), vitest 223 s (was 346 s).
Coverage is the same to the line: 93.47 / 85.67 / 94.16 / 95.28 %.

## What it showed

- **The time was setup, not the tests and not the network.** Half the suite's CPU went to work done again in each
  test file or each new store: loading Drizzle from `node_modules` (it reads its 290 KB `package.json` for each of
  its 72 modules) and running about 400 migration statements for every new store.
- **More workers would not help on CI.** The runner has 4 vCPUs and the suite already keeps 4 busy. Only less
  work makes it faster.
- **What changed in cli-core** ([#1566](https://github.com/WireCatLabs/cli-core/pull/1566)): vitest's SSR
  dependency optimizer bundles Drizzle once, as `dist` already does; a test setup file starts each new store from a
  copy of one migrated once per test file. Production code is unchanged.
- **What is left.** Import of cli-core's own modules is now 31 % of the CI run: each test file evaluates the
  store's module graph again, since every file runs in a fresh worker. `isolate: false` would remove it, but files
  share state and 13 fail. `psl` (17 ms per file) is loaded by every file that opens a store.
- **CI is about 2.3 times slower than this machine** for the same work (223 s against 98 s).

## What was not measured

- tg-cli, max-cli and whatsapp-cli: measured on [consumer-test-speed](../consumer-test-speed/README.md).
- A cache of transformed modules across CI runs (vitest's `experimental.fsModuleCache`): that is a change to
  cli-base's shared workflow.
- A tmpfs `TMPDIR` on CI. Locally one run wrote about 8 GB to disk, but migrating in memory is only 15 % faster
  than on a file, and the local tmpfs run (205 s at load 35) was too noisy to read.
- Repeated runs: each configuration ran once, on a shared machine.
