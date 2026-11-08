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
- **In this setup, only the `sqlite3` shell's close deleted the WAL.** With the lock dropped, a close in Node 24.19
  (SQLite 3.53.3) or Bun 1.3.14 (SQLite 3.53.0) left `-wal` and `-shm` in place, even after an explicit
  `wal_checkpoint(TRUNCATE)`; the `sqlite3` shell 3.46.1, even for a plain `SELECT`, deleted both. Why the newer
  SQLite holds back was not found out. So the CLIs alone probably did not trigger the 2026-11-06 deletion on this
  machine; something with an older SQLite opened the store. The fix does not depend on which one: with 0.608.0 no
  lock is lost, so no close can delete a WAL that is still in use.
- **The ledger is not meaningful on a broken store**: counts through damaged indexes come back too high or too low,
  so `missing` is reported but the verdict is `broke` from the checks alone.
- The first tuning runs were ok on 0.593.0 for a second reason: a fast `serve` checkpoints often, and SQLite skips
  the checkpoint-on-close (and with it the deletion) when the file changed since the closer last read it. The
  incident's `wa serve` wrote rarely; T1's `serve` writes a batch every 300 ms.

## Not measured

- Vectors: the generator writes none, so the vec0 check is skipped. S4 adds chunks and embeddings.
- Bun as the writer's runtime, other SQLite builds than the two above, mixed cli-core versions in one run.
- Killed processes, power cuts, disk full, file operations during writes: scenarios T2–T16 of the plan.
- The one-connection-per-process change (P2) on its own: the harness calls `openStore` twice itself, so T1 tests
  that a second open keeps the first one's locks, not that a CLI avoids the second open.
