# How fast the Documents and Meetings pages get their rows

Measured 2026-11-13 with [`bench.mjs`](bench.mjs). The store is synthetic: no real data, no account, no network.

## Why we ran it

WireCat Desktop gets two new pages. "Документы" lists every document of every account. "Встречи" shows meetings and
calls as a table and as a week or month calendar. Both read memo's new `documents` and `meetings` commands, which run
cli-core's listings (cli-core [#2932](https://github.com/WireCatLabs/cli-core/pull/2932)). The owner's earlier
complaint was that Desktop pages wait seconds for memo ([page-speed](../page-speed/README.md)).

The question: does one read stay under about 150 ms (p95) on a heavy user's store, for a month window and a 50-row page?
The answer decided whether the listings needed new indexes (a store migration) before release. They did not.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux, Node 24.19.0. Other agents worked at the same time: load
  average 4 to 6 during the run, 4 to 5 GB free.
- **Code.** cli-core at the head of #2932 (`31847e98`), built with `pnpm build`. The script calls its services directly,
  in one process, on a warm store. It does not measure memo's process start or JSON printing.
- **Data.** A synthetic store made by the script on its first run:
  - 20,000 documents over 5 accounts (two Drive, a notes folder, added sources, an import), in nested folders, with
    words for the text search;
  - 8,000 calendar events over two years, 3 in 8 of them Zoom meetings over 40 recurring rooms, each with 4 attendees;
  - 3,000 Zoom meetings joined to those events, half with a 20-line transcript, and 1,000 ad hoc Zoom meetings;
  - 1,000 phone calls;
  - 2,000 meeting findings batches of 5 findings each, a third still waiting for review.
- **Command.** `node bench.mjs <cli-core checkout with dist> <store file>`. Each read runs 3 times to warm up, then 40
  times; p50 and p95 of those 40.

## Results

| Read | p50 ms | p95 ms | rows |
| --- | ---: | ---: | ---: |
| documents: first page of 50, every account | 48 | 55 | 50 |
| documents: page 200 of 50 | 56 | 96 | 50 |
| documents: one account | 23 | 24 | 50 |
| documents: `kind:pdf` | 71 | 79 | 50 |
| documents: `folder:"Area 3"` | 52 | 55 | 50 |
| documents: text `budget` | 70 | 74 | 50 |
| documents: text `budget kind:md` | 74 | 82 | 50 |
| documents: sources tree, depth 3 | 51 | 71 | 5 |
| documents: show, 20,000 characters | 16 | 21 | 1 |
| meetings: month window, every row | 114 | 134 | 412 |
| meetings: week window, every row | 25 | 29 | 97 |
| meetings: default window, first page of 50 | 44 | 50 | 50 |
| meetings: a year, first page of 50 | 564 | 621 | 50 |
| meetings: a year, page 10 of 50 | 558 | 576 | 50 |
| meetings: month, `has_transcript:true` | 40 | 58 | 83 |
| meetings: month, `person:` | 21 | 30 | 0 |
| meetings: month, text `event` | 93 | 112 | 330 |
| meetings: show with 200 transcript lines | 25 | 26 | 1 |

## What it showed

- Every read the two pages make on open stays under 150 ms at p95. The slowest is a whole month of the calendar
  (412 rows) at 134 ms. No index was added.
- The documents page first chose its 50 rows and then read their columns. Before that change, SQLite built the kind
  and path of all 20,000 documents before the cut: 136 ms for the first page in a run at load average 10, 55 ms after at load average 4 to 6.
- A window around the meetings' events written as `OR` stopped SQLite from using the events' time index. A `UNION`
  restored it.
- A year in one read costs about 600 ms. Most of that cost is matching each meeting of the year to its event. A page
  that reads a year at once would need a stored join, not a read-time one.
- The run before these changes ran under a load average of about 87, and its numbers were noise (p95 up to 8.7 s).
  They are not used here.

## What was not measured

- memo's own cost: process start, the query parser, JSON output. The [page-speed](../page-speed/README.md) numbers
  cover a warm memo server.
- A real store. Real rooms, participants and documents vary more than the synthetic ones.
- Cold reads after the operating system dropped the file from its cache.
