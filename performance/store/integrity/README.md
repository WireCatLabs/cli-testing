# Store integrity harness: break the store on purpose

## Why it was run

On 2026-11-06 the owner's shared store (`wirecat.db`, one SQLite file that tg, max, memo, mail and wa write) was
found damaged: pages claimed by two tables, indexes with the wrong number of entries. The cause was one line in
cli-core: before every writable open, `openStore` appended an empty string to the store file with `writeFileSync`.
On Linux, closing any file handle drops every POSIX lock the process holds on that file, so a long-lived process
(`wa serve`) that opened the store a second time lost its SQLite locks without knowing it. Another program's close
then took the store for unused, checkpointed it and deleted `-wal` and `-shm`, and the long-lived process went on
writing into a deleted WAL until its own checkpoint copied stale pages over the file. cli-core 0.599.0 stopped
touching an existing store file, and 0.605.0 added a damage mark.

The question: can that damage be made on demand, on synthetic data, with the cli-core the CLIs ran then, and does
the current cli-core survive the same run? The harness is also the base for the next scenarios (concurrent
writers on mixed versions, killed processes, file operations during writes), which decide what else cli-core must
guard against before anything is called "hardening".

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk (ext4), Linux 7.0, Node 24.19.0 (SQLite 3.53.3),
  `sqlite3` shell 3.46.1 (Ubuntu package). The machine was running other test suites at the same time.
- cli-core from npm: 0.593.0 (what memo bundled on 2026-11-06) and 0.608.0 (current). Each is installed in its own
  folder under `/var/tmp/claude/store-harness/cores/<version>` on first use.
- Every run gets a new folder under `/var/tmp/claude/store-harness/runs/`: the store, a moved `HOME` and `XDG_*`
  folders, `MESSAGING_STORE` pointing at the run's store, and `DBUS_SESSION_BUS_ADDRESS=disabled:` on every child
  process. No real account, message or keyring entry is read.

| File | What it does |
|---|---|
| [`make-store.mjs`](make-store.mjs) | opens the store through the real `openStore` of the chosen cli-core and fills it through `saveMessages` with generated messages (20 000 by default, about 70 MB with the indexes) |
| [`writer.mjs`](writer.mjs) | one process in one role, writing through the store API; one ledger line per committed transaction, after the commit |
| [`check.mjs`](check.mjs) | the verdict, on a fresh connection after every writer has exited |
| [`run.mjs`](run.mjs) | makes the store, starts the scenario's writers as separate processes, keeps a copy of a broken store, writes `result.json` |
| [`scenarios/`](scenarios/) | one file per scenario: writers, roles, timing |
| [`T1-minimal.mjs`](T1-minimal.mjs) | the first reproduction from 2026-11-06, a dozen lines, no cli-core |
| [`closers.mjs`](closers.mjs) | which program's close deletes `-wal` and `-shm` under a process that lost its locks, and under one that kept them |
| [`recover.mjs`](recover.mjs) | runs cli-core's `store recover run` on a copy of a broken store a run kept, then the same checks |

Roles:

- `serve` — one open for its life, plus a second `openStore` every *k* batches that writes a batch and closes, as
  `withStore` did inside a long-lived server before one connection per process.
- `sync` — open, write one batch, close, sleep with jitter: a timer-driven sync run.
- `reader` — read-only open and close.
- `sqlite3` — the `sqlite3` shell running `SELECT count(*) FROM messages`, as a person or an agent looking at the
  store does.

Checks, in order: `PRAGMA quick_check`, `PRAGMA integrity_check`, the FTS5 `integrity-check` command on every FTS5
table (25 in schema 52), the vector index (skipped: the generator writes no vectors yet), then the ledger: every
committed id must be in the store and no id beyond them. Verdict: **broke** when a check fails or a writer saw
"malformed"; **lost** when the checks pass but committed rows are missing; **ok** otherwise.

