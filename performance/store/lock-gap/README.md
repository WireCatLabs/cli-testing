# How long a gap between a writer's transactions lets another process write

## Why it was run

tg, max, memo and mail share one SQLite file, and a process that cannot get the write lock gives up after
`busy_timeout` (5 s) with "database is locked". cli-core 0.485.0 made a waiting write retry every 1 ms instead of using
SQLite's own wait, which sleeps up to 100 ms between tries ([lock-hold](../lock-hold/README.md) measured both against
mail saves).

The test that guards that retry (`src/store/sqlite/transaction.test.ts` in cli-core) then failed at random on CI. Its
second process commits and begins its next transaction at once. The questions: does a 1 ms retry get in when the
writer leaves no gap at all, and how big a gap does it need? The answer fed two changes:
[cli-core#2249](https://github.com/WireCatLabs/cli-core/pull/2249) gave the test's writer a 0.3 ms pause, and
[cli-core#2255](https://github.com/WireCatLabs/cli-core/pull/2255) made `writeBatch`, which every fill and rebuild
loop uses, pause 2 ms after each batch.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- No cli-core code runs. [`bench.mjs`](bench.mjs) copies cli-core's `beginImmediate` (`busy_timeout = 0`, a try
  every millisecond with `Atomics.wait`, up to 5 s), as in cli-core 0.505.0.
- A fresh, empty WAL-mode file per try, in the system temp folder. No real data.
- The writer is another Node process: `BEGIN IMMEDIATE`, 20 ms busy, `COMMIT`, then a pause of 0, 0.3 or 2 ms, for
  9 s. 200 ms after it starts, this process writes one row, waiting either with the 1 ms retry ("retry") or with
  `busy_timeout = 5000` ("sqlite"). The time is from the first try to the commit; a try that gives up after 5 s is
  "failed".
- 20 tries per row.

```sh
node bench.mjs 20 0,0.3,2
```

## Results

| pause after commit | write waits with | median ms | p90 ms | worst ms | over 1 s | failed (5 s) |
|---|---|---|---|---|---|---|
| 0 ms | retry | 3823 | failed | failed | 15/20 | 8/20 |
| 0 ms | sqlite | failed | failed | failed | 20/20 | 20/20 |
| 0.3 ms | retry | 46 | 151 | 187 | 0/20 | 0/20 |
| 0.3 ms | sqlite | 9 | failed | failed | 6/20 | 5/20 |
| 2 ms | retry | 20 | 25 | 25 | 0/20 | 0/20 |
| 2 ms | sqlite | 134 | 335 | 335 | 0/20 | 0/20 |

The same table is in [`results.md`](results.md).

## What it showed

- **No retry interval fixes a writer that leaves no gap.** With no pause, the 1 ms retry failed 8 of 20 tries and
  took over 1 s in 15; SQLite's own wait failed every time. The gap between `COMMIT` and the next `BEGIN` is a few
  microseconds, and a try gets in only when it lands there by chance.
- **0.3 ms is enough for the retry, not for SQLite's own wait.** The retry got in within 187 ms every time. SQLite's
  wait still failed 5 of 20: it sleeps longer between tries and misses the gap.
- **2 ms is enough for both.** The retry waited 25 ms at worst, SQLite's own wait 335 ms. A process on an older
  cli-core, which waits SQLite's way, gets in too. That is why `writeBatch` pauses 2 ms, not 0.3.
- **A guarding test needs a gap.** The cli-core test now leaves 0.3 ms and asserts under 1 s. In this table that line
  passes the retry 20 of 20, and fails SQLite's own wait in 6 of 20, so it still catches a return to it, but only
  in some runs.

## Not measured

- Holds other than 20 ms. Real batches hold from a few ms to about 300 ms ([lock-hold](../lock-hold/README.md)); a
  longer hold makes each missed gap cost more.
- Pauses between 0.3 and 2 ms, and above 2 ms.
- Two looping writers at once, and a loaded machine or a CI runner. CI is slower, which is why the test's limit is
  1 s and not the 187 ms seen here.
- Bun.
- The cost of the pause on a real rebuild. It is about 2 s per million rows at 1,000 rows a batch, worked out from
  the batch sizes, not measured.
