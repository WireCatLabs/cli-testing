# Mail search with mailbox filters

## Why

The owner's mail benchmark (run 3, [agent questions](../agent-questions/README.md)) found that common searches with a
mailbox filter never answered. `NOT mailbox:bulk` is how memo leaves newsletters out of a search, so a question about
a place or a trip failed with `query.too-large` after a minute instead of listing the owner's own mail (PERF-43).
The question: where does the time go, and does a fix keep the same matches? It fed cli-core#1343 (released in
cli-core 0.295.0) and memo 0.49.0.

## Setup

- One Linux laptop, Node 24, memo 0.48.0 (before) and memo main with cli-core 0.295.0 / cli-base 0.40.0 (after).
- A copy of the owner's store, made by SQLite's backup: 257,073 emails, 879,973 mailbox links. Nothing ran on the
  live file.
- Six searches on one account: two with a mailbox filter, one with a date range, one plain word and two by sender
  address (quoted and unquoted). The queries are the owner's and are not published; [run.sh](run.sh) names them by
  position.

```sh
performance/mail/search/run.sh <path to memo.js> <account> '<query 1>' '<query 2>' …
```

The script copies the store under `~/.cache`, times `memo search mail <query> --json` once per query and prints the
seconds, the number of hits and the error reason, if any. The copy is removed at the end.

## Results

| Query | Before (memo 0.48.0) | After (cli-core 0.295.0) |
|---|---:|---:|
| 1. word `NOT mailbox:bulk` | 67.5 s, `query.too-large` | 0.70 s, 20 hits |
| 2. `mailbox:<label>` alone | 30.0 s, `query.too-large` | 0.65 s, 20 hits |
| 3. word with a date range | 0.57 s, 20 hits | 0.76 s, 20 hits |
| 4. plain word | 0.45 s, 20 hits | 0.62 s, 20 hits |
| 5. `from:"<address>"` | 0.52 s, 20 hits | 0.77 s, 20 hits |
| 6. `from:<address>` unquoted | `query.unsupported-operator` (not timed) | 0.66 s, 20 hits |

The query plan alone, counting the emails in memo's `bulk` mailbox on the same copy: the old filter ran over 7
minutes and was stopped; the new one counts 152,739 emails in 0.13 s.

## What it showed

- **The mailbox filter was a subquery tied to each email's account.** SQLite re-read all 880k mailbox links for
  every candidate email. Looking the mailbox ids up once is the whole fix; which emails match is unchanged (a test
  adds a second account with the same mailbox name).
- **Date ranges were not the problem** by the time of this run: query 3 answered in under a second before the fix.
- **An unquoted address failed in the query parser**, not in search: `@` is Lucene's minimum-should-match operator.
  cli-base 0.40.0 keeps `user@host.tld` as one word.
- The plain searches got about 0.1–0.2 s slower after the move to the newer cli-core and cli-base. One run each, on
  a busy laptop: not separated from noise.

## Not measured

- More than one run per query, so no spread.
- Searches across all accounts (`memo search all`), and search by meaning.
- Stores much larger than this one.