```sh
cd performance/store/integrity
node run.mjs T1 --core 0.593.0          # the cli-core of the incident
node run.mjs T1 --core 0.608.0          # the current one
node T1-minimal.mjs                     # no cli-core at all
```

`run.mjs` refuses more than 6 writers and starts only with 150 MB per writer plus 4 GB available.

## T1: a second open in a live process while others open and close

`serve` (batches of 20 every 300 ms, a second open every 10 batches), three `sync` writers (batches of 50,
1.5 s ± 50 % apart), one `sqlite3` reader (3 s ± 50 % apart), 60 s, on a fresh 20 000-message store.

Three runs per cli-core, one after another, 2026-11-08:

| cli-core | verdict | runs | second opens in `serve` | first writer error | `quick_check` and FTS5 check | writer errors |
|---|---|---|---|---|---|---|
| 0.593.0 | **broke** | 3 of 3 | 1–2 before the damage | 5–8 s after `serve` opened | failed in all 3 | "database disk image is malformed" in every `sync` writer; "disk I/O error" in `serve` (2 of 3) |
| 0.608.0 | ok | 3 of 3 | 17–18 | none | passed in all 3 | none; 9 530–9 880 committed rows, none missing |

A broken run's `quick_check` reads like the owner's store did: `2nd reference to page …`, `Rowid … out of order`,
`wrong # of entries in index messages_by_time` (and four other indexes), `fts5: corruption found reading blob … from
table "message_words"`.

Control, `T1-node-closers` (T1 without the `sqlite3` reader), on 0.593.0: **ok**, with 18 second opens and 9 800
rows committed. Three earlier tuning runs without the shell on 0.593.0 were ok too.

`T1-minimal.mjs` (no cli-core) broke as on 2026-11-06: `Tree 3 page 3 cell 0: invalid page number 2904`.

```sh
node run.mjs T1-node-closers --core 0.593.0
```

## What it showed

- **The damage is reproducible in about 6 s** on the cli-core of the incident, and the current cli-core survives the
  same run with 17–18 second opens. The lock drop itself is visible in `/proc/locks`: after the first
  second open, the `serve` process holds no lock on the database file, only its `-shm` locks.
