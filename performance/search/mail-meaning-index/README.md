# Mail by meaning: vector index instead of a full scan

Measured 2026-11-06 for [cli-core#2557](https://github.com/WireCatLabs/cli-core/pull/2557).

## Why we ran it

In the third PMED test run, `memo search all '<words>' --project PMED` took 56–71 s on the owner's store. On
2026-11-01 the same query took 4.3 s. Between the two, [cli-core#2471](https://github.com/WireCatLabs/cli-core/pull/2471)
made `search all` find mail by meaning. Its lookup, `store.mail.nearest`, read every mail vector of each mailbox and
scored it in JavaScript. A CPU profile of one warm run put 5.5 s of 8.7 s in that function.

The question: does asking the existing vector index (sqlite-vec `vec0`, already used for messages and notes) give
the same answers, and how much faster? The answer decided whether #2557 could replace the scan.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux, Node 24.19.0.
- Code: cli-core `d49ac757c` (before, the scan) and branch `fix/search-all-speed` `84160dd74` (after, the index).
- Data: a synthetic store in a temporary folder: 50,000 mail threads of two emails each, every email body 60 words
  from a fixed 10-word vocabulary, 100,000 mail pieces. Each piece got a seeded random 384-dimension unit vector:
  no model, no download. No real mail was opened.
- Query: 7 seeded random unit vectors, `limit 100`, the same seeds for both builds.
- Command: `node bench.mjs <cli-core checkout with dist> 50000 7` ([bench.mjs](bench.mjs)).

## Results

| build | mail vectors | median | max | answers (hash of the returned ids) |
| --- | --- | --- | --- | --- |
| before: scan | 100,000 | 657 ms | 768 ms | `52ac92d3fedc` |
| after: index | 100,000 | 135 ms | 158 ms | `52ac92d3fedc` |

Raw lines: [before-50000.jsonl](before-50000.jsonl), [after-50000.jsonl](after-50000.jsonl).

On the owner's store (read only, totals only): about 640,000 mail pieces. The PMED query took 9.5 s warm before and
3.9 s after, with the same 20 results in the same order. The first run after the disk cache was cold took 44 s
before and 15 s after.

## What it showed

- The index returns exactly the scan's answers on this data, about 5 times faster at 100,000 vectors.
- The scan's cost grows with the mailbox and, on a cold disk, with reading every vector from it. That is where the
  56–71 s came from.

## What was not measured

- A cold disk on the synthetic store: the page cache was not dropped between runs.
- A thread-scoped lookup: it still scans one account's pieces with the thread filter, as before.
- Real model vectors on synthetic data; random vectors spread more evenly than real ones.
