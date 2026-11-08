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
- cli-core from npm: 0.593.0 (what memo bundled on 2026-11-06), 0.608.0 (what mail, tg, max and wa bundle on
  2026-11-08), 0.611.0 (current when the S4 runs began) and 0.613.0 (current when they ended, the default). Each is
  installed in its own folder under `/var/tmp/claude/store-harness/cores/<version>` on first use.
- Every run gets a new folder under `/var/tmp/claude/store-harness/runs/`: the store, a moved `HOME` and `XDG_*`
  folders, `MESSAGING_STORE` pointing at the run's store, and `DBUS_SESSION_BUS_ADDRESS=disabled:` on every child
  process. No real account, message or keyring entry is read.

| File | What it does |
|---|---|
| [`make-store.mjs`](make-store.mjs) | opens the store through the real `openStore` of the chosen cli-core and fills it through the store API: messages (`saveMessages`), emails (`mail.saveThreads`), file notes (`notes.saveFileNote`) and a 16-dimension vector for every chunk, each through the embed step the CLIs use; the seed goes into the ledger too |
| [`lib.mjs`](lib.mjs) | the generators (messages, threads, notes, deterministic vectors) and the embed steps |
| [`writer.mjs`](writer.mjs) | one process in one role, writing through the store API; a ledger line before each transaction and one after its commit |
| [`check.mjs`](check.mjs) | the verdict, on a fresh connection after every writer has exited |
| [`run.mjs`](run.mjs) | makes the store, starts the scenario's writers as separate processes, runs the scenario's `drive` beside them, keeps a copy of a broken store, writes `result.json` |
| [`scenarios/`](scenarios/) | one file per scenario: writers, roles, timing, and for most S4 scenarios a `drive` that kills, starts or touches files on purpose |
| [`store-command.mjs`](store-command.mjs) | the real `store backup`, `store restore` and `store reset` of one cli-core, in a program of their own |
| [`p2-cli.mjs`](p2-cli.mjs) | P2 on an installed CLI: `<cli> mcp serve` on a synthetic store, tool calls, and how many descriptors the server holds on the store file |
| [`T1-minimal.mjs`](T1-minimal.mjs) | the first reproduction from 2026-11-06, a dozen lines, no cli-core |
| [`closers.mjs`](closers.mjs) | which program's close deletes `-wal` and `-shm` under a process that lost its locks, and under one that kept them |
| [`recover.mjs`](recover.mjs) | runs cli-core's `store recover run` on a copy of a broken store a run kept, then the same checks, and counts lost rows per table against the ledgers |
| [`gap.mjs`](gap.mjs) | compares two stores read only, per source account and day: what one holds that the other lacks; totals on stdout, per-chat ids only to a private file |

Roles that write like the real CLIs, table by table:

- `tg`: like `tg sync` / `max sync`: one open per run, a few pages of messages (`saveMessages`), then the embed step
  (`vectors.messagesToEmbed` and `saveMessageVectors`), then close.
- `mail`: like `mail sync`, with slices of threads saved with their resume point in one transaction
  (`mail.saveThreads` with sync states), some of its own emails marked deleted (`mail.markDeleted`, the contentless
  FTS5 delete path), then the embed step (`mail.chunksToEmbed` and `vectors.saveVectors`).
- `memo`: like `memo import`, with one transaction per file note (`notes.saveFileNote`), then the embed step.
- `serve` — one open for its life, plus a second `openStore` every *k* batches that writes a batch and closes, as
  `withStore` did inside a long-lived server before one connection per process. With *k* past the run's length it
  is a long-lived server after P2.

Roles that do one other thing: `sync` (open, one batch, close, the generic H0 writer), `reader` (read-only open and
close), `sqlite3` (the shell running a `SELECT`), `sqlite3-write` (the shell inserting rows itself),
`checkpoint` (a loop of `wal_checkpoint(TRUNCATE)`), `optimize` (FTS5 `optimize` on every full-text table) and
`long-read` (one read transaction held open for 20 to 30 s).

