# Documents catalog past 10,000 entries: speed and memory

## Why it was run

The Notion CLI is planned to sync everything a token can see by default (owner's ruling NEED-2636, 2026-11-14). A
mid-size Notion workspace has more than 10,000 pages. cli-core refused any documents account over 10,000 entries:
`catalog.list` failed above 10,000 entries or 32 MB of metadata, and the catalog import and `catalog.reconcile`
refused more than 10,000 ids. The cap was a safety bound from when the catalog was added, not a SQLite limit. The
owner chose to lift it and watch speed and memory with a measurement (NEED-2639 A).

The question: with the ceiling gone, how long do the catalog import, a batch of saves and a list page take at
10,000, 50,000 and 100,000 entries, and how much memory does the process need? The answer feeds the cli-core pull
request that lifts the ceiling (`feat/documents-catalog-no-ceiling`, plan item C10).

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0 (SQLite 3.53.3).
- Before: cli-core `main` at `cab3953bc` (0.660.0). After: branch `feat/documents-catalog-no-ceiling` on the
  same `main`. Each built with `pnpm build`.
- Path: cli-core's own `openStore` and `documentIngestion({ provider: "google-drive" })` on a new temporary
  store. No network, no account, no CLI run.
- Data, all synthetic: one documents account with 1 root folder, 100 folders and N files spread over them.
- Steps:
  - **import**: `catalog.import` of all N + 101 entries into an empty account;
  - **import again**: the same list again, which is what every sync does when nothing changed;
  - **save 200**: 200 document texts saved, spread over the account;
  - **list page**: one page of 50 entries at the end of the list.
- Each step is timed once; the peak RSS is sampled every 5 ms during the step. The heap growth is after a forced GC.

```sh
cd <cli-core checkout> && pnpm build
node --expose-gc performance/documents/catalog-scale/bench.mjs <cli-core checkout> <entries> [saves]
```

[`bench.mjs`](bench.mjs) prints one JSON line per run.

## Results

Before (`main`): an account over 10,000 entries cannot be imported at all ("catalog scope exceeds 10000
entries"). Under the cap, at 9,800 files:

| step | time | peak RSS |
| --- | ---: | ---: |
| import | 987 ms | 186 MB |
| import again | 894 ms | 186 MB |
| save 200 | 2,427 ms | 251 MB |
| list page | 12 ms | 250 MB |

After:

| files | import | import again | save 200 | list page | peak RSS |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 753 ms | 688 ms | 330 ms | 9 ms | 186 MB |
| 50,000 | 3,354 ms | 3,365 ms | 277 ms | 29 ms | 358 MB |
| 100,000 | 8,624 ms | 7,324 ms | 303 ms | 60 ms | 489 MB |

## What it showed

- **The ceiling can go.** 100,000 entries import in under 9 s and need under 500 MB at the peak.
- **The import grows linearly**: about 75–85 µs per entry. It runs on every sync, also when nothing changed, so a
  100,000-page workspace pays about 7 s per sync for it. That is the next thing to make faster (write only changed
  entries), not a blocker.
- **Saves no longer depend on the account size.** Before, the first save read every document of the account into
  memory, in pages that re-read all rows before them; that is the 2.4 s at 9,800. A first version without the cap
  but with the same listing took 37 s for 200 saves at 100,000. After, each save looks up only its own document
  through an index: about 1.5 ms a save at every size.
- **A list page stays fast** (60 ms at 100,000). The old guard also counted the whole account on every page.
- **Memory grows with the entries handed in.** The caller (the sync engine) holds the whole list, about 2 KB per
  entry here; cli-core adds no second full copy.

## Not measured

- A real Notion or Drive account, real metadata sizes, or a sync over the network.
- The sync engine's own state file (`SourceState`), which holds every document and is read and written whole.
- Search and context queries over a store of this size.
- More than one run per point; the numbers are single runs on an idle-ish machine shared with other work.
