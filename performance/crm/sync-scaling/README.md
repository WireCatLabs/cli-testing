# CRM sync scaling: is saving deals linear?

## Why it was run

b24's 0.5.0 live check ran a first `sync` on a portal with tens of thousands of deals. It took about ten minutes at full
CPU with no socket open, and a `--rescan` took as long again. The paused process showed every page stuck in one
statement of cli-core 0.601.0's `saveItem`, a `DELETE FROM links …` that SQLite ran through the wrong index, so each
deal read every link to a person ([cli-core#2623](https://github.com/WireCatLabs/cli-core/issues/2623)).

Since then [cli-core#2641](https://github.com/WireCatLabs/cli-core/pull/2641) rewrote how a CRM sync writes
relationships, as a diff (store version 56), and that DELETE is gone. The question: does saving CRM items grow linearly
with their number on current `main`? The answer decides whether #2623 is closed as gone or needs a fix.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0 (its own SQLite 3.53.3).
- Code: cli-core `main` at `8a88bb50a` (0.608.0 plus #2680), built with `pnpm build`; "after" is the same tree with
  [cli-core#2681](https://github.com/WireCatLabs/cli-core/pull/2681).
- Path: cli-core's own `syncCrm` over its in-memory fake CRM (`fakeCrmSource` from `@wirecat/cli-core/crm/testing`,
  50 rows a page, as Bitrix24 pages), into a new temporary store. This is the code `b24 sync` runs; only the CRM is
  fake. No network, no account, no CLI run, a throwaway `HOME` and `DBUS_SESSION_BUS_ADDRESS=disabled:`.
- Data, all synthetic, for N: N/10 companies; N contacts, each in one company; N deals, each with two contacts and
  an owner; N/2 leads, each with one contact and an owner; **10 users** who own every deal and lead in turn. The
  number of users matters: each user's person gains a link per deal or lead it owns, so 10 users at N = 20,000 hold
  3,000 links each. A real sales team has the same shape.
- Two runs per store: the first sync, then `rescan: true` (`sync --rescan`) over the same data, which finds every
  relationship already stored.
- After the runs, the script explains (`EXPLAIN QUERY PLAN`) every statement the sync prepared on the filled store.

```sh
performance/crm/sync-scaling/series.sh <cli-core checkout with dist> <output folder> 1000 5000 20000
```

[`series.sh`](series.sh) runs [`bench.mjs`](bench.mjs) once per N in its own process and keeps one JSON per N.
`CRM_SCALE_USERS` changes the number of users.

## Results

Whole sync, seconds, and milliseconds per deal saved in the first and in the last tenth of the deal pages:

| N | before: first sync | before: rescan | after: first sync | after: rescan |
|---|---|---|---|---|
| 1,000 | 1.3 s (0.42 → 0.33 ms) | 0.9 s | 1.3 s (0.41 → 0.29 ms) | 0.8 s |
| 5,000 | 7.7 s (0.33 → 0.50 ms) | 6.3 s | 6.8 s (0.36 → 0.37 ms) | 4.8 s |
| 20,000 | 60.8 s (0.38 → 1.80 ms) | 71.0 s | 30.1 s (0.36 → 0.46 ms) | 21.2 s |
| 50,000 | not run | not run | 84.7 s (0.37 → 0.34 ms) | 68.7 s |

At N = 20,000 the store holds 100,000 links, 20,000 deals, 10,000 leads and 40,021 people.

The two lookups that find a reported relationship by its key, before and after:

```text
before  SEARCH links USING INDEX links_by_to_type_to_id (to_type=? AND to_id=?)
after   SEARCH links USING INDEX links_relationship_key (kind=? AND from_type=? AND from_id=? AND to_type=? AND to_id=?)
```

One lookup of a deal's owner link on the 20,000 store: 0.985 ms before, 0.002 ms after.

## What it showed

- **The old DELETE is gone, but the same index choice came back.** `syncReported` looks up each relationship twice:
  once for a link the owner confirmed, once for the account's own. Both filter on kind, both ends and role, and SQLite
  picked the `(to_type, to_id)` index for them. The "to" end of a deal's owner link is one of only 10 people, so each
  lookup read every link that user already had. Per-deal cost grew five times within one 20,000 run.
- **Why SQLite could not use the right index:** the relationship's unique key is a partial index, `WHERE kind IN
  (…) AND to_id IS NOT NULL`, and SQLite uses a partial index only when the query repeats that condition word for
  word. A bound `kind = ?` does not prove it. The fix adds the condition to both lookups; it changes no result, since
  every relationship kind is in that list. `ANALYZE` would not help: a first sync runs on a store with no statistics.
- **After the fix, per-deal cost is flat** (0.36 → 0.46 ms at 20,000), and the 20,000 sync takes half the time; the
  rescan a third.
- **What is left grows nearly linearly, and most of it is not the CRM code.** A CPU profile of the after run at
  10,000 spent 9.6 s of 14 s in `drainInvolvementQueue`, the involvement index each write recomputes before it commits.
  It builds a new SQL text of about 2 KB for each thing it recomputes, so every one is prepared again, and the
  statement cache never helps. The process also grew to 3.6 GB at 20,000; the driver keeps a statement it evicts
  from its cache until the store closes, so these one-off statements probably account for that growth. At 50,000 it
  reached 6.5 GB.
- **From 20,000 to 50,000** (2.5 times the data) the first sync took 2.8 times as long and the rescan 3.2 times, with
  per-deal cost flat. The growth past linear is outside the deal lookups; the involvement drain and that memory are
  the next suspects, not measured apart here.

## After cli-core#2682: the involvement drain

[cli-core#2682](https://github.com/WireCatLabs/cli-core/issues/2682) took the next suspect. `drainInvolvementQueue`
wrote each item's id into its SQL text, so every item it recomputed was a new statement for SQLite to prepare.
[cli-core#2683](https://github.com/WireCatLabs/cli-core/pull/2683) binds the id as a parameter, so there is one
statement per kind of item. The question: how much of the time and the memory left after #2681 was this?

Setup as above, same day and machine; "before" is `main` at `ddad19e61` (#2681 merged), "after" the same tree with
#2683. Free memory before each series: 17-18 GB available of 30 GB; swap held 6 GB the whole time, the same before
and after.

| N | before: first / rescan | before: peak RSS | after: first / rescan | after: peak RSS |
|---|---|---|---|---|
| 1,000 | 1.3 s / 0.85 s | 409 MB | 0.98 s / 0.50 s | 203 MB |
| 5,000 | 7.1 s / 4.8 s | 1,179 MB | 4.4 s / 2.7 s | 312 MB |
| 20,000 | 29.7 s / 21.0 s | 3,653 MB | 19.3 s / 12.8 s | 551 MB |
| 50,000 | 85.7 s / 71.8 s | 5,771 MB | 59.1 s / 41.9 s | 772 MB |

Per-deal cost, first and last tenth of the deal pages, at 20,000: 0.35 → 0.60 ms before, 0.20 → 0.22 ms after. At
50,000: 0.37 → 0.35 ms before, 0.23 → 0.22 ms after. A first try of the fix bound the id as a numbered `?2`; it
measured the same within noise (peak RSS 418 MB at 20,000) but does not bind on Node 22.16, so the numbers above are
of the anonymous `?` that was merged.

- **The memory was the one-off statements.** Peak RSS fell to a sixth or less at 5,000 and above, and grows with N
  far more slowly. The driver keeps an evicted statement until the store closes; with one text per kind nothing is
  evicted on this path. The bench itself keeps every SQL text it saw, to explain them afterwards; at a few KB each
  that is probably some hundreds of MB of the "before" figure, not measured apart.
- **A third of the time, or more in a rescan**: the 20,000 first sync takes 19 s instead of 30 s, its rescan 13 s
  instead of 21 s.
- **Nothing else changed.** The involvement rows of the 1,000 and 5,000 stores are the same before and after in every
  column but `occurred_at`, which is each run's wall-clock link time. The query plan of each bound statement equals
  the one with the id written in, for every kind of item.
- From 20,000 to 50,000 (2.5 times the data) the first sync now takes 3.1 times as long and the rescan 3.3 times;
  per-deal cost stays nearly flat, so the growth past linear is outside the deal pages, not found here.

## What was not measured

- Real portal latency and Bitrix24's rate limit: the fake CRM answers at once. On a real portal the requests add a
  linear cost on top.
- A real portal's shape: own companies, `company-types`, departments and reporting lines were not in the data.
- Before the fix at 50,000: by the 20,000 curve it would take over 6 minutes a run.
