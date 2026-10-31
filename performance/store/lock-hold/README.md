# How long mail saves hold the store's write lock

## Why it was run

`mail sync` failed with "database is locked" while `memo sync` ran next to it. tg, max, memo and mail share one SQLite
file: one writer at a time, and a process that cannot get the lock gives up after `busy_timeout` (5 s). Reading the
code pointed at two writers that save one email per transaction, back to back: memo's header backfill (up to 2,000
emails per run) and cli-core's `syncMail`. Every store `write()` also queues work at commit: stems, mentions
(which rebuild the list of known people and their name index) and involvements.

The question: which writer holds the lock for long, and does slicing the writes (about 50 per transaction, a 100 ms
pause between) fix it? The answer feeds a decision: fix the writers, then remove cli-core 0.485.0's 1 ms lock retry
(`beginImmediate` in `transaction.ts`) and the proposed flag-file queue between commands.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Code: cli-core `main` at `a2426a39` (0.504.0), built with `pnpm build`. Nothing in cli-memo was changed.
- Data: a copy of the owner's real store, made with SQLite's `.backup` while nobody wrote to it, then used offline: no
  network, no account, no CLI run. Totals: 5.54 GB file, 275,951 emails (110,837 with a body), 242,508 mail threads,
  216,986 chat messages, 851,335 mentions, 18,413 known people with 18,442 names and aliases.
- Two workloads, both through the build's own `mailStoreOver(...).saveThread`:
  - **re-save**: a stored email saved again with its own text plus a header. This is what the header backfill does.
  - **new**: an email that does not exist yet, with a real body copied from the store and a made-up Message-ID. This is
    what `syncMail` does for mail it has not seen. The made-up rows stay in the copy only.
- One save, split: an outer `writeBatch` (no drains) holds `saveThread`; then `drainStems`, `drainMentions` and
  `drainInvolvementQueue` run inside it, each on its own clock. "commit" is what is left after them.
- Writer against a waiter: [`waiter.mjs`](waiter.mjs) runs in another process on the same file and tries `BEGIN IMMEDIATE`
  every 50 ms, writing one row. It waits either with SQLite's own `busy_timeout = 5000`, or as cli-core 0.485.0 does
  (`busy_timeout = 0`, a try every 1 ms, up to 5 s). Its worst wait is how long the writer kept it from the lock; a
  failure is a try that gave up after 5 s. The writer is either one `write()` per email, or `write()` over 50 emails
  with a 100 ms pause after each. Each run uses its own emails, and the WAL is checkpointed before it.
- Sizes: 2,000 re-saves and 300 new emails per run; 100 and 30 saves for the split.

```sh
DBUS_SESSION_BUS_ADDRESS=disabled: node bench.mjs <cli-core checkout with dist> <store copy> 2000 300 100 30
```

## Results

One save (ms, median / p95):

| part | re-save | new email |
|---|---|---|
| data write | 0.63 / 1.96 | 1.93 / 9.06 |
| stems drain | 0.03 / 0.05 | 0.03 / 0.09 |
| mentions drain | 0.02 / 0.04 | **299 / 433** |
| involvements drain | 0.01 / 0.01 | 2.26 / 10.3 |
| commit | 0.74 / 3.41 | 10.7 / 52.3 |
| total | 1.59 / 5.03 | 312 / 472 |

Run alone on the same store: `knownPeople()` 70 ms and `nameIndex()` 209 ms (medians of 7). Together that is the
mentions drain's fixed cost, paid by every `write()` that queued any text.

Writer against a waiter:

| workload | writer | waiter's wait | total | transactions | hold median / p95 / max (ms) | waiter worst wait | waiter failures |
|---|---|---|---|---|---|---|---|
| 2,000 re-saves | per email | busy_timeout 5 s | 17.8 s | 2,000 | 8 / 16 / 42 | 4,337 ms | 0 |
| 2,000 re-saves | slices of 50 | busy_timeout 5 s | 18.5 s | 40 | 119 / 1,793 / 2,625 | 1,430 ms | 0 |
| 2,000 re-saves | per email | 1 ms retry | 17.7 s | 2,000 | 8 / 17 / 34 | 708 ms | 0 |
| 2,000 re-saves | slices of 50 | 1 ms retry | 7.0 s | 40 | 79 / 142 / 192 | 145 ms | 0 |
| 300 new emails | per email | busy_timeout 5 s | 76.0 s | 300 | 192 / 490 / 1,376 | 4,143 ms | 13 of 25 tries |
| 300 new emails | slices of 50 | busy_timeout 5 s | 2.1 s | 6 | 268 / 322 / 322 | 329 ms | 0 |
| 300 new emails | per email | 1 ms retry | 61.2 s | 300 | 202 / 288 / 345 | 3,663 ms | 4 of 69 tries |
| 300 new emails | slices of 50 | 1 ms retry | 2.1 s | 6 | 265 / 297 / 297 | 295 ms | 0 |

