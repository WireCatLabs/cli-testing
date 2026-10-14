# Search on the list envelope: does ranking move?

Measured 2026-10-14 for [cli-core #1105](https://github.com/WireCatLabs/cli-core/pull/1105).

## Why we ran it

#1105 moved `search all|messages|mail|notes` onto the shared list envelope (`{items, page, next?, missing?,
meta}`). It also folded their filter flags into the query: `--chat` became `chat:`, `--type` became `has:`,
`search notes --tag` became `--filter tag:`, and `--offset` became `--page`. The question: does any of this change
which messages a search finds, or their order? The answer decided whether the PR could merge without a ranking
review.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. Temporary store, no real account.
- The [message-search benchmark](../message-search/README.md): 2,616 invented messages, 96 labelled queries, strict
  Lucene and legacy modes, through `searchStore`, k = 10.
- Before: cli-core `origin/main` at `d630ae56`. After: the #1105 branch at `9de9a4a3`. Each was built in its own
  checkout.
- Command, from the cli-testing root, once per checkout:
  `python3 performance/search/run.py --messaging-root <checkout> run > <out>.json`. The run before this page needed
  the one-line `run.ts` fix in this PR: the parser moved to cli-base, so `dist/search/lucene/parser.js` is gone.

## Results

| Split · mode | Recall@10 | MRR | nDCG@10 | No-answer false hits |
|---|---|---|---|---|
| dev · strict | 0.3125 → 0.3125 | 0.325 → 0.325 | 0.2866 → 0.2866 | 0 → 0 |
| dev · legacy | 0.3875 → 0.3875 | 0.425 → 0.425 | 0.3539 → 0.3539 | 80 → 80 |
| test · strict | 0.2625 → 0.2625 | 0.325 → 0.325 | 0.2192 → 0.2192 | 0 → 0 |
| test · legacy | 0.3375 → 0.3375 | 0.45 → 0.45 | 0.2993 → 0.2993 | 80 → 80 |

All 192 per-query rankings (96 queries × 2 modes) are identical, hit for hit.

## What it showed

- The store search ranks and recalls exactly as before. Of the production files the runner hashes, only
  `services/messages-search.js` changed, and only in an error message.

## Not measured

- The CLI and MCP layer: the paging translation, `chat:` against `--chat`, and `--filter tag:` against `--tag`. This
  benchmark calls `searchStore` directly. cli-core tests cover these side by side (`search-envelope.test.ts`): same
  hits, same order. A picture-lane test covers `chat:` scoping.
- Notes and meeting search quality.