With `--mark yes` a writer prints `MARK batch`, `MARK begin` and `MARK commit` on stdout, so `drive` can kill it
inside a transaction: cli-core runs every write as `exec("BEGIN IMMEDIATE")` … `exec("COMMIT")` on `node:sqlite`'s
`DatabaseSync`, and the writer wraps that one method without changing cli-core. `--hold commit` also waits 300 ms
before the commit. `--trace-errors yes` records every SQLite error as SQLite raised it, before cli-core's own
handling can replace it.

Checks, in order: `PRAGMA quick_check`, `PRAGMA integrity_check`, the FTS5 `integrity-check` command on every FTS5
table (25), the vector index (per model, cli-core's own comparison of the vec0 index with the rows chunks and
embeddings derive, both ways, and the vec0 table against its rowid shadow table), then the ledger, per table
(messages, emails, notes, shell rows): every committed row must be in the store, no row beyond those begun, and a
batch whose writer was killed between its begin line and its commit line must be in the store whole or not at all
(`partial`). Verdict: **broke** when a check fails, a batch is partial or a writer saw "malformed"; **lost** when the
checks pass but committed rows are missing; **ok** otherwise. A negative control (7 emails deleted and 3 notes
renamed on a copy) came back `lost` with `emails: 7, notes: 3` missing.

```sh
cd performance/store/integrity
node run.mjs T1 --core 0.593.0          # the cli-core of the incident
node run.mjs T1 --core 0.611.0          # the current one
node T1-minimal.mjs                     # no cli-core at all
```

`run.mjs` refuses more than 6 writers, starts only with 150 MB per writer plus 4 GB available, and refuses to start
with under 5 GB free on the harness disk.

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

## S4: the other ways the store can be damaged

Slice S4 of the store integrity plan: scenarios T2 to T16, P2, and a T1 with the role writers. Each ran once per
cli-core (0.593.0, then 0.611.0) on 2026-11-08, on a fresh synthetic store of 5 000 messages, 1 000 emails and 200
notes (20 000 messages where noted), with a vector for every chunk. The store is a small one on purpose: it crosses
an auto-checkpoint every few seconds, which is what the scenarios need, and it keeps each run under 150 MB of disk.
Every command is run from this folder. A scenario's own file holds its writers and its timing.

cli-core 0.613.0 came out while the runs went on. Its store code differs from 0.611.0 only in mail enrichment
chunks (`transaction.js`, `migrations.js`, `open-store.js`, `recover.js` and the store commands are the same files),
and T1, T2, T3 and T11 on 0.613.0 came out as on 0.611.0: ok, ok with one "database is locked" at `migrate()`, ok
with 50 batches cut and none partial, ok with "cannot rollback" in place of the I/O error.

"Writer errors" are failures a writer saw and exited on. The store can be whole with them. **broke**, **lost** and
**ok** are the verdicts above.

