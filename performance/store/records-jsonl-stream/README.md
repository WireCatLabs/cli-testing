# Streaming JSONL records import: memory and time against file size

## Why it was run

cli-core 0.612.0 added `ingestLines` and `jsonlLines`, a records envelope v1 import that reads a JSONL file one line
at a time and writes a transaction per 1000 records. The owner was told that the import streams large files. This
run checks that claim: does the peak memory of an import stay flat as the file grows, or grow with the file? The
answer decides whether the docs need advice to split a large import into chunks.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0. Another heavy job shared the machine
  (10 to 14 GB available during the runs).
- Code: `@wirecat/cli-core` 0.612.0 from npm (with `@wirecat/cli-core-sqlite` 1.1.0), installed into a temporary
  folder (`npm i @wirecat/cli-core@0.612.0`). Each row records the cli-core and Node versions it ran on.
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
  20 ms. [`run.sh`](run.sh) also records `/usr/bin/time -v`'s "Maximum resident set size".

```sh
TMPDIR=<scratch folder> performance/store/records-jsonl-stream/run.sh <tmp>/node_modules/@wirecat/cli-core
TMPDIR=<scratch folder> HEAP_CAP_MB=64 performance/store/records-jsonl-stream/run.sh <tmp>/node_modules/@wirecat/cli-core
```

The sizes default to 0 (a header only), 1,000, 10,000, 100,000 and 300,000 records. With `HEAP_CAP_MB` the import
runs under `node --max-old-space-size` and the search step is skipped. Both passes ran twice. Run 2 is the command
above: [`results/import.jsonl`](results/import.jsonl) and [`results/import-heap-64.jsonl`](results/import-heap-64.jsonl).
Run 1 was the same scripts before `run.sh` took the cap and the 300,000 size; its capped rows and both 300,000 rows
were run by hand with `import.mjs`: [`results/import-run1.jsonl`](results/import-run1.jsonl) and
[`results/import-heap-64-run1.jsonl`](results/import-heap-64-run1.jsonl).

## Results

Node's defaults, as a CLI runs it. Run 2, with run 1 in brackets:

| records | file | time | peak RSS | above the empty file | peak JS heap | store file |
|---:|---:|---:|---:|---:|---:|---:|
| 0 (header only) | 0 MB | 0.01 s (0.03) | 173 MB (176) | — | 59 MB (58) | 2.5 MB |
| 1,000 | 0.4 MB | 0.7 s (0.3) | 200 MB (206) | +27 MB (+30) | 59 MB (58) | 3.5 MB |
| 10,000 | 3.8 MB | 3.0 s (2.0) | 251 MB (254) | +78 MB (+78) | 107 MB (114) | 13 MB |
| 100,000 | 38 MB | 25.5 s (26.6) | 340 MB (363) | +166 MB (+187) | 163 MB (181) | 114 MB |
| 300,000 | 114 MB | 76.6 s (52.6) | 364 MB (359) | +190 MB (+183) | 188 MB (186) | 340 MB |

The same imports with the JS heap capped at 64 MB (`--max-old-space-size=64`), run 2 with run 1 in brackets:

| records | time | peak RSS | peak JS heap |
|---:|---:|---:|---:|
| 0 | 0.02 s (0.01) | 160 MB (172) | 52 MB (49) |
| 1,000 | 0.5 s (0.4) | 179 MB (178) | 66 MB (65) |
| 10,000 | 4.8 s (2.5) | 206 MB (191) | 69 MB (71) |
| 100,000 | 42.5 s (28.4) | 231 MB (228) | 78 MB (73) |
| 300,000 | 127.5 s (69.3) | 256 MB (253) | 77 MB (72) |

Peak RSS from `/usr/bin/time -v` matched `maxRSS` to 1.4 MB or better in every row that has both. A 32 MB cap failed
with "JavaScript heap out of memory" 1.3 s in, while cli-core was still loading, before any record.

## What it showed

- **The import streams.** From 100,000 to 300,000 records the file triples (38 to 114 MB). Peak RSS stays at 340 to
  365 MB in both runs. Under a 64 MB heap cap, 300,000 records go through with a flat heap: 66 to 78 MB from 1,000
  records up. The import does not hold the file or the records in memory.
- **Below 100,000 records, memory does rise with the file.** With Node's defaults, RSS goes from 251 MB at 10,000
  records to 340–363 MB at 100,000. cli-core's plan ([business-entities-plan.md, "Streaming
  ingest"](https://github.com/WireCatLabs/cli-core/blob/main/docs/dev/business-entities-plan.md#streaming-ingest))
  says "peak RSS stays flat from 10k to 1M records". This run does not show that: it is flat only from 100,000 to
  300,000, and 1,000,000 was not run. Under the cap, the heap stays flat, so I think most of the rise is V8 using
  spare heap (it lets the heap reach about 180 MB before it collects harder), not data kept.
- **Some native memory still grows slowly**: under the cap, RSS rises from 206 MB at 10,000 records to 231 MB at
  100,000 and 256 MB at 300,000, while the heap stays flat. SQLite's page cache is its default 2 MB (cli-core sets
  no `cache_size`), so I think this is the per-run `TEMP` table of keys or the allocator, but the run does not show
  which. It is about 25 MB per 200,000 records.
- **Time grows with the file, roughly linearly**: 25 to 27 s per 100,000 records, and 53 to 77 s per 300,000. Another
  heavy job shared the machine, so the same size took up to 1.8 times as long in one run as in the other. The capped runs are slower (69 to
  128 s at 300,000), because V8 collects more often.
- **No chunking advice is needed for memory.** A 114 MB file stayed under 400 MB of RSS with Node's defaults. What a
  large import needs said, and the plan already says, is that a dry run holds the store's write lock for the whole
  file, and that a real run takes one to two minutes per 300,000 records on this machine.
- The receipt caps its lists at 1000 entries: `proposed` stopped at 1000 (`truncated: true`) from 10,000 records up,
  while the counts stayed exact.

## Not measured

- A dry run (one transaction rolled back at the end) and the size its WAL file reaches.
- A second import of the same file (every record `unchanged`), updates, deletes, and records that wait for a later
  chunk.
- stdin, Bun, and memo's `records import` command around the function: this runs cli-core's `ingestLines` in a
  plain Node process.
- Files above 300,000 records (the plan's 1,000,000 among them), other mixes of types (deals, orders, contracts,
  products), and a store that already holds other data.
- Which native allocation makes the slow RSS rise under the heap cap.
