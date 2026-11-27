# cli-core's GitHub Actions: where a pull request's runner time goes

Measured 2026-11-26 on [cli-core #3391](https://github.com/WireCatLabs/cli-core/pull/3391), which acted on the
breakdown in [cli-core #3386](https://github.com/WireCatLabs/cli-core/issues/3386).

## Why we ran it

WireCatLabs runs on the GitHub Free plan: 20 jobs at once, shared by every repository and agent. On 2026-11-08 more
than 70 runs waited in the queue. #3386 profiled 200 cli-core runs and proposed cuts. The question: which of them
are real, measured on the workflow files and logs, and what do they save in runner time and slots? The answer
decided what #3391 changed and what went to the owner.

## Setup

- **CI.** GitHub's standard Linux runner, cli-core at main before and after #3391. Vitest 5.0.5.
- **Before.** Pull request runs 45866261202, 45860737580 and 45731156852, each with its security, standards and
  changelog runs.
- **After.** Run 45903601794 and the three beside it. The native runtime run is left out: #3391 edits that
  workflow, so it ran.
- **Command.** [`run-totals.py`](run-totals.py) `-v <run id>...` sums each job's time and reports the span and the peak
  number of jobs running at once. Step times come from `gh api repos/WireCatLabs/cli-core/actions/runs/<id>/jobs`.
  The docs path was replayed offline: `scripts/ci-unchanged.sh` with `DOCS=true` in a clone at each real merge commit.

## Results

A typical pull request before: 1,878 to 2,089 runner seconds, 545 to 578 s span, 15 jobs at once at the peak.

| | before | after |
|---|---|---|
| Shard `Duration` lines (1/2, 2/2) | 307 / 474 s, 349 / 476 s | 421 / 458 s |
| `ci / check` job | 105 s | 72 s |
| `checks` step in `ci / check` (two extra builds removed) | 37 to 41 s | 14 s |
| `sqlite-restart` docker step (`-O0`) | 42 to 43 s | 40 s |
| Runner time per pull request | 1,878 to 2,089 s | 1,910 s |

Docs path, replayed over history:

- All 4 docs-only pull requests among the last 100 merged would have skipped the full validation. They had used 1,486
  to 1,701 runner seconds each, about 108 runner minutes in all.
- Of the last 60 pushes to main (2026-11-24 to 26), 29 ran the full validation, about 26 runner minutes each. 2 of
  them would now skip it. The other 27 ran because the pull request's head did not contain the main it landed on.

Claims checked and found not to hold:

- **Shards are not alphabetical.** Vitest 5.0.5 `BaseSequencer.shard` sorts files by a sha1 hash of the path and
  cuts equal counts. The skew was still real: 1,002 s of test time against 626 s.
- **npm's wait after publish is not a CDN cache.** In 5 releases the wait ended 3 to 10 s after npm's own `time`
  entry for the version, and a 404 for a missing version carries no cache headers.

## What it showed

- Weighting the shards evened them (37 s apart, not 167 s), but on this one sample the slower shard dropped only
  about 16 s, and both together took about 100 s more. Heavy store files now share each runner's 4 workers.
- The duplicate builds were a clean 25 s per pull request.
- The large cost is main re-validating merges whose pull request was behind main: about 700 runner minutes in two
  days. Only a policy change (a merge queue, or requiring branches up to date) removes it.

## Not measured

- More than one sample after the change. Shard timings vary by about 40 s between runs of the same tree.
- Wall clock after the change: the account's queue was full during the run (span 1,365 s, 6 own jobs at the peak).
- The docs path on a live run: no docs-only pull request has run since the merge.
- Batching the downstream parity jobs (#3386 item 2). Not built. The template database for tests is in the
  follow-up below.

## Follow-up: the tests themselves (cli-core #3412, 2026-11-27)

### Why we ran it

The two test shards are about 90% of a pull request's critical path. #3386 named two costs inside them: every test
file that opened a store migrated an empty one again (vitest's `isolate: true` resets the module that held the
migrated copy), and a list of slow files. The question: what do the tests waste, and what does cutting it save? The
answer decided what [cli-core #3412](https://github.com/WireCatLabs/cli-core/pull/3412) changed. The 2026-10-18 page
[cli-core-test-speed](../cli-core-test-speed/README.md) introduced the per-file copy; this moves it to once per run.

### Setup

- **Local.** AMD Ryzen AI 9 HX 370 (24 threads), Node 24.19.0, Vitest 5.0.5, one worker. cli-core main at
  7cbf47f6e against the change, shards run alternately (before 1, after 1, before 2, after 2). Other agents ran
  suites on the same machine, so the load moved between 4.6 and 42 during the runs.
- **Command**, per shard and tree:

  ```sh
  VITEST_MAX_WORKERS=1 VITEST_MAX_FORKS=1 VITEST_MAX_THREADS=1 \
    pnpm exec vitest run --maxWorkers=1 --shard=<i>/2 --reporter=default --reporter=json --outputFile.json=<report>
  python3 test-file-times.py <before report> <after report>
  ```

  The environment variables matter: `VITEST_MAX_WORKERS` overrides both `--maxWorkers` and `maxWorkers` in the
  config. With it set to 6 in the shell, `--maxWorkers=1` ran 6 workers, and even `fileParallelism: false` ran four
  files at once (checked with four files that each block for 2 s).
- [`test-file-times.py`](test-file-times.py) sums each file's test time (`endTime - startTime` in the JSON report),
  which leaves out imports and the wait for a machine test slot.
- **CI.** Run 45923719189 of #3412 against six pull request runs of the same evening (45918755869, 45917730969,
  45916992986, 45916201468, 45915926591, 45915781071).

### Results

| Local, one worker | shard 1/2 | shard 2/2 |
|---|---|---|
| Tests' own time, before → after | 678 → 511 s (−25%) | 663 → 492 s (−26%) |
| Vitest `Duration`, before → after | 1,187 → 992 s | 1,173 → 1,329 s |
| Load at start → end, before | 9.2 → 8.3 | 4.6 → 13.0 |
| Load at start → end, after | 8.3 → 4.6 | 13.0 → 25.2, 42 in between |

- The median file's tests got 0.2 s faster. The biggest single file was `note-vectors.test.ts`, 15.7 → 8.0 s: it
  no longer finds mentions in its 6,000-note store, which none of its tests reads.
- Shard 2's `Duration` rose because the after run waited for test slots under load 42 (setup 23% of it, against 3%
  before). The tests' own time fell by the same share in both shards, under rising and falling load alike.
- A full run with coverage, one worker, passed above the floor (lines 95.62%).
- **CI, one sample:** shards 284 / 418 s, 702 s together. The six other runs: 621 to 914 s together (median 742 s),
  with shard pairs from 318 / 318 to 479 / 434 s. One sample cannot be told apart from that spread.

### What it showed

- The per-file migration was the one clear waste: a quarter of the tests' own time on one worker.
- The other slow files spend their time on what they check. Each `version-*.test.ts` spends about 1.2 s rolling a
  store back (61 `ALTER TABLE … DROP COLUMN`, about 20 ms each, since SQLite checks the whole 991-object schema
  each time) and about 1.4 s on the real upgrade through migration 73. `rollback-copy.test.ts` migrates on purpose.
  The 200,000-message, 100,000-line and 10,001-hit files are load tests.
- In `mcp/mcp.test.ts` (199 tests, about 0.6 s each), a third of the CPU goes to `resolveSettings`, which the server
  calls on every tool call to refresh permissions. That is product code, left as a finding.
- `isolate: false` is not safe in cli-core today: in a reused worker only the first file got cli-base's sandbox, and
  the next three files saw the real home folder.

### Not measured

- More CI samples: CI shard times vary by about 300 s between runs of similar trees.
- The change in import time: the same modules are evaluated as before; the saving is in running the migration.
