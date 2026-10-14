# List filters on names in any script

## Why it was run

List queries such as `tasks list title:…`, `attachments list name:…` and `meetings list title:…` compared
`lower(column)` with the lower-cased value. SQLite's built-in `lower()` folds ASCII letters only, so a name in
Cyrillic, Greek or with accents matched only when typed exactly — and not even then, because the value was
lower-cased in JavaScript while the column was not. The CLI standards plan (slice S5b) asked for one case
normalisation for every script, stored or computed, the simplest that is correct and can use an index.

A function registered with SQLite was ruled out first: `bun:sqlite` has no user-defined functions (checked on
Bun 1.3.14), and cli-core runs on Node and Bun. The question left: what does a stored `fold()`ed copy cost to
fill, and how do the filters compare with it? It decided store migration 8 in cli-core.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Code: cli-core `feat/a2-s5b-query-fold` at `9dd1ef40`, merged as `206a4a7a` (WireCatLabs/cli-core#1147), built with
  `pnpm build`.
- Data: synthetic only. [`bench.mjs`](bench.mjs) opens an empty store through the build's `openStore` (schema 8),
  writes 100,000 `attachments` rows with names made of mixed-case Cyrillic, Latin with accents and Greek words, and
  leaves their folded copies empty, as a file stored before version 8 has them.
- Fill: the build's `fillFolded`, which migration 8 runs after its statements, timed in one transaction.
- Filters: each case 11 times, median reported, over `count(*)`. "before" is the SQL the filter compiled to until
  now (`IFNULL(lower(name) = ?)`, `IFNULL(lower(name) LIKE ?)`); "after" is the new one
  (`name_folded IS NOT NULL AND name_folded = ?` or `GLOB ?`, over an index on `name_folded`).

```sh
node bench.mjs <cli-core checkout with dist> 100000
```

## Results

Fill of 100,000 rows: **549 ms** (473 ms on a first run).

| case | query | before | matched | after | matched |
|---|---|---|---|---|---|
| exact name, typed as stored | `name:"Отчёт Café 1.pdf"` | 11.06 ms | 0 | <0.01 ms | 1 |
| exact name, ASCII only | `name:"plan budget 2.pdf"` | 11.25 ms | 1 | <0.01 ms | 1 |
| prefix in another case | `name:ОТЧЁТ*` | 12.87 ms | 0 | 1.11 ms | 25,868 |
| prefix with an accent dropped | `name:cafe*` | 12.68 ms | 0 | 0.63 ms | 16,797 |
| contains | `name:*книга*` | 16.20 ms | 0 | 6.06 ms | 16,134 |

## What it showed

- Correctness, not speed, was the problem: every non-ASCII case matched nothing before, an exact Cyrillic name
  included. After, case, accents, `ё` and `й` fold as message search folds them.
- Exact names and prefixes now use the index (`GLOB` with a literal prefix; the condition is written so it can
  never be NULL, because an `IFNULL` around it keeps SQLite from using the index). A pattern that starts with `*`
  still reads every row, and is still faster than `lower()` on every row.
- Filling a 100,000-row table at upgrade takes about half a second, inside the migration's transaction.

## Not measured

- The size the copies add to the file (one short text per row).
- Bun: the fill and the filters are plain SQL plus one JavaScript `fold()` per written row.
- Tag names and note bodies, which still compare with `lower()`.
