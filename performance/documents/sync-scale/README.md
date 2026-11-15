# Documents sync of a large page tree: no total ceiling, and the cost of an edit

## Why it was run

A review of notion-cli's sync pull request (WireCatLabs/notion-cli#5) found three gaps in cli-core's shared
documents sync engine (`syncDocuments`), confirmed in cli-core 0.666.0:

- A full folder walk failed once it passed `maxEntries`. Notion passes 10,000, so a workspace with more pages could
  never sync, and the failed walk had already spent its requests.
- In a round of changes, every changed folder was walked again in full. In Notion every page is a folder, so an
  edit to a hub page read every page below it.
- A lane lead measured `catalog tree --depth 1` of a 1,000-file folder in a 12,000-entry account at 6.6 s.

The owner's rule: one call stays bounded, but a sync must go on across calls and fetch everything, with no total
ceiling. The questions this test answers:

1. Does a 25,000-page tree now sync over several bounded calls, listing each page once?
2. What does an edit to a hub page with 500 pages below it cost, before and after?
3. How long does the depth-1 catalog tree read take, before and after?

The answers feed the cli-core pull request `feat/documents-sync-resumable`.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Before: cli-core `main` at `cd7f4a0cf` (0.667.0 in progress). After: branch `feat/documents-sync-resumable` on
  that same commit. Each built with `pnpm build`.
- Path: cli-core's own `syncDocuments`, `documentIngestion`, `openStore` and the `catalog tree` reader
  (`catalogSource`), from `dist/`. No network, no account, no CLI run.
- Data, all synthetic:
  - **Page tree:** 1 root, 50 hubs, 10 sections in each hub and 49 pages in each section, 25,051 pages in all. Every
    page is a folder and a document (`isDocument`), as Notion's are. Each hub has 500 pages below it.
  - **Catalog:** one Drive-shaped documents account with 12,001 entries: a folder of 1,000 files and 11,000 files
    in 50 other folders.
- The source is an in-memory fake that counts its requests. The engine's state and walk are kept in memory; the walk
  is copied on every save, as a CLI writing it to a file would.
- Steps:
  - **walk:** sync from an empty state until the pass is complete. Each call is a new `syncDocuments` call, as an
    agent following the answer's `next` step would make.
  - **hub:** after a complete pass, the change feed names the hub `h7` and one page below it, both edited; one
    sync.
  - **catalog:** the children of the 1,000-file folder (pages of 1,000), then the check of which of those 1,000
    entries have children of their own. That is what `catalog tree --depth 1` reads.

```sh
cd <cli-core checkout> && pnpm build
node <cli-testing checkout>/performance/documents/sync-scale/bench.mjs <cli-core checkout> walk 10000
node <cli-testing checkout>/performance/documents/sync-scale/bench.mjs <cli-core checkout> hub 10000
node <cli-testing checkout>/performance/documents/sync-scale/bench.mjs <cli-core checkout> catalog
```

[`bench.mjs`](bench.mjs) prints one JSON line per run. The last argument of `walk` and `hub` is `maxEntries`.

## Results

### 1. A walk of 25,051 pages

| build | `maxEntries` | calls | outcome | folder listings | requests | time |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| before | 10,000 | 1 | fails: "selected folders exceed the 10000 entry limit" | 9,922 | 9,923 | 33 ms |
| before | 30,000 | 1 | complete (only when the bound is over the total) | 25,051 | 50,103 | 3,040 ms |
| after | 10,000 | 6 | complete | 25,051 | 50,103 | 3,239 ms |
| after | 2,000 | 26 | complete | 25,051 | 50,103 | 4,157 ms |

Requests are the folder listings plus the reads of each page's text (25,051), plus the root's metadata. After the
change, every page is listed once over all the calls, and all 25,051 pages are saved.

### 2. An edit to a hub with 500 pages below it

| build | folder listings | requests |
| --- | ---: | ---: |
| before | 501 | 505 |
| after | 2 | 6 |

After the change, the sync lists the two edited pages only: the hub and the edited page below it. The pages below
the hub that did not change are not listed. The time (about 210 ms both ways) is mostly the engine's check of the
25,051 saved documents, which happens in either build.

### 3. The depth-1 catalog tree read, 12,001 entries

Three runs of each build:

| build | children of the folder | which children have children | total |
| --- | ---: | ---: | ---: |
| before | 11, 11, 12 ms | 3,122, 3,197, 3,168 ms | about 3.2 s |
| after | 11, 12, 24 ms | 51, 44, 50 ms | about 0.06 s |

The check of 1,000 branches used to be five reads of 200 `parent:` clauses joined by `OR`. Each clause read each
entry's parents again. It is now one `parent: [ids]` filter per 200 ids that reads each entry's parents once.

## What it showed

- A tree of any size syncs. The bound applies to one call only: with `maxEntries` 10,000, six calls sync 25,051 pages,
  and the total work is what one unbounded call does (3.2 s against 3.0 s). Smaller calls cost a little more, because
  each call saves the walk again: 26 calls take 4.2 s.
- An edit to a page costs that page's direct children, not its subtree: 2 listings instead of 501.
- `catalog tree --depth 1` in a 12,000-entry account drops from about 3.2 s to 0.06 s here. The lead's 6.6 s was
  measured through the CLI on rows with more metadata; this run measures the store reads alone.

## What was not measured

- A real Notion or Drive account, and the time of a real request. The source here answers at once, so the times
  are the engine's own cost.
- The word index step at the end of a sync (`settle`). The walk and hub runs use an index without it, and the
  catalog run does not sync. That step indexes the store's shared queue in batches of 50, for at most 10 s and never
  past the run's deadline less its margin; its time on a real store is not known from this page.
- A request budget sized to a deadline (`runBudget`). Only the entry bound was measured. A budget stop goes through
  the same saved walk, and cli-core's unit tests check it.
- A round of changes cut short across calls on this data (cli-core's unit tests check that too).
- An index on catalog parents. Each catalog read still scans the account's catalog once: the children of one folder
  take about 11 ms at 12,000 entries, and that time grows with the account.
- Memory.
