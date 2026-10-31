# How a reader learns that another process wrote to the store

## Why it was run

The owner wants WireCat Desktop's Memory page (and the planned Tasks page) to update when an agent or another CLI
changes a task, a memory or a fact. Every WireCat CLI writes one SQLite file in WAL mode, from several processes. A
reader in another process needs a signal that something committed. SQLite gives two candidates that work across
processes without a daemon:

- poll `PRAGMA data_version`, which changes when another connection commits
  ([SQLite docs](https://www.sqlite.org/pragma.html#pragma_data_version));
- watch the folder for writes to the `-wal` file (`fs.watch`: inotify on Linux, FSEvents on macOS,
  ReadDirectoryChangesW on Windows).

The questions: how fast is each, what does it cost while a sync writes heavily, and does either miss a commit? The
answer feeds the events design in cli-core (`docs/dev/plans/2026-11-01-events.md`,
[cli-core#2274](https://github.com/WireCatLabs/cli-core/pull/2274)).

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), NVMe disk, ext4, Linux 7.0, Node 24.19.0, its built-in `node:sqlite`
  with SQLite 3.53.3 (the driver cli-core uses under Node).
- No cli-core code runs and no real data is used. [`bench.mjs`](bench.mjs) makes a fresh WAL-mode file per row under
  `~/.cache/events-bench-<pid>` and removes it at the end.
- An "events" writer process commits one row to `events` every 20–200 ms (random), stamped with the commit time.
- "sync-like writer": a second process commits 50 rows of 4 KB every ~20 ms, as a mail or messenger sync does. About
  every 20th commit fills 1,000 pages, so SQLite checkpoints and starts writing the `-wal` file from the beginning
  again.
- The reader, in the bench's own process, keeps one connection open. On each wakeup it reads `PRAGMA data_version`;
  when it moved, it reads `events WHERE seq > last`. Latency is from the writer's commit to the row being read.
  - `poll-N`: wake every N ms.
  - `watch`: wake on each `fs.watch` event for the `-wal` file, plus a safety poll every 5 s.
  - `watch-settle`: as `watch`, plus one more check 20 ms after the last file event.
- 20 s per row. Reader CPU is the bench process's user plus system time, scaled to one minute.

```sh
nice -n 10 node bench.mjs --seconds 20
```

## Results

`PRAGMA data_version` costs **1.3 µs** per call (100,000 calls on one prepared statement).

| Mode | Other writers | p50 ms | p95 ms | max ms | Wakeups | Commits found only by the 5 s safety poll | Reader CPU ms/min |
|---|---|---|---|---|---|---|---|
| poll-250 | idle | 136 | 247 | 253 | 81 | — | 82 |
| poll-1000 | idle | 520 | 955 | 1,006 | 20 | — | 21 |
| watch | idle | 120 | 192 | 205 | 270 | **4** | 86 |
| watch-settle | idle | 20 | 23 | 24 | 277 | 0 | 164 |
| poll-250 | sync-like writer | 122 | 240 | 252 | 81 | — | 89 |
| poll-1000 | sync-like writer | 540 | 976 | 999 | 20 | — | 24 |
| watch | sync-like writer | 11 | 20 | 42 | **24,375** | 0 | **862** |
| watch-settle | sync-like writer | 11 | 20 | 24 | 35,793 | 0 | 1,099 |

All rows, including `poll-50`, are in [results.md](results.md).

## What it showed

- **Polling `data_version` saw every commit of the other process.** No row was missed in any polling mode; the
  latency is half the interval on average and never more than one interval. That matches the SQLite docs: the value
  changes for commits "by any other connection", "including database connections in separate processes".
- **A file event alone is late or misses the last commit.** With an idle store, `watch` found the newest row only at
  the *next* commit (p50 120 ms here is the gap between commits), and 4 rows were found only by the 5 s safety
  poll. The `-wal` write is seen before `data_version` moves (inferred: the writer updates the shared-memory index
  after it writes the log, and writes to the memory-mapped `-shm` file raise no file event). One more check 20 ms
  later fixes it (`watch-settle`).
- **Watching is expensive while a sync runs.** Every write to the `-wal` file wakes the reader: 24,000–36,000
  wakeups in 20 s and 10–12 times the CPU of `poll-250`. A desktop that watches would spend 1.4–1.8% of one core
  during a sync to save about 110 ms.
- **The store changes far more often than anything a page shows.** With the sync-like writer, 228 of 405 `poll-50`
  wakeups saw a commit with no new event row. A signal that only says "the store changed" would make the desktop
  reload its pages all through a sync; a row per meaningful change avoids that.

Decision it fed: the reader polls `PRAGMA data_version` every 250 ms and reads an `events` table by sequence. No
file watching and no daemon.

## Not measured

- macOS and Windows. `data_version` is SQLite's own and should behave the same; file events (FSEvents,
  ReadDirectoryChangesW) were not tried.
- A real cli-core store and a real sync; the writers here are synthetic.
- Many readers at once (the desktop plus several agents), and a reader whose connection outlives a `store reset`
  that swaps the file.
- Battery and wakeups on a laptop at rest.
