# The business lane of `search all` against store size

## Why it was run

cli-core 0.612.0 lets an import write invoices, payments, wallets and other business data in bulk, through the
[streaming JSONL import](../../store/records-jsonl-stream/README.md), and `search all` reads that data in its
`business` lane. The lane folds names and numbers in memory (`searchBusiness`, up to `BUSINESS_FIND_MAX` rows). The
question: how does the lane's time grow when an import fills the store with 1,000, 10,000 or 100,000 records? This
also checks that large imports leave search usable, as the import page asks.

## Setup

- Machine, versions and data: the same as the [import run](../../store/records-jsonl-stream/README.md#setup):
  cli-core 0.612.0 from npm, Node 24.19.0, a synthetic store per size, made by that import. Of its records the lane
  can find invoices (a quarter of the records, found by their number `INV-000123`) and the ten wallets (by name).
  Organizations, people and transactions are not business kinds, so the lane does not search them.
- [`search.mjs`](search.mjs) opens the seeded store in a new process and calls cli-core's
  `searchAll(store, account, { text, limit: 20, only: ["business"] })` for four queries. Each query runs once (the
  first call) and then 10 more times (median reported). [`run.sh`](../../store/records-jsonl-stream/run.sh) runs it
  after each import:

```sh
TMPDIR=<scratch folder> performance/store/records-jsonl-stream/run.sh <tmp>/node_modules/@wirecat/cli-core 0 1000 10000 100000
```

Raw rows: [`results/search.jsonl`](results/search.jsonl).

## Results

Median of 10 warm calls, first call in brackets, in milliseconds:

| query | hits | 1,000 records | 10,000 records | 100,000 records |
|---|---:|---:|---:|---:|
| `INV` (every invoice number) | 20, more left | 1.8 (9.3) | 10.6 (16.7) | 82.9 (74.5) |
| one invoice number (`INV-000123`, `INV-001248`, `INV-012498`) | 1 | 0.9 (1.6) | 6.9 (6.9) | 57.8 (50.5) |
| `Bench` (every wallet name) | 10 | 1.2 (1.4) | 8.0 (8.5) | 81.4 (59.0) |
| `zebra` (nothing) | 0 | 0.9 (1.2) | 6.4 (6.7) | 130.9 (110.2) |

## What it showed

- **The lane's time grows with the store**: ten times the records took six to ten times the time for every query,
  and twenty times for the query that finds nothing, from 10,000 to 100,000. A query that finds one invoice costs
  nearly as much as one that finds nothing, so I think the lane reads every business row and no index narrows it.
- At 100,000 records (25,000 invoices) one call takes 60 to 130 ms. A `search all` stays usable at this size, but a
  store with ten times the invoices would probably put the business lane alone near one second (not measured).
- A word that matches nothing is the slowest case at 100,000 records (131 ms), I think because no early stop applies.
- The first call is not slower than the warm ones at 10,000 and 100,000 records, probably because the import had
  just written the file and it was still in the operating system's file cache.

## Not measured

- The whole `search all` command: process start, the other lanes (messages, mail, notes, events, CRM) and the merge.
  This times the business lane through `searchAll` alone.
- Kinds other than invoices and wallets (payments, orders, contracts, subscriptions, products), and a store above
  100,000 records.
- A cold file cache (after a reboot) and Bun.
- Where inside the lane the time goes (the SQL read against the in-memory fold).
