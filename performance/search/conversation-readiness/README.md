# Conversation search: the readiness check read every chunk of the store

Measured 2026-11-16 for [cli-core#3002](https://github.com/WireCatLabs/cli-core/pull/3002)
([issue #3001](https://github.com/WireCatLabs/cli-core/issues/3001)).

## Why we ran it

One `tg <profile> search conversations "<question>"` took 12–14 s on the owner's store with a warm disk cache, and 41 s
cold. The vector search itself took under 2 s. A CPU profile put 11.3 s of 12.9 s in a single synchronous statement
in cli-core's `readiness`. That statement runs for every built chat on every search. Its only job is the hint "this
chat changed since the last build".

The question: is an index missing, or does SQLite read the tables in the wrong order? The answer decided between a
store migration and a query change.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux, Node 24.19.0 (`node:sqlite`, SQLite 3.53.3). cli-core bundles SQLite 3.53.4,
  and the plans were the same.
- Data: the owner's store, opened read only. Totals only: 10 built chats, 953,275 messages, 261,794 chunks. No
  planner statistics (`sqlite_stat1` absent): cli-core never runs `ANALYZE`.
- Queries: the `pending` and `vectors` statements of `readiness` in cli-core 0.672.0 ("before"), and the same
  `vectors` statement with `CROSS JOIN` starting from the chat's conversations and from the changed messages
  ("after"). `pending` did not change.
- Command: `node bench.mjs <wirecat.db> openai:text-embedding-3-small:768 3` ([bench.mjs](bench.mjs)). It prints
  totals, the time for all 10 chats per run, whether the plan searches `chunks` by `chunkable_type` alone, and a hash
  of the answers.

## Results

| query | chunks searched store-wide | 3 runs, all 10 chats | answers (hash) |
| --- | --- | --- | --- |
| `pending` (unchanged) | no | 696 / 794 / 660 ms | `9f0bd946b8dd` |
| `vectors`, before | yes | 9463 / 9453 / 9369 ms | `5c71d391093c` |
| `vectors`, after | no | 728 / 796 / 727 ms | `5c71d391093c` |

End to end, `search conversations` with tg 0.131.0, warm, `meta.duration_ms` over 3 runs: before 12016 / 12035 /
12442. With the same change patched into tg's bundle: 3657 / 3252 / 2611. The hits and the `missing` / `next` hint
were byte-identical.

## What it showed

- Every index the queries need was there. Without statistics SQLite started from `chunks` and searched it by
  `chunkable_type = 'conversation'` alone. That reads every chunk of the store, once per chat. In the `stale` CTE it
  then range-scanned the chat's messages for each of those chunks.
- `CROSS JOIN` makes SQLite keep the written order. The result is the same plan on every store, with nothing
  written. `ANALYZE` would write to the owner's store, and its plan would vary from store to store.
- The `vectors` query got about 13 times faster with the same answers.

## What was not measured

- A cold disk after the change.
- Readiness is still linear in a chat's messages: `pending` and the `changed` CTE read each message once, about
  0.7 s in total here. Making it depend only on what changed needs a store migration (indexes or stored counts).
- A synthetic store. Without statistics the plan does not depend on the data, and cli-core's plan test checks it on an
  empty store.
