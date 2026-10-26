# Splitting the CLIs' test run across 4 runners

Measured 2026-10-26 on [tg-cli #735](https://github.com/WireCatLabs/tg-cli/pull/735) and
[max-cli #827](https://github.com/WireCatLabs/max-cli/pull/827). The mechanism is cli-base's `node-ci.yml` input
`test-shards` ([cli-base #350](https://github.com/WireCatLabs/cli-base/pull/350), and
[#352](https://github.com/WireCatLabs/cli-base/pull/352) for CLIs with `cli: true`).

## Why we ran it

Every tg-cli pull request waited about 5 minutes for `validation / ci / check`, and 229 s of its 312 s were
`pnpm test:coverage`: 77 test files on one 4-vCPU runner
([run](https://github.com/WireCatLabs/tg-cli/actions/runs/40240957284)). max-cli's job was 169 s, 114 s of it the
same step ([run](https://github.com/WireCatLabs/max-cli/actions/runs/40242850164)).

The question: does running the tests on 4 runners at once, and merging their coverage after, shorten the wait for a
pull request? The answer decided whether tg-cli and max-cli set `test-shards: 4`.

## Setup

- **CI.** GitHub's standard Linux runner (4 vCPU), WireCatLabs on the Free plan. Vitest 5.0.5 with v8 coverage.
- **Before.** cli-base `node-ci.yml` at v0.48.0: one `check` job runs lint, typecheck, `test:coverage`, build and the
  CLI checks.
- **After.** `test-shards: 4`: four `test (i/4)` jobs each run `vitest run --coverage --shard=i/4 --reporter=blob`
  with the coverage floor off. `coverage` waits for them, merges the reports with `vitest --merge-reports`, enforces
  the floor, joins the shards' argv logs and runs `test:matrix:check`. `check` runs everything else, in parallel with
  the shards.
- **Command.** [`job-times.sh`](job-times.sh) `<owner/repo> <run id>` prints each job's time and the run's span.
  Whole-run times are `createdAt` to `updatedAt` of `gh run view <id> --json createdAt,updatedAt`. Queue times are
  `created_at` to `started_at` of each job in `gh api repos/<repo>/actions/runs/<id>/jobs`.

## Results

### tg-cli

| | before | after, run 1 | after, run 2 |
|---|---|---|---|
| run | [40240957284](https://github.com/WireCatLabs/tg-cli/actions/runs/40240957284) | [40247325088](https://github.com/WireCatLabs/tg-cli/actions/runs/40247325088) | [40247732415](https://github.com/WireCatLabs/tg-cli/actions/runs/40247732415) |
| `check` | 312 s | 80 s | 56 s |
| shards 1–4 | — | 97 / 61 / 97 / 41 s | 139 / 66 / 93 / 42 s |
| `coverage` | — | 23 s | 23 s |
| longest shard + `coverage` | — | 120 s | 162 s |
| whole run | 315 s | 266 s | 290 s |
| each job's wait for a runner | none seen | 53–68 s | up to 81 s |

Run 2 had a coverage floor of 99 % on purpose; its time is still valid, the merge fails at the end. Run 3
([40248523621](https://github.com/WireCatLabs/tg-cli/actions/runs/40248523621)), with max-cli's run at the same
time: whole run 326 s, longest shard 91 s, jobs waited 11–170 s for a runner.

**2 shards** ([40249617246](https://github.com/WireCatLabs/tg-cli/actions/runs/40249617246)): shards 168 s and
120 s, `coverage` 31 s, `check` 85 s, whole run 267 s, jobs waited 2–49 s for a runner.

### max-cli

| | before | after |
|---|---|---|
| run | [40242850164](https://github.com/WireCatLabs/max-cli/actions/runs/40242850164) | [40248547965](https://github.com/WireCatLabs/max-cli/actions/runs/40248547965) |
| `check` | 169 s (114 s `test:coverage`) | 86 s |
| shards 1–4 | — | 58 / 93 / 71 / 75 s |
| `coverage` | — | 30 s |
| whole run | see below | 291 s |
| each job's wait for a runner | — | 15–131 s |

### The "before" runs vary as much

Whole-run times of the last ten green pull-request runs without shards, 2026-10-25 20:48–00:09 UTC
(`gh run list -w "Pull request validation" -e pull_request -s success`):

| repo | whole run, s |
|---|---|
| tg-cli | 196, 207, 246, 309, 311, 315, 320, 323, 332, 470 |
| max-cli | 59 (version-only), 172, 219, 292, 297, 305, 315, 316, 344, 348 |

The sharded runs (tg-cli 266, 290, 326; max-cli 291) sit inside those ranges.

The merged run of run 1: 77 test files, 2,151 tests passed, 95.01 % of lines; test matrix "2353 tested, 105
untested with a reason, 0 missing".

### The failure paths

| scratch commit | shards | `coverage` |
|---|---|---|
| coverage floor raised to 99 % | all green | red: "Coverage for lines (95.01%) does not meet global threshold (99%)" |
| one test that fails | 1/4 red | red: "a test shard did not pass: failure", not skipped |

## What it showed

- **The tests' own time drops by half or more,** from 229 s in one job to the longest shard (about 100 s) plus a 23 s
  merge.
- **The whole run barely moves while the account is busy.** tg-cli's sharded runs took 266–326 s, unsharded ones
  196–470 s; max-cli's sharded run 291 s, unsharded 172–348 s. Every job of the "after" runs waited 1–3 minutes for
  a runner, `check` included. The Free plan runs at most 20 jobs at once across the whole account
  ([GitHub's limits](https://docs.github.com/en/actions/reference/limits#job-concurrency-limits-for-github-hosted-runners)),
  and other repositories' pull requests (cli-core had 6 runs in progress) were using it. 4 shards add 4 jobs to every
  pull request, so they take more of that shared cap and lengthen everyone's wait.
- **The shards are uneven.** Vitest splits by file, not by time, and `src/bot-api.test.ts` alone takes 70 s, so the
  shard holding it is the long pole. More shards would not shorten it.
- **Both failures block the merge,** once `validation / ci / coverage` is a required check: a skipped required check
  would count as passed, and `coverage` fails instead of skipping.

## What was decided

- **tg-cli: 2 shards** ([tg-cli #735](https://github.com/WireCatLabs/tg-cli/pull/735)), with
  `validation / ci / coverage` a required check on `main`. Its test step is by far its longest job, and 2 shards
  take 2 extra runners, not 4.
- **max-cli: no shards** ([max-cli #827](https://github.com/WireCatLabs/max-cli/pull/827), closed). 114 s of tests
  does not pay for the extra jobs.

## What was not measured

- A quiet account, with no other repository's jobs waiting for runners. The "after" gain there should be closer to
  the job times than to the whole-run times.
- 3 shards, and 2 shards on more than one run.
- How much the extra jobs slow other repositories' pull requests that wait for the same 20 runners.