| Id | What it does | 0.593.0 | 0.611.0 (current) | Rerun |
|---|---|---|---|---|
| T1 | the incident: a second open in a live `serve`, short writers and the `sqlite3` shell | broke, 3 of 3 (H0) | ok (0.608.0: 3 of 3, 0.611.0: 1 of 1) | `node run.mjs T1 --core <v>` |
| T1-roles | T1 with the tg, mail and memo writers | broke 2, lost 1, of 3 | ok | `node run.mjs T1-roles --core <v>` |
| T2 | tg ×2, mail ×2, memo and a reader, 120 s | ok, writer errors | ok, writer errors | `node run.mjs T2 --core <v>` |
| T2-mixed | tg on 0.593.0, mail on 0.608.0, memo on current, store made by 0.593.0 | ok: the older ones are refused once memo migrates | (one run for both) | `node run.mjs T2-mixed` |
| T3 | 50 × `kill -9` inside `BEGIN IMMEDIATE` | ok, 50 batches cut, none partial | ok, 50 cut, none partial | `node run.mjs T3 --core <v>` |
| T4 | 50 × `kill -9` of a `wal_checkpoint(TRUNCATE)` loop | ok | ok | `node run.mjs T4 --core <v>` |
| T5 | 10 × all five writers killed at once (power cut, first pass) | ok | ok | `node run.mjs T5 --core <v>` |
| T6 wal | `-wal` deleted under open writers | ok, while the long-lived writer lives | ok, same | `T6_VARIANT=wal node run.mjs T6 --core <v>` |
| T6 shm | `-shm` deleted under open writers | **broke**, 100 messages lost | **broke**, 100 messages lost | `T6_VARIANT=shm node run.mjs T6 --core <v>` |
| T6 swap | `-wal` replaced by another store's `-wal` | ok, 1 of 1 | **broke** 1 of 2 ("file is not a database"), ok 1 of 2 | `T6_VARIANT=swap node run.mjs T6 --core <v>` |
| T7 | copies taken while writing: `cp`, `cp` of all three files, `.backup`, `VACUUM INTO`, `store backup` | `cp` of the db alone **broke**, the rest whole | all five whole | `node run.mjs T7 --core <v>` |
| T8 | two more SQLite builds: writers on Node 22.23.2 and the `sqlite3` shell inserting rows | ok | ok | `node run.mjs T8 --core <v>` |
| T9 | the same store through a symlinked folder, a symlinked file and a relative path | ok | ok | `node run.mjs T9 --core <v>` |
| T10 | rsync puts a 10 s old copy of the db back over the live file | **broke** | **broke** | `node run.mjs T10 --core <v>` |
| T11 | disk full for one writer (`prlimit --fsize`) | ok | ok, the real error is replaced | `node run.mjs T11 --core <v>` |
| T12 | a migration (52 to 57) while 0.593.0 writes | ok: the 0.593.0 writers are refused after it | (one run for both) | `node run.mjs T12` |
| T12-kill | 20 × `kill -9` during the open that migrates | ok: 7 migrations killed and rolled back, the 8th finished | (one run for both) | `node run.mjs T12-kill` |
| T13 | 5 × `store backup` while four writers write | ok, 5 whole backups | ok, 5 whole backups | `node run.mjs T13 --core <v>` |
| T14 | 4 mail writers inserting and deleting, FTS5 `optimize` from a fifth | ok | ok | `node run.mjs T14 --core <v>` |
| T15 restore | `store restore` while a `serve` and short syncs have the store open | ok: refused while held, swapped in a gap, nothing lost after | ok, same | `T15_VARIANT=restore node run.mjs T15 --core <v>` |
| T15 reset | `store reset --no-backup`, the same | ok: refused 41 times, never ran | ok: refused 41 times, an earlier run reset in a gap, nothing lost after | `T15_VARIANT=reset node run.mjs T15 --core <v>` |
| T16 | WAL growth with one 30 s `query_only` reader | 16 MB to 114 MB | 15.6 MB to 146 MB | `node run.mjs T16 --core <v>` |
| P2 | `memo mcp serve`: descriptors on the store file during 20 tool calls | not run | memo 0.131.59 (cli-core 0.610.0): at most 1 | `node p2-cli.mjs memo` |

Nothing an ordinary CLI does broke the current cli-core: concurrent writers, mixed versions, killed writers,
killed checkpoints, killed migrations, two other SQLite builds, other paths, a full disk, backups, FTS5 `optimize`
and `store restore`. What broke it was another program changing the store's own files (T6 shm and swap, T10), and
on 0.593.0 also a `cp` of the live file (T7), which is a copy, not the store. No P5 change is asked for by a
cli-core failure. The findings below are the gaps.

### T1-roles: the incident with the role writers

