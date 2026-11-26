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
- Batching the downstream parity jobs and a template database for tests (#3386 items 1 and 2). Not built.
