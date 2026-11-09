# memo lists past 500 rows: first page time with and without sources

## Why it was run

WireCat Desktop's Memory page reads memo's `memories list`, `facts list` and `actions list` with `--limit 500`, the
most they gave. A store with more than 500 of a kind showed only the newest 500. The owner ruled that these lists page
like `relationships list` does, with `--page` (NEED-2497). cli-core
[#2811](https://github.com/WireCatLabs/cli-core/pull/2811) added an `offset` to the store lists, and memo's
`feat/memory-lists-paging` branch adds `--page`.

The run answers two questions:

1. Does a later page cost more than the first one?
2. Would a brief form, without each row's sources and their excerpts, make the first load lighter enough to need a
   new flag? memo has two candidates already: `actions list --brief` and field selection with `--json=<fields>`.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0. Other jobs shared the machine
  (load average about 10 on 24 cores), so differences under about 50 ms are noise.
- Code: memo's `feat/memory-lists-paging` branch (commit `cc3f868`), built with `pnpm build`. It ran against
  `@wirecat/cli-core` 0.624.0 with the four SQL changes of cli-core #2811 applied by hand to its `dist`. No released
  cli-core held them yet.
- Data: synthetic only. [`seed.mjs`](seed.mjs) opens a new store and writes 20 notes, a project and 2000 of each:
  memories citing two notes, facts citing two notes, and evidence-findings batches. Each batch is one finding citing
  two notes, so `actions list` without `--brief` reads two sources with excerpts per row.
- Each command is timed as a whole process, the way Desktop runs it: Node start, opening the store, the query, the
  JSON on stdout. [`bench.sh`](bench.sh) gives the median of `RUNS` runs and the answer's size in bytes. It runs with
  `HOME`, the XDG folders and `MESSAGING_STORE` in a throwaway folder and `DBUS_SESSION_BUS_ADDRESS=disabled:`, so it
  never reaches the owner's store or keyring.

```sh
node performance/memo/lists-paging/seed.mjs <memo checkout> <scratch>/home/store.db 2000
RUNS=9 performance/memo/lists-paging/bench.sh <memo checkout>/dist/bin/memo.js <scratch>/home
```

## Results

Median of 9 runs, 2026-11-10.

| Command | Time | Answer |
|---|---|---|
| `memories list --limit 1 --json` (start, the floor) | 346 ms | 1 KB |
| `memories list --limit 500 --json` | 383 ms | 241 KB |
| `memories list --limit 500 --json=<10 fields>` | 320 ms | 105 KB |
| `memories list --limit 500 --page 4 --json` | 316 ms | 239 KB |
| `facts list --limit 500 --json` | 314 ms | 266 KB |
| `facts list --limit 500 --json=<10 fields>` | 314 ms | 113 KB |
| `actions list --limit 500 --json` | 657 ms | 965 KB |
| `actions list --limit 500 --brief --json` | 622 ms | 766 KB |
| `actions list --limit 500 --page 4 --brief --json` | 592 ms | 764 KB |

The 10 fields are `id,kind,text,status,scope,subject,subject_name,project,project_name,created_at`.

## What it showed

- Starting Node takes most of the time. A 500-row page of memories or facts adds less than the noise to the floor.
- A later page costs the same as the first. Desktop can read every page of a kind in a loop. Each page is one
  more process, about 300 to 600 ms, and the kinds run side by side.
- `--json=<fields>` halves the bytes of a memory or fact page but saves no time: the store reads each row's evidence
  either way. Desktop reads 18 of the about 21 fields of a row, so it would not get that saving.
- `actions list --brief` leaves out the sources and their excerpts: 20 % fewer bytes and about 35 ms. Desktop
  already passes it. Most of an action row is its payload, not its sources.
- No new flag was needed. The decision: memo adds `--page` only, and Desktop keeps `--brief` for actions.

## What was not measured

- A real store. The rows are short synthetic texts; real memories with long text make every page larger.
- A store with more than 2000 rows of a kind, where `OFFSET` makes a deep page slower; at 2000 it does not show.
- Field selection inside the store. `--json=<fields>` trims the answer after the read, not the query.
- Memory use of the process, and the agent log (`agents list`), which Desktop reads with `--limit 30`.
