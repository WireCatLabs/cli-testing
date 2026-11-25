# A tracker sync of a few rows takes seconds

## Why it was run

linear-cli's tests for sprints ([linear-cli #17](https://github.com/WireCatLabs/linear-cli/pull/17)) ran one full
sync over a strict fake with 3 rows of each of the 8 tracker kinds, two rows a page. That sync took longer than CI's
15 s test limit (46 s on a loaded machine). A CPU profile put about 40 s of a 52 s run in SQLite writes. linear-cli
shrank its fake to work around it ([cli-core #3336](https://github.com/WireCatLabs/cli-core/issues/3336)).

The questions: how many transactions does one sync commit, and where? Is the cost the work inside each transaction,
or the commit itself? The answer decided
[cli-core #3348](https://github.com/WireCatLabs/cli-core/pull/3348): save each page with its cursor in one
transaction, and keep the store's `synchronous` setting as it is.

## Setup

- Machine: AMD Ryzen AI 9 HX 370, 59 GB RAM, Linux 7.0, Node 24.19.0, ext4 on NVMe. Other sessions were running
  builds and tests: load average 13 to 17 during every run below. The stores were in `/var/tmp`, on an ext4 disk
  87% full.
- Code: cli-core `main` at `621906ec8` (before, separate blocks) and `1fe529aae` (before, in turns; its tracker
  change, `--allow-deletions`, writes nothing more), and the branch `perf/tracker-sync-writes` before it was rebased
  onto `1fe529aae` (after). The rebased branch commits the same 38 and 53 times (checked once on tmpfs).
- Data: synthetic only. [`bench.test.ts`](bench.test.ts) times one full `syncTracker` on a new store, without the
  store's open:
  - **small**: cli-core's strict GraphQL fake (`trackerManifestFixture` over `src/testing/tracker-graphql.ts`), 8 kinds
    of 3 rows, 2 rows a page, the case of linear-cli #17;
  - **large**: `fakeTrackerSource` with 2,000 issues and the example workspace's other rows, 100 rows a page.
- It counts every `COMMIT` on the `node:sqlite` driver and which store call made it, and prints `PRAGMA synchronous`
  (2 is `FULL`, SQLite's default, which waits for the disk at every commit in WAL mode).

```sh
cp bench.test.ts <cli-core checkout>/src/tracker/zz-bench-sync-writes.test.ts
cd <cli-core checkout>
BENCH_DIR=/var/tmp BENCH_OUT=$PWD/bench.txt pnpm exec vitest run src/tracker/zz-bench-sync-writes.test.ts
```

`BENCH_DIR` is where the stores go (`/dev/shm` for tmpfs), `BENCH_RUNS` the runs of each case (3),
`BENCH_ISSUES` the large case's issues (2,000), and `BENCH_SYNCHRONOUS=NORMAL` sets that pragma after the store opens.
Without `BENCH_OUT` both cases are skipped.

The disk's speed changed a lot within minutes. So the main comparison ran before and after in turns:
[`interleave.sh`](interleave.sh) runs five rounds, each swapping `src/tracker/sync.ts` and
`src/store/sqlite/tracker.ts` between main's and the branch's, with `BENCH_RUNS=1`:

```sh
CORE=<cli-core checkout> BEFORE=1fe529aae OUT=$PWD/interleaved.txt sh interleave.sh
```

## Results

Commits in one sync, the same in every run:

| Case | Before | After | Before, by caller | After, by caller |
|---|---|---|---|---|
| small | 79 | 38 | rows 16, sync state 44, id pass end 16, tasks 3 | rows with cursor 16, sync state 10, id pass end 8, run end 1, tasks 3 |
| large | 101 | 53 | rows 26, sync state 61, id pass end 14 | rows with cursor 26, sync state 19, id pass end 7, run end 1 |

Time of one sync on disk, before and after in turns (median of 5 rounds, load 13.7 to 16.9):

| Case | Before | After |
|---|---|---|
| small | 354 ms (310–600) | 214 ms (190–434) |
| large | 864 ms (183–1,137) | 714 ms (379–773) |

The same in separate blocks of 3 runs, an hour apart (median, load 13 to 17):

| Case | Before, disk | After, disk | Before, tmpfs | After, tmpfs | Before, disk, `NORMAL` | After, disk, `NORMAL` |
|---|---|---|---|---|---|---|
| small | 4,058 ms (887–6,612) | 344 ms | 51 ms | 130 ms | 57 ms | 64 ms |
| large | 1,515 ms (1,234–5,042) | 894 ms | 80 ms | 121 ms | 464 ms | 215 ms |

The "before, disk" block ran while the disk was much slower; compare it only with itself. On tmpfs "after" was not
faster, and its runs were spread wider (59–139 ms small): those runs are tens of milliseconds, so the load of the
moment decides them.

## What it showed

- The cost is the commit, not the work inside it (inferred from tmpfs against disk; no profile was taken). On tmpfs,
  where a commit does not wait for a disk, the small sync takes 30–140 ms either way. On disk each commit took 4 to 80
  ms depending on what else wrote to the disk, so 79 commits took 0.3 to 6.6 s.
- The sync committed far more often than it had to: the rows of a page, then the cursor after it on its own; at the
  end of each kind's id pass a dry run that took the write lock, the marks, the end of the pass and the kind's
  `passAt` as four more; and the run's end as two.
- The fix halves the commits: a page's rows and its cursor in one transaction, the end of an id pass in one, the
  dry run as a read, the run's end in one. The time on disk falls by about 40% for the small case in the fair
  comparison and by less for the large one, whose 26 pages of rows still commit once each.
- `synchronous = NORMAL` would make every commit cheap (the small sync at 57 ms on disk), but it is a setting of the
  whole store that tg, max, memo and every other CLI share, and it lets the newest commits be lost when the machine
  loses power. It was not changed.
- The crash promise got stronger, not weaker. Before, a crash between a page and its cursor read the page again on
  the next run. Now a page is saved with its cursor or not at all.

## What was not measured

- A real Linear workspace, the network, and the CLI around the sync (`linear sync` through `runCli`). linear-cli's
  46 s included its harness and a loaded CI-like run; this measures `syncTracker` alone.
- An idle machine. Every run had a load average of 13 or more from other sessions, and the disk's speed changed
  between minutes. The commit counts are exact; the times are only comparable within one table.
- A sync of changes after the first: it reads one page a kind, so it saves fewer commits.
- The id pass still commits once a page of ids with more to come, so a stopped pass keeps what it read. Holding them
  in memory until the end would save 8 of the small sync's 38 commits; it was not tried.
