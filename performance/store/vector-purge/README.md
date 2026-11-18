# Dropping a rebuild's old vectors

## Why it was run

cli-core's linking-rules version went from 5 to 6 ([WireCatLabs/cli-core#3107](https://github.com/WireCatLabs/cli-core/pull/3107)):
a conversation no longer mixes the topics of a forum group. With a new version, every chat a user built before is
rebuilt. On a test store, rebuilding one large forum group took about an hour, and most of that time came after the new
build was already in place, while `purgeVectorHashes` checked each old chunk text: does a current chunk still have it,
and if not, drop its vectors.

The question: is that time in the two lookups the purge makes per text, and does using the right index remove it? It
decided [WireCatLabs/cli-core#3118](https://github.com/WireCatLabs/cli-core/pull/3118).

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Data: a copy of a real store (private; only totals here): 220,180 conversation chunks, 306,068 vectors of two models,
  one forum group of about 112,000 messages with 42,639 chunks after its rebuild.
- Code: cli-core with #3107's change, built into tg-cli. "Before" is the purge as it was; "after" adds #3118's change:
  - the candidates query joins on `+k.chunkable_type`, so SQLite uses `chunks_by_content_hash` and not the
    `(chunkable_type, chunkable_id, position)` index;
  - the vector delete names the model too, so it uses the `(model, content_hash)` key.
- Whole rebuild: the forum group rebuilt with an unchanged result, so the purge checks every one of its old chunk texts
  (about 42,600) and finds each still current. Timed with `/usr/bin/time`, load average 4 to 8:

  ```sh
  tg personal conversations links rebuild --chat <forum> --offline --timeout 120m --json
  ```

- The two lookups alone: [`bench.mjs`](bench.mjs) opens the store read-only and times both forms of each lookup over
  200 chunk texts, with their query plans. The delete is timed as the `SELECT` with the same `WHERE`, so the store is not
  changed.

  ```sh
  node bench.mjs <wirecat.db> 200
  ```

## Results

Whole rebuild of the forum group:

| code | time |
|---|---|
| before | 889 s, and 889 s on a second run |
| after | **52 s** |

The two lookups, per old chunk text:

| lookup | before | after |
|---|---|---|
| candidates (a current chunk with this text) | 19.7 ms, reads every conversation chunk | 0.13 ms, by `chunks_by_content_hash` |
| vectors of this text | 13.0 ms, reads the whole key | 0.01 ms, by `(model, content_hash)` |

## What it showed

- The time was in the lookups, not in writing the new build: at about 20 ms per text and 42,600 texts, the candidates
  query alone is about 14 minutes, close to the whole difference (889 s against 52 s).
- SQLite chose the type index because the join condition named `chunkable_type`. The unary `+` keeps the condition and
  takes the column out of index choice.
- The vector lookup by hash alone matters when a rebuild changes many chunks: in the first rebuild of this forum group
  (version 5 to 6, about 28,000 changed texts) each of those also paid about 13 ms.

## Not measured

- A rebuild that changes most chunks with the new code: the timed rebuilds left every text current, so the vector
  delete itself did not run; its lookup was timed with `bench.mjs` instead.
- Stores of other sizes. Before the change, the cost per text grew with every conversation chunk in the store; after,
  it should not.
- Bun.
