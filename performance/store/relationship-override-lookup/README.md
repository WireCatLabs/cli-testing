# Relationship override lookup

## Why

The owner said many WireCat Desktop pages open slowly and asked whether SQLite was used badly. Most memo calls a
page makes took 0.3–0.8 s on a copy of the owner's store. One took 325 s: `memo relationships list include:ended`,
which the memory page calls. The question was which part of that call is slow and how to fix it. It fed
[cli-core #2790](https://github.com/WireCatLabs/cli-core/pull/2790).

## Setup

- Machine: Linux 7.0, 24 threads. Other sessions were running.
- Data: a `VACUUM INTO` copy of the owner's store on 2026-11-09 (4.0 GB). It has 108,612 links. After a CRM sync,
  one person is the target of 25,857 `related-to` links from deals.
- Versions: memo 0.131.72 on cli-core 0.619.0 for the 325 s call. The `sqlite3` shell 3.46.1 for [plan.sh](plan.sh).
- Command: `./plan.sh <copy>`. It prints the query plan of the override check and the time of the
  `relationships list` query, before and after the change. It prints totals only.

## Results

| | Override found by | Time, 101 rows |
|---|---|---|
| before | `links_by_to_type_to_id (to_type=? AND to_id=?)` | 497,877 ms |
| after | `links_relationship_key (kind=? AND from_type=? AND from_id=? AND to_type=? AND to_id=?)` | 216 ms |

Through cli-core's `listRelations({ includeEnded: true, limit: 100 })` on the same copy, the time after the change is
202 ms.

## What it showed

- `notOverriddenSql` checks each listed link for an owner's override. It matches the relationship's full key, but
  the only index on that key is partial. A query that does not repeat the index's `WHERE` cannot use it. So SQLite
  reads every link of the link's target instead. With a target of 25,857 links, the check is quadratic.
- Repeating the condition (`KEYED`) turns the check into one index lookup. No migration is needed.
  [#2623](https://github.com/WireCatLabs/cli-core/pull/2623) fixed the same mistake in `syncReported`.
- `ANALYZE` did not help: SQLite kept the target index after it collected statistics.

## Not measured

- Desktop pages from end to end. Each memo call also costs 0.3–0.7 s to start Node
  ([startup](../../startup/README.md)).
- The other callers of the same check (a deal's people, a thing's relationships, person preparation) were not
  timed. They use the same lookup.
