# The business lane of `search all` against store size

## Why it was run

cli-core 0.612.0 lets an import write invoices, payments, wallets and other business data in bulk, through the
[streaming JSONL import](../../store/records-jsonl-stream/README.md), and `search all` reads that data in its
`business` lane. The lane folds names and numbers in memory (`searchBusiness`, up to `BUSINESS_FIND_MAX` rows). The
question: does a store filled by a large import keep `search all` fast? It feeds the same docs decision as the import
run: whether large imports need advice of their own.

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
TMPDIR=<scratch folder> performance/store/records-jsonl-stream/run.sh <tmp>/node_modules/@wirecat/cli-core
```

It ran twice. Run 2 is that command: [`results/search.jsonl`](results/search.jsonl). Run 1 stopped at 100,000
records: [`results/search-run1.jsonl`](results/search-run1.jsonl).

## Results

Median of 10 warm calls in milliseconds, run 1 in brackets:

| query | hits | 1,000 records | 10,000 | 100,000 | 300,000 |
|---|---:|---:|---:|---:|---:|
| `INV` (every invoice number) | 20, more left | 1.7 (1.8) | 7.2 (10.6) | 85.0 (82.9) | 333.2 |
| one invoice number (`INV-000123` … `INV-037498`) | 1 | 0.9 (0.9) | 5.3 (6.9) | 71.6 (57.8) | 287.7 |
| `Bench` (every wallet name) | 10 | 1.1 (1.2) | 5.5 (8.0) | 66.3 (81.4) | 264.5 |
| `zebra` (nothing) | 0 | 1.4 (0.9) | 4.5 (6.4) | 68.2 (130.9) | 246.8 |

The first call of each query took 1.5 to 11 ms at 1,000 records, 5 to 13 ms at 10,000, 58 to 277 ms at 100,000 and
220 to 842 ms at 300,000 (run 2).

## What it showed

- **The lane's time grows in step with the store, not with the hits.** Every query takes about the same time at one
  size: a query that finds one invoice costs as much as one that finds nothing. From 100,000 to 300,000 records, the
  time grows three to four times. I think the lane reads every business row and no index narrows it.
- **At 300,000 records (75,000 invoices) one warm call takes 250 to 330 ms**, and the first call up to 840 ms. At
  100,000 records it is 60 to 130 ms. A store that an import fills with a few hundred thousand records makes the
  business lane alone a visible part of every `search all`.
- The two runs differ by up to two times at the same size (`zebra` at 100,000: 68 and 131 ms). Another heavy job
  shared the machine, so read single numbers as rough.
- For the docs: large imports need no chunking advice for search either, because the cost depends on how many records
  the store holds, not on how they were imported. A note that `search all` slows as business data grows belongs with
  the search docs; the fix would be in the lane (an index on the folded words), not in the import.

## Not measured

- The whole `search all` command: process start, the other lanes (messages, mail, notes, events, CRM) and the merge.
  This times the business lane through `searchAll` alone.
- Kinds other than invoices and wallets (payments, orders, contracts, subscriptions, products), and a store above
  300,000 records.
- A cold file cache (after a reboot) and Bun.
- Where inside the lane the time goes (the SQL read against the in-memory fold).
