# Streaming JSONL records import: memory and time against file size

## Why it was run

cli-core 0.612.0 added `ingestLines` and `jsonlLines`, a records envelope v1 import that reads a JSONL file one line
at a time and writes a transaction per 1000 records. The owner was told that the import streams large files. This
run checks that claim: does the peak memory of an import stay flat as the file grows, or grow with the file? The
answer decides whether the docs need advice to split a large import into chunks.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0. Another heavy job shared the machine
  (10 to 14 GB available during the runs).
- Code: `@wirecat/cli-core` 0.612.0 from npm, installed into a temporary folder (`npm i @wirecat/cli-core@0.612.0`).
- Data: synthetic only. [`generate.mjs`](generate.mjs) writes one header line, ten wallets, then repeats four records:
  an organization (a unique `bench-erp:customer` identifier), a person (a unique `example.com` email, `member-of` the
  organization), an invoice with three lines (`counterparty` the organization) and a bank transaction with two splits
  (its `wallet` and `counterparty`). Every run below imported every record: `refused`, `waiting` and `unmatched` were
  0 at every size.
- Store: a new file in a temporary folder, named by `MESSAGING_STORE` and passed to `openStore`. The scripts refuse
  any path under `~/.local/share/WireCat`.
- Each size runs in its own process, one after another, with the file generated beforehand by another process, so the
  peak belongs to the import alone. [`import.mjs`](import.mjs) reports `process.resourceUsage().maxRSS` (peak
  resident memory of the whole process: V8, SQLite and its page cache) and the largest `heapUsed` sampled every
  20 ms. [`run.sh`](run.sh) also records `/usr/bin/time -v`'s "Maximum resident set size"; the two agreed to 0.1 MB.

```sh
TMPDIR=<scratch folder> performance/store/records-jsonl-stream/run.sh <tmp>/node_modules/@wirecat/cli-core 0 1000 10000 100000
# the capped rows: the same import.mjs under node --max-old-space-size=64
# the 300k rows: generate.mjs 300000, then import.mjs by hand, once uncapped and once capped
```

Raw rows: [`results/import.jsonl`](results/import.jsonl) and [`results/import-heap-64.jsonl`](results/import-heap-64.jsonl).

## Results

Node's defaults, as a CLI runs it:

| records | file | time | peak RSS | above the empty file | peak JS heap | store file |
|---:|---:|---:|---:|---:|---:|---:|
| 0 (header only) | 0 MB | 0.03 s | 176 MB | — | 58 MB | 2.5 MB |
| 1,000 | 0.4 MB | 0.3 s | 206 MB | +30 MB | 58 MB | 3.5 MB |
| 10,000 | 3.8 MB | 2.0 s | 254 MB | +78 MB | 114 MB | 13 MB |
| 100,000 | 38 MB | 26.6 s | 363 MB | +187 MB | 181 MB | 114 MB |
| 300,000 | 114 MB | 52.6 s | 359 MB | +183 MB | 186 MB | 340 MB |

The same imports with the JS heap capped at 64 MB (`--max-old-space-size=64`):

| records | time | peak RSS | peak JS heap |
|---:|---:|---:|---:|
| 0 | 0.01 s | 172 MB | 49 MB |
| 1,000 | 0.4 s | 178 MB | 65 MB |
| 10,000 | 2.5 s | 191 MB | 71 MB |
| 100,000 | 28.4 s | 228 MB | 73 MB |
| 300,000 | 69.3 s | 253 MB | 72 MB |

A 32 MB cap failed with "JavaScript heap out of memory" 1.3 s in, while cli-core was still loading, before any
record.

## What it showed

- **The import streams.** From 100,000 to 300,000 records the file triples (38 to 114 MB) and the peak stays at about
  360 MB. Under a 64 MB heap cap, 300,000 records go through with a flat heap (65 to 73 MB from 1,000 records up).
  The import does not hold the file or the records in memory.
- **The rise up to 100,000 records is V8 using spare heap, not data kept.** Without a cap, V8 lets the heap grow to
  about 180 MB before it collects harder. With the cap, the same import needs no more than 73 MB of heap.
- **Some native memory still grows slowly**: under the cap, RSS rises from 191 MB at 10,000 records to 228 MB at
  100,000 and 253 MB at 300,000, while the heap stays flat. SQLite's page cache is its default 2 MB (cli-core sets
  no `cache_size`), so I think this is the per-run `TEMP` table of keys or the allocator, but the run does not show
  which. It is about 25 MB per 200,000 records.
- **Time grows with the file, roughly linearly**: 4,900 records a second at 10,000, 3,800 at 100,000 and 5,700 at
  300,000. Each size ran once on a shared machine, so the spread is noise as much as trend. The capped runs are
  slower (69 s at 300,000), because V8 collects more often.
- **No chunking advice is needed for memory.** A 114 MB file stayed under 400 MB of RSS with Node's defaults. What a
  large import does need said, and the plan already says, is that a dry run holds the store's write lock for the
  whole file, and that a real run takes about a minute per 300,000 records.
- The receipt caps its lists at 1000 entries: `proposed` stopped at 1000 (`truncated: true`) from 10,000 records up,
  while the counts stayed exact.

## Not measured

- A dry run (one transaction rolled back at the end) and the size its WAL file reaches.
- A second import of the same file (every record `unchanged`), updates, deletes, and records that wait for a later
  chunk.
- stdin, Bun, and memo's `records import` command around the function: this runs cli-core's `ingestLines` in a
  plain Node process.
- Files above 300,000 records, other mixes of types (deals, orders, contracts, products), and a store that already
  holds other data.
- Which native allocation makes the slow RSS rise under the heap cap.