Gaps between transactions: about 0.01 ms per email, 100 ms with slices. The raw tables are in
[`results.md`](results.md).

## What it showed

- **A new email costs about 300 ms of lock time, and 95% of it is the mentions drain.** The drain rebuilds the known
  people and the name index (about 280 ms on 18,413 people) at the end of every `write()` that queued text. A re-save
  of an unchanged body queues nothing: the trigger fires only when the body changes, so its drain costs 0.02 ms.
- **`syncMail`, saving one email per `write()`, is the writer that starves others.** 300 new emails took 76 s with a
  hold of about 200 ms each and almost no gap. A waiter on SQLite's own wait failed on 13 of 25 tries ("database is
  locked"). Slices of 50 paid the rebuild six times instead of 300: 2.1 s in total, a worst wait of 329 ms, no failures.
  This is the failure that was reported.
- **The header backfill alone is not that heavy.** 2,000 re-saves held the lock for about 8 ms each, 17.8 s end to end.
  A waiter on SQLite's own wait still waited up to 4.3 s, close to the 5 s limit, because it never saw a gap. It
  failed in no run here, and the backfill would have to run on a slower disk or a bigger batch to fail. Slicing cut
  the worst wait to 1.4 s (SQLite wait) and 145 ms (retry).
- **The 1 ms retry helps but does not fix it.** On re-saves it cut the worst wait from 4.3 s to 0.7 s. On new emails it
  still waited 3.7 s and failed 4 of 69 tries, because one hold lasts 200 to 350 ms and the retry only finds a gap that
  exists. With slices, the retry is not needed: SQLite's own wait saw a 329 ms worst case with no failure.
- **Slicing is the fix; the retry and a flag-file queue are not needed for these two writers.** The pause leaves a
  100 ms gap, and the waiter got through in every sliced run.

## With cli-core #2250

[cli-core#2250](https://github.com/WireCatLabs/cli-core/pull/2250) adds `MailStore.saveThreads(inputs, states)`: a slice
of threads plus the sync cursor in one `write()`, so the mentions drain runs once per slice. The same "300 new emails"
case ran through the real `saveThreads` (cli-core branch `feat/save-threads` at `3409e840`, on top of `a2426a39`), in
slices of 50 with a 100 ms pause, as `src/mail/sync.ts` now does. [`save-threads.mjs`](save-threads.mjs) ran it on a
fresh copy of the store, taken after the earlier runs, so it holds none of their made-up emails (276,564 emails; the
live store had grown by about 600 since the first copy). It counts the drain by wrapping the connection's `prepare`:
one count for the queue read of `drainMentions`, one for the `knownPeople` query that starts a name index rebuild.

```sh
DBUS_SESSION_BUS_ADDRESS=disabled: node save-threads.mjs <cli-core checkout with dist> <store copy> 300
```

| waiter's wait | emails | total | transactions | mention drains | name index rebuilds | hold median / max (ms) | waiter tries | waiter worst wait | waiter failures |
|---|---|---|---|---|---|---|---|---|---|
| busy_timeout 5 s | 300 | 1,694 ms | 6 | 6 | 6 | 199 / 289 | 15 | 329 ms | 0 |
| 1 ms retry | 300 | 1,479 ms | 6 | 6 | 6 | 159 / 192 | 16 | 184 ms | 0 |

- The drain and the name index rebuild each ran 6 times for 6 slices, not 300 times.
- The result matches the hand-made slices above: about 1.5 to 1.7 s in total (2.1 s there, with the 100 ms pauses
  inside), a worst wait of 184 to 329 ms, no failures. The state write adds nothing visible.
- One run per wait mode. The 100-email smoke run on the earlier copy showed the same shape (2 slices, 2 drains).

## Not measured

- Two writers at once (a real `mail sync` next to a real `memo sync`). Here one writer ran against a waiter that holds
  the lock for under a millisecond.
- The network side of both syncs, and their reads (`emailFacts`, `inThreads`) between saves.
- Other slice sizes and pauses. 50 and 100 ms were the proposal, nothing else was tried.
- Why one run held the lock for 2.6 s (2,000 re-saves in slices of 50, SQLite wait, p95 1.8 s). The other three
  re-save runs did not. A WAL checkpoint or a cold cache is a guess; each run was done once.
- The cost of the drains on a slower disk, or a store with more people. The name-index cost grows with the number of
  known people and was measured at one size.
- Bun, and cli-core other than `a2426a39`.
