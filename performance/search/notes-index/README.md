# Notes and documents ranked by meaning: the vector index instead of a scan

## Why this was run

`memo search all` took 7–10 s on the owner's archive. A CPU profile put 5.4 s of 7.6 s in one step: Core's
meaning ranking of documents and notes (`noteSearchOver().nearest`), which read every chunk in the store in id
order to find the few that belong to documents and notes. Messages already went through the sqlite-vec index.
The question: does ranking documents and notes through the same index give the same results, and how much faster
is it? It decided cli-core#2073 (released in cli-core 0.451.0, memo 0.116.0, drive 0.43.0).

## Setup

- Machine: 24 cores, Linux, Node 24; load average 1.2–2.1 during these runs.
- Store: a copy of the owner's archive, 612,602 chunks — 546,398 mail threads, 26,833 attachments, 23,282
  document chunks, 13,338 messages, 2,558 conversations, 190 images, 3 memories. Model: e5-small (384 dims).
- Three questions (two Russian, one English), private; per-question rows and the questions are in cli-private
  (`reports/`), not here.
- [scripts/nearest.mjs](scripts/nearest.mjs) — a built cli-core checkout (0.452.0) against the store copy: per question,
  `nearest` with the index ready, then with the index marked not ready (the old scan), the same 20 results compared
  by ref and score. `HOME=<copy> node nearest.mjs <core> <store.db> <questions.json>`.
- [scripts/released.sh](scripts/released.sh) — the published CLI end to end on the live store, read-only:
  `released.sh 0.115.0 "<question>" 3`, then `0.116.0`. Prints seconds, hit count and a hash of the 20 result refs.

## Results

`nearest` alone, two runs of three questions:

| | through the index | scan | same 20 results |
| --- | --- | --- | --- |
| run 1 | 44–125 ms | 5,170–5,487 ms | 3 of 3 |
| run 2 | 34–38 ms | 5,199–5,239 ms | 3 of 3 |

`memo search all`, one question, `--limit 20`, three runs each:

| memo | cli-core | seconds | results |
| --- | --- | --- | --- |
| 0.115.0 | 0.450.0 | 6.53–6.66 | 20, refs hash `9b9d2f94e9ef` |
| 0.116.0 | 0.451.0 | 1.41–1.47 | 20, refs hash `9b9d2f94e9ef` |

## What it showed

- The index answers in tens of milliseconds where the scan took about 5 s, about 100× less, with the same refs,
  scores and order. The first run's 125 ms is the index's first touch.
- End to end, `memo search all` went from about 6.6 s to 1.4 s with identical results. The remaining time is
  probably word search, message search and loading the model; it was not split here.
- While the machine was busy with other work, the same scan took 7–18 s; the changelogs quote that range.

## Not measured

- A store whose vector index is not built: `nearest` falls back to the scan there by design.
- drive end to end (it calls the same `searchNotes`) and Windows or macOS.
- Larger `limit` values; by design the index answers only when its candidates are enough for an exact answer, and
  falls back to the scan otherwise.
