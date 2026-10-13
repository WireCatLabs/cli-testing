# Vector search time as the number of vectors grows

## Why we ran it

The owner asked whether keeping every kind of vector (messages, mail, notes, documents, and soon tags) in one
`embeddings` table makes search slow at large volume, and when a vector belongs in a column of a main table
instead. cli-messaging searches vectors by reading the ones in scope from SQLite in pages of 5,000 and comparing
each with the query (`nearestChunks`, `src/store/sqlite/vectors.ts`). The question: how long that takes as the
number of vectors in scope grows. It fed the [embedding registry plan](https://github.com/WireCatLabs/cli-messaging/blob/docs/backlog-search-followups/docs/dev/embedding-registry-plan.md).

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), Node 24.19.0, `node:sqlite`, one thread.
- Random 384-dimension Float32 vectors (e5-small's size) in a one-column SQLite table, WAL.
- One search: read every vector in pages of 5,000 ordered by id, dot product with the query, keep the best.
  Median of three warm runs after one warm-up.
- `node scan.mjs <file.db> <count>`

## Results

| vectors in scope | one search, warm |
|---|---|
| 10,000 | 33 ms |
| 100,000 | 271 ms |
| 300,000 | 821 ms |

## What it showed

Time grows in a straight line, about 2.7 ms per 1,000 vectors. What counts is how many vectors one search reads,
not how many the table holds: the store filters by kind of text, account and chat before it compares. For
comparison, the same comparison over vectors already in memory took 7–11 ms for 6,065 vectors
([local-documents](../local-documents/README.md)), so most of the time is reading the pages from SQLite.

## Not measured

- The store's own query with its joins and filters; this is the bare read and compare.
- Vectors held in memory, 8-bit vectors, or an approximate index (`sqlite-vec`) — the options past ~100,000.
- A cold disk cache.