- **In this setup, only the `sqlite3` shell's close deleted the WAL** (see [Which close deletes the
  WAL](#which-close-deletes-the-wal)). The fix does not depend on which program it was: with 0.608.0 no lock is lost,
  so no close can delete a WAL that is still in use.
- **The ledger is not meaningful on a broken store**: counts through damaged indexes come back too high or too low,
  so `missing` is reported but the verdict is `broke` from the checks alone.
- The first tuning runs were ok on 0.593.0 for a second reason: a fast `serve` checkpoints often, and SQLite skips
  the checkpoint-on-close (and with it the deletion) when the file changed since the closer last read it. The
  incident's `wa serve` wrote rarely; T1's `serve` writes a batch every 300 ms.

## Which close deletes the WAL

The plan's first account of the incident said a Node close after `wal_checkpoint(TRUNCATE)` deleted the WAL. T1 did
not break without the `sqlite3` reader, so each closer was tried on its own. One process opens a small WAL store and
keeps it open; a second program opens it, does one thing and closes; the script then looks for `-wal` and `-shm`.
Every closer runs twice: once after the first process lost its locks to `writeFileSync(path, "", { flag: "a" })`,
the 0.593.0 bug, and once with its locks kept.

```sh
node closers.mjs
```

2026-11-08, Node 24.19.0 (SQLite 3.53.3), Bun 1.3.14 (SQLite 3.53.0), `sqlite3` shell 3.46.1:

| Closer | Holder lost its locks | Holder kept its locks |
|---|---|---|
| Node: open and close, a `SELECT`, an `INSERT`, an `INSERT` then `wal_checkpoint(PASSIVE)` or `(TRUNCATE)` | WAL kept | WAL kept |
| Bun: an `INSERT` | WAL kept | WAL kept |
| `sqlite3` shell: a `SELECT` or an `INSERT` | **WAL and shm deleted** | WAL kept |

What this does and does not show:

- Measured: on this machine only the older shell deletes the files, and only when the holder has lost its locks.
  With the locks kept, nothing deletes them.
- Inferred, not shown: that on 2026-11-06 a program with an older SQLite (the shell or another tool) opened the
  owner's store and its close deleted the WAL under `wa serve`. Nothing logged which program opened the file that
  day; the CLIs' own Node closes did not delete it in any run here. Why SQLite 3.53 holds back where 3.46.1 does not
  was not found out.

## R1: recover a broken store

On 2026-11-07 the owner's store was rebuilt with `store recover run` (cli-core 0.599.0 and later): it copies the
readable rows with the `sqlite3` shell's `.recover`, refills every FTS5 and vector index, checks the copy and swaps it
in. That run was on real data and cannot be repeated. R1 runs the same function on the three stores T1 broke.

```sh
node recover.mjs /var/tmp/claude/store-harness/runs/T1-0.593.0-<stamp> --core 0.608.0
```

It copies the run's `kept/` store into a new folder beside it and never writes the kept file. The `.recover` step
used the `sqlite3` shell 3.46.1. After the recovery the indexes are new, so the ledger count is meaningful again.

| Broken run | Recovery time (copy, rebuild, check) | Rows the recovery reported lost | Checks after | Messages the writers committed during T1 / missing after |
|---|---|---|---|---|
| 1 | 4.0 s (1.0, 2.6, 0.4) | none | all pass, 25 FTS5 tables | 970 / 50 |
| 2 | 4.0 s (0.9, 2.7, 0.4) | 97 messages, 97 involvements | all pass, 25 FTS5 tables | 1 490 / 250 |
| 3 | 4.7 s (1.1, 2.8, 0.8) | none | all pass, 25 FTS5 tables | 910 / 50 |

- The recovery makes a sound file every time: `quick_check`, `integrity_check` and every FTS5 check pass.
- It does not bring back what the damage already destroyed: 50 to 250 committed messages are gone, and in two of
  three runs the recovery reported none lost. It counts rows before and after its own copy, so rows that a stale
  checkpoint overwrote before the recovery never show up. On 2026-11-07 the 31 lost emails were found by their ids,
  not by this count.

## What can happen again

- **A program that drops the store's locks.** Any code that opens and closes its own handle on `wirecat.db` in a
  process that also holds a SQLite connection to it drops that connection's locks on Linux: `writeFileSync`,
  `readFileSync`, `copyFileSync`, a hash of the file, a backup that reads it with `fs`. cli-core no longer does it in
  `openStore`; new code in any CLI or script can do it again. T1 catches it.
- **An older SQLite next to a process without locks.** Opening the live store with the `sqlite3` shell 3.46.1 is safe
  while every process keeps its locks (table above), and deletes the WAL as soon as one does not. Copy the store with
  `store backup`, `node:sqlite` `backup()` or `.backup` on a copy, not with a shell on the live file, when in doubt.
- **A contentless FTS5 table cannot be rebuilt in place.** SQLite refuses `rebuild` on a table with `content=''`
  ("'rebuild' may not be used with a contentless fts5 table"), and 22 of the 25 FTS5 tables in a new store are
  contentless. A damaged one is fixed only by refilling it from its source rows, which `store recover run` does; a
  hand-written repair script that runs `rebuild` cannot fix them.
- **The recovery's "lost" count misses rows lost before it.** After any damage, compare ids or counts with a backup
  or the source (the mail server, the messenger), not only the recovery's report.

## Not measured

- Vectors: the generator writes none, so the vec0 check is skipped. S4 adds chunks and embeddings.
- Bun as the writer's runtime, other SQLite builds than the two above, mixed cli-core versions in one run.
- Killed processes, power cuts, disk full, file operations during writes: scenarios T2–T16 of the plan.
- The one-connection-per-process change (P2) on its own: the harness calls `openStore` twice itself, so T1 tests
  that a second open keeps the first one's locks, not that a CLI avoids the second open.
