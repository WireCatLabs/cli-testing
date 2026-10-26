# Table row counts and sizes for the Storage page

## Why it was run

WireCat Desktop's Storage page showed one line about the shared store. The owner asked to "add basic explorer
there to at least see tables and row count/sizes", and for the database's own facts: migration version, free
space, any issues. The desktop app never opens the file itself, so the CLI answers. That became
`store tables list` and new fields in `store info` in WireCatLabs/cli-core#1967.

The question: can the page show these live, on every load? A research run had already timed a plain
`SELECT name, sum(pgsize) FROM dbstat GROUP BY name` at 39 s on the real store. The answer decided which facts go
into `store info` (called on every page load), which go into a separate `store tables list`, and which sit behind
`--full` or a button.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0 with SQLite 3.53.3
  (`node:sqlite`).
- Code: cli-core `feat/store-tables` at `0f361f03`, built with `pnpm build`. The branch was then rebased as
  `e0224806`; the rebase changed nothing under `src/store` or `src/cli/messenger`.
- Data: a copy of the owner's real store, deleted after the run. 3.2 GB, schema 29, 208 tables: 93 data,
  2 internal (`schema_migrations`, `store_settings`), 29 search indexes and 84 search-index parts. Only these
  totals and the timings are published here.
- [`bench.mjs`](bench.mjs) copies the store into a temporary directory, makes the copy read-only, and runs the
  commands through the build's own `run` and `storeCommand`, as cli-core's tests do. It then times the raw SQL
  directly with `node:sqlite`. Run it while nothing writes to the store: it copies the file and its `-wal` one after
  the other. It prints totals only (no table names, row counts or paths) and deletes the copy.

```sh
node bench.mjs <cli-core checkout with dist> <store file> [warm repeats]
```

The numbers below are from runs made while building the PR, by hand and by earlier versions of the same steps.
`bench.mjs` was written afterwards to repeat them, and was checked only on a synthetic store. Two rows differ
from what it runs:

- The first implementation's exact query was not kept. The script times two joins with `dbstat` on the inner
  side, one on `name =` alone and one on "the table or one of its indexes" (an `OR`), and prints each query plan.
- The 39 s `GROUP BY` comes from the earlier research run, whose page-cache state was not recorded.

"Cold" means the first run after other work had pushed the file out of memory. Nothing dropped the page cache
(that needs administrator rights), so cold numbers depend on how much memory other programs held at that moment.

## Results

| What | Cold | Warm |
| --- | --- | --- |
| Copy the store | 14.8 s | — |
| `store info` with the new facts (journal mode, pages, migration history, last backup) | 74 ms | — |
| `store tables list` (95 row counts) | 4.5 s | 40 ms |
| `store tables list --full` (sizes from `dbstat`, read once) | 3 s – 2 min | 0.8 s |
| Sizes, first implementation (`dbstat` inside a join) | — | 66 s |
| `SELECT name, sum(pgsize) FROM dbstat GROUP BY name` (research run) | 39 s, state unknown | — |
| `PRAGMA quick_check` alone | 15–21 s | 15–16 s |
| `PRAGMA integrity_check` alone | 9–18 s | — |
| `store check` whole | 90–100 s | — |

## What it showed

- **`store info` can stay live.** The new facts are header and small-table reads: 74 ms on a cold cache.
- **Row counts are live once the file is in memory, but not before.** 95 `count(*)` take 40 ms warm and 4.5 s
  cold. Search indexes are not counted: a row count of one is a scan of the whole index. This is why the tables
  are a separate command and not part of `store info`.
- **Sizes cannot be live.** `dbstat` reads every page of the file. Warm that is 0.8 s, cold it ranged from 3 s to
  2 min with memory pressure. Sizes stay behind `--full`, which the page calls on request.
- **`dbstat` inside a join can walk the whole file once per outer row.** The first implementation joined
  `dbstat` to the list of tables in SQL and took 66 s even with the file in memory. Reading `dbstat` once
  (`aggregate = 1`, one row per table or index) and adding each index to its table in JavaScript took 0.8 s on the
  same warm file. Which join does it depends on whether SQLite can hand `dbstat` the name. The query plans from
  `bench.mjs` (SQLite 3.53.3, synthetic store):
  - `d.name = s.name`: `SCAN d VIRTUAL TABLE INDEX 0x6`. Name and aggregate reach `dbstat`, so each outer row reads
    only its own b-tree. 16 ms against 2 ms read once.
  - `d.name = t.name OR d.name IN (… its indexes …)`: `SCAN d VIRTUAL TABLE INDEX 0x4`. Only the aggregate reaches
    `dbstat`, so each outer row walks every page of the file. 3.1 s on an empty store of 230 tables.

  In `dbstat`'s source the index number's bits are 1 schema, 2 name, 4 aggregate; the time difference agrees.
  66 s is far more than one walk of the real file (0.8 s), so the first implementation probably did not hand
  `dbstat` the name. Whether it had exactly this `OR` shape is not known.
- **Integrity checks are not for page load.** `quick_check` alone takes 15 s even warm; it reads every page and
  checks each one. `store check`, which runs it plus foreign keys, search indexes and schema, takes 90–100 s. It
  stays a command the user starts.

## Not measured

- The script's own run on the real store. Its numbers will differ from the table above, especially cold ones.
- A controlled cold cache. Nothing dropped the page cache between runs.
- Bun. Its SQLite is built without `dbstat`, so `--full` refuses there with a `configuration_error`.
- Other store sizes. Row counts grow with the number of rows; `dbstat` and the checks grow with the file size.
- The two join shapes in `bench.mjs` on the real store. Their plans and times above are from a synthetic store.
- A store under write load. All runs were on an idle, read-only copy.