T1's `serve` (a second open every 10 batches) and `sqlite3` shell, with tg, mail and memo writers in place of the three
`sync` writers, on 20 000 messages, 60 s. On 0.593.0: two runs **broke** (one with every check failing, one with checks
passing but a writer that read "malformed"), one **lost**: every check passed and 80 committed messages were gone, the
rows the `serve` wrote into the WAL another close had deleted. On 0.611.0: ok, `serve` held 2 descriptors and kept its
locks. The lost rows per table are in [BUG-627](#bug-627-lost-rows-per-table-against-the-writers-own-ledgers).

### T1 on the current cli-core with the sqlite3 shell (FIND-2409)

The shell 3.46.1 deletes the WAL under a process that has lost its locks. T1 already runs that shell next to a
`serve` that opens twice, so it was rerun on 0.611.0 instead of a new scenario: ok, 27 870 messages committed, none
missing, every check passed.

### T2 and T2-mixed: concurrent writers, mixed versions

Why: five CLIs write one file at once, on three cli-core versions. Both cores: store ok, every committed row there.
But 1 to 3 of the 6 writers of every T2 run exited with "database is locked" (SQLite busy past `busy_timeout`, 5 s),
and so did one or two writers in runs of T4, T7, T8, T9, T11, T13 and T16. With `--trace-errors` the two places are:

- `migrate()` (`store/migrations.js:65`), run by every writable open even when nothing is to migrate, takes
  `BEGIN IMMEDIATE` with a plain `exec`, not through the retry loop of `transaction.js`, so a sync run whose open
  waits more than 5 s behind other writers fails before it writes anything.
- `mail.chunksToEmbed` (`store/sqlite/emails.js:569`, the embed step's read) first drains the email index, an
  `INSERT OR IGNORE INTO email_index_pending` outside any write transaction (`store/sqlite/email-index.js:121`).

A failed sync is run again by its timer, so no data is lost here. It is a run that fails under load. T2-mixed: once
memo (current) opened the 0.593.0 store and migrated it to schema 57, the 0.593.0 tg and reader were refused with
"the message store was written by a newer version (schema 57, needs at least 56; this one speaks 52)". Mail on
0.608.0 went on. That is the designed refusal, not damage.

### T3, T4, T5: killed writers, checkpoints, every writer

Why: SQLite promises a committed transaction survives `kill -9` and an uncommitted one leaves nothing. T3 kills a tg
writer (pages of 400 messages) 50 times: on even rounds while it waits 300 ms right before `COMMIT`, on odd rounds 0 to
40 ms after its `BEGIN IMMEDIATE`. Mail and memo go on beside it. T4 kills a loop of `wal_checkpoint(TRUNCATE)` 50 times
at random (120 checkpoints begun) while three writers grow the WAL. T5 kills tg ×2, mail, memo and a long-lived `serve`
all at once, 10 times. Both cores, all three: ok. T3 cut 50 batches and none was partial or landed. T5 cut 10 batches on
each core, none partial (on 0.611.0 one of them had committed just before its kill). A real power cut (data in the page
cache lost) was not made: that needs root for `dm-flakey` or a loop device.

### T6: another program deletes or replaces -wal or -shm

Why: a cleanup script, a sync client or a person removing "temporary" files. Deleted at 15 s into the run:

- `-wal`: new opens fail at once with "disk I/O error" (`SQLITE_IOERR_SHORT_READ`), so the short writers exit. The
  long-lived writer still holds the deleted WAL and checkpoints it at its close, so nothing was lost here. Had it
  been killed instead, the WAL's commits would be gone.
- `-shm`: new opens rebuild an index of the WAL the long-lived writer no longer agrees with: "malformed" in two
  writers and 100 committed messages lost, on both cores.
- `-wal` swapped for another store's: 0.611.0 broke in 1 of 2 runs with page 1 of the store overwritten ("file is
  not a database". The store cannot be opened at all), ok in the other. 0.593.0 ok in 1 of 1.

cli-core cannot stop another program. It could notice (P5 candidate, not asked for by a failure of its own): a
writer whose `-wal` path no longer names the file it has open is writing into a dead file.

### T7 and T13: copies of a live store

Why: the owner copies the store for a backup or a test. T7 takes five copies 2 s apart while four writers write and
checks each one alone (the ledger cut 1 s before the copy began). On 0.611.0 all five were whole. On 0.593.0 the
`cp` of the db file alone was **broke** (`quick_check` failed): the copy caught a checkpoint halfway. `cp` of all
three files, `sqlite3 .backup`, `VACUUM INTO` and `store backup` were whole in both. T13 runs `store backup` five
times beside four writers: 0.5 to 1.2 s each, every backup whole, the writers kept writing.

### T8 and T9: other SQLite builds, other paths

T8 adds a tg and a memo writer on Node 22.23.2 and the `sqlite3` shell 3.46.1 inserting 50 rows at a time into
`messages` (its rows fire the same triggers): ok on both, 950 and 1 300 shell rows, none missing. One shell batch
gave up after its own 5 s timeout. T9 writes the same store through its real path, a symlinked folder, a symlink to
the file and a relative path, with the shell reading through the file symlink: ok on both. Every writer held one
descriptor on the one real file, so SQLite met on one lock set.

### T10: a sync client puts back an old copy

rsync replaces the live db file with a copy taken 10 s earlier, as a sync client resolving a conflict does: broke on
both cores within a second ("malformed", `quick_check`, `integrity_check` and every FTS5 check fail). The store must
not live in a synced folder.

### T11: disk full

Without root there is no small disk, so one tg writer at a time runs under `prlimit --fsize` 2 MB above the store's
size. 5 rounds. Store ok on both. The writer's write past the limit fails with "disk I/O error"
(`SQLITE_IOERR_WRITE`, 778), SQLite rolls the transaction back itself, and then cli-core's own `ROLLBACK`
(`store/sqlite/transaction.js:91`) fails with "cannot rollback - no transaction is active", and that error, not the
I/O error, is what the caller gets. A full disk would most likely read the same way (`SQLITE_FULL` also rolls back);
that was not measured.

### T12 and T12-kill: migrations under load

T12: a 0.593.0 store (schema 52) with 0.593.0 tg and mail writing. At 5 s a current writer opens it, migrates to 57
and writes. The 0.593.0 writers are refused from then on (designed). Store ok. T12-kill: a current writer is killed
20 times on its 1st to 3rd `BEGIN IMMEDIATE` of the first open of a 20 000-message 0.593.0 store. 7 kills landed
inside the migration, which rolled back each time (schema stayed 52). The 8th open finished it (57), and the store
was ok.

### T14: contentless FTS5 under concurrency

Four mail writers save threads and mark their own emails deleted (the delete trigger of the contentless
`email_words` and `email_stems`), a fifth runs FTS5 `optimize` on all 25 tables every 1.5 s: ok on both, 46 600 to
48 500 emails, every FTS5 check passed.

### T15: store restore and store reset while the store is open

The real commands of each cli-core, through [`store-command.mjs`](store-command.mjs). While a `serve` holds the store
both refuse ("the store is open in process …"). With only short syncs (one every 150 to 300 ms) the command was retried
until it ran: `restore` ran after 5 refusals in a row (0.593.0) and 10 (0.611.0), and no row committed after the swap
was missing. The replaced store was set aside whole. `reset` was refused 41 times on both. In an earlier run on 0.611.0
it ran, and nothing committed after it was lost. The window between the check for holders and the rename exists, but no
sync was seen to fall into it in these runs.

### T16: a long reader

A measurement: 30 s of three writers, then 30 s more with one read transaction held open (as a long search or an open
`query_only` reader does). The WAL cannot be reset behind the reader: its largest size went from 15.6 MB to 146 MB on
0.611.0, and from 16 MB to 114 MB on 0.593.0. Not a break. On the owner's 6 GB store the same reader holds the WAL as
long as it reads.

### P2: one process never opens the store twice

[`p2-cli.mjs`](p2-cli.mjs) starts an installed CLI's `mcp serve` on a synthetic store, makes tool calls that read
and write (`notes list`, `search all`, `memories list`, `notes add`, five rounds) and samples
`/proc/<pid>/fd` every 25 ms. memo 0.131.59 (cli-core 0.610.0): 20 calls, at most 1 descriptor on the store file,
none between calls. tg, max, mail and wa refuse `mcp serve` without a set-up profile ("name a profile"), and a
profile needs the owner's login, so P2 on them was not run here. In the harness itself every writer except `serve`
(which opens twice on purpose) held at most 1.

## R1: recover a broken store

On 2026-11-07 the owner's store was rebuilt with `store recover run` (cli-core 0.599.0 and later): it copies the
readable rows with the `sqlite3` shell's `.recover`, refills every FTS5 and vector index, checks the copy and swaps it
in. That run was on real data and cannot be repeated. R1 runs the same function on the three stores T1 broke.

```sh
node recover.mjs /var/tmp/claude/store-harness/runs/T1-0.593.0-<stamp> --core 0.611.0
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

### BUG-627: lost rows per table against the writers' own ledgers

Rerun on 2026-11-08 with cli-core 0.611.0's `recoverStore`, on the three T1 stores above and on three stores
[T1-roles](#t1-roles-the-incident-with-the-role-writers) broke on 0.593.0 (writers tg, mail, memo, a `serve` that
opens twice and the shell). "Committed" counts every row the ledgers say was committed, the seed included. "Missing
after" is what the recovered store lacks of them. "reported" is what `recoverStore` itself put in `lost` for that
table (its `before` minus `kept`).

| Broken run | Table | Committed | Missing after recovery | Recovery reported lost | Whose rows |
|---|---|---|---|---|---|
| T1 run 1 | messages | 20 970 | 50 | 0 | one `sync` writer, one batch committed 0.3 s before the first "malformed" |
| T1 run 2 | messages | 21 490 | 250 | 97 | three `sync` writers, batches committed 0.3 to 2.3 s before the first "malformed" |
| T1 run 3 | messages | 20 910 | 50 | 0 | one `sync` writer, one batch 0.1 s before the first "malformed" |
| T1-roles run 1 | messages | 30 020 | 60 | 0 | the `serve` writer, batches committed 0.3 to 1.0 s before its own "malformed" |
| | emails, notes | 4 800, 1 400 | 0, 0 | 0, 0 | |
| T1-roles run 2 | messages | 21 540 | 300 | 0 | one `tg` writer, three pages committed 0.3 to 0.7 s before the first "malformed" |
| | notes (`documents`) | 320 | 40 | "uncounted" (`before` is null: the damaged file could not count the table) | the `memo` writer, the last 0.1 to 0.2 s |
| | emails | 1 400 | 0 | 0 | |
| T1-roles run 3 | messages | 30 540 | 80 | 0 | the `serve` writer, batches of its last 1.0 s before its "disk I/O error" |
| | emails, notes | 4 100, 1 200 | 0, 0 | 0, 0 | |

T1-roles run 3 is a case of its own: every check passed on the store as the writers left it (verdict **lost**, not
broke), so nothing would have called for a recovery at all. The 80 rows were in the WAL the `serve` writer kept
writing after another close had deleted it. They never reached the database file.

What the numbers show:

- Every one of the six recoveries left committed rows out (50 to 300 messages, 40 notes), and its own report named
  them in none of the six: five times it reported nothing for the table, once 97 of 250.
- The rows lost are the newest commits of the writers that were not the stale one, or of the stale writer itself,
  in the last 0.1 to 2.3 s before a writer first saw the damage. The damaged file never held them (they were overwritten
  by the stale checkpoint, or stayed in a deleted WAL), so a count of the damaged file before the copy, which is what
  `recoverStore` compares against, cannot miss them either.
- So `lost` in a recovery is "rows `.recover` could not read from the damaged file", not "rows the store should
  hold". Only a record of what was committed (the run records of plan §5, O1) or the source can tell the rest.

```sh
node run.mjs T1-roles --core 0.593.0                       # breaks the store: 2 of 3 broke, 1 of 3 lost
node recover.mjs /var/tmp/claude/store-harness/runs/T1-roles-0.593.0-<stamp> --core 0.611.0
# result.json in the new recover-* folder: lost_by_table, recovery.lost, after.ledger.tables.*.missing_by_writer
```

### gap.mjs: what a real store lacks against an older copy

Why: after a recovery the owner wants to know whether the store lost messages, mail or notes, and which sources
to fetch again. `recoverStore`'s own count cannot say (above), but a copy taken before the recovery can say part of
it. `gap.mjs` reads both stores read only and prints, per table (messages, emails, documents, records, notes,
memories, facts, tasks, decisions), source account and UTC day: rows in each, rows only in A, rows only in B, and
how many chats or mailboxes the missing rows are in. Accounts are labelled `telegram 1`, `email 2` and so on, never
by their ids. It walks every table by rowid and skips what a damaged page will not give up, printing the skipped
range, so the damaged copy itself can be side A. Rows are matched by their source ids (account, chat and message
id; account and email id), not by store ids, so a store whose ids moved still compares.

```sh
node gap.mjs "file:/path/wirecat-corrupt.db?immutable=1" ~/.local/share/WireCat/wirecat.db \
  --from 2026-11-01 --to 2026-11-08 --detail /var/tmp/claude/<yours>/detail.json   # exits 1 when A has rows B lacks
```

`--detail` writes the store ids of each missing row, grouped by chat or mailbox, to a file with mode 600; keep it
out of any repository. `?immutable=1` is for a copy nothing writes to; for the live store give the plain path, which
opens it read only. A synthetic control (100 messages in two chats and 20 emails; 10 messages and 1 email removed
from B) came back with 10 and 1 missing, 2 chats and 1 mailbox, and exit code 1.

What it cannot see: rows the damaged file never held (the BUG-627 rows). For those, the only check is the source:
run the CLI's sync over the window and count what it saves (`mail <profile> sync --rescan --since-time …` reports
`saved` against `already_stored`).

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
- **A writer fails under load before it writes.** With five or six writers, one sync run in a few waits more than
  `busy_timeout` (5 s) and exits with "database is locked": at the `BEGIN IMMEDIATE` of `migrate()`, which every
  writable open runs and which skips the retry loop, or at the write inside `mail.chunksToEmbed`. The timer runs it
  again. Nothing is lost, but the run fails.
- **A failed write reports the wrong error.** When SQLite rolls a transaction back itself (an I/O error, and most
  likely a full disk), cli-core's own `ROLLBACK` throws "cannot rollback - no transaction is active" and the caller
  never sees the real cause. Anything that classifies failures by their message (the damage mark, a retry) is misled.
- **Another program changing the files.** Deleting `-shm`, replacing `-wal`, or putting an older copy of the db back
  (a sync folder) breaks the store whatever cli-core does. Deleting `-wal` costs the commits in it as soon as the last
  process that holds it ends without its checkpoint. A `cp` of the live db file alone can be torn.
- **A long reader holds the WAL.** One open read transaction let the WAL grow nine times in 30 s (T16).

## Not measured

- A real power cut or a lost disk write: T5 kills processes only, and the page cache survives it. A loop device
  with `dm-flakey` needs root.
- A disk that is really full (`SQLITE_FULL`): T11 uses a per-process file-size limit, which SQLite reports as an I/O
  error.
- Ten-minute runs: the plan asks for T2 over 10 min. These ran 1 to 2.5 min each, once per cli-core (T1-roles three
  times on 0.593.0, T6 swap twice on 0.611.0). A scenario that came out ok once can still break on another run.
- The owner's 6 GB store, and stores bigger than about 130 MB.
- P2 on tg, max, mail and wa: their `mcp serve` needs a set-up profile, which needs the owner's login. The `serve`
  of the messenger CLIs was not run either.
- Bun as the writer's runtime. Cli-core 0.567.0 and 0.569.0 (the plan's mixed versions of 2026-11-06), which use the
  same `openStore` line as 0.593.0.
- `store recover run` on the T6 and T10 stores.
