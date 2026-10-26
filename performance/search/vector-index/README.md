# Vector search over the SQLite store: which storage or index to use

Synthetic data only. No real message, store or account was opened.

## Why it was run

The owner wants search by meaning to be much faster. Message vectors are being added for `--discover`, so the
`conversation` chunks will soon be most of the vectors in the store. Today Core finds the nearest vectors by
reading every candidate row from SQLite and scoring it in JavaScript (`nearestChunks` in `src/store/sqlite/vectors.ts`,
`nearestImages` in `src/store/sqlite/image-chunks.ts`, cli-core `db1bdf8e`).

The question: which storage or index should Core use for vectors, and what does each option cost in speed, recall,
packaging and upkeep? The answer feeds a Core change. It also revisits the earlier ruling NEED-518 A in cli-core
`docs/storage/decisions.md` ("vectors in a plain table scanned in JS, not sqlite-vec, until a real archive outgrows
it").

## Answer

1. **The current scan does not scale.** For one account's 385,000 message chunks it takes 2.9 s with a warm page
   cache and 68 s with a cold one. The time is in SQLite's joins and in turning each row into a JavaScript object.
   The arithmetic is not the problem.
2. **Cheap SQL changes do not fix it.** An index on `chunks(chunkable_type, position, id)` gave no measurable gain.
   Filtering on `chunks.account_id` gave about 20 %. Adding an index on `(account_id, chunkable_type)` made SQLite
   sort the whole account on every page: **150 s per query** at 1M. That index must not be added together with that
   filter.
3. **Two layouts are about 10 times faster on a warm cache and 20–50 times faster on a cold one, and both give
   exact results.** At 1M, first query of a new process:
   - **packed blocks**: an ordinary table holding 1,024 vectors per row, per account and type, scored in JavaScript.
     260–340 ms warm (Node and Bun), 2.4–3.4 s cold. No native code.
   - **sqlite-vec `vec0`**: the same layout inside a C extension. 200 ms (k = 100) to 420 ms (k = 400) warm,
     1.4 s cold when measured next to packed. Needs a native library per platform and has no Linux musl build.
4. **ANN indexes** (usearch, hnswlib) answer in 1–20 ms. But each process must first open its index file: 30 ms
   for usearch `view`, 240 ms for usearch `load`, about 400 ms for hnswlib at 1M. Recall depends on the data and the
   search width. They also need a second store kept in step with SQLite. At these sizes they are not needed.
5. **Every option that scores first and filters after** (packed, `vec0`, ANN) **loses results under a narrow
   filter.** A `since` filter that keeps the newest 1 % gave recall@50 of 7 % with a 400-item shortlist. The
   existing SQL scan handles such filters quickly (105 ms at 1M) because SQLite filters before it joins.

**Recommendation: packed blocks for broad searches, the existing SQL scan for narrow ones, and the no-copy `dot`
now.** Packed blocks equal `vec0` on a warm cache and are about 1 s slower on a cold one at 1M. They need no native
library. The reasons and the conditions are in [Recommendation](#recommendation).

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe, Linux 7.0.
- **The machine was shared.** Other agents ran builds and tests the whole time. Load average was 25–42 during the
  100k run (mean 29) and 3–32 during the 1M run (mean 12). Warm medians are stable to roughly ±30 %. Cold numbers are
  disk-bound and vary more, up to 3× between repeats.
- Runtimes: Node v24.19.0 (official build, SQLite 3.53.3 built in) and Bun 1.3.14 (SQLite 3.53.0 built in).
- Libraries: sqlite-vec 0.1.9, usearch 2.26.5, hnswlib-node 3.0.0 (pinned in [package.json](package.json),
  [pnpm-lock.yaml](pnpm-lock.yaml)).
- Schema: every migration statement of cli-core `db1bdf8e` (`src/store/sqlite/migrations.generated.ts`), applied
  in order. Store pragmas as Core sets them: WAL, default page cache.
- Data, from a fixed seed:
  - 100,000 and 1,000,000 chunks. Types: 70 % `conversation`, 15 % `document`, 10 % `email`, 5 % `image`.
  - 4 accounts holding 55 / 25 / 15 / 5 %. Every search is for account 1.
  - About 3 chunks per conversation. 3 % of conversations belong to an old build. 5 % of chats are hidden from
    search (`searchable = 0`). 2 % of image messages are deleted. So the joins have rows to drop.
  - `content_hash` is a 64-character hex string, as in Core. `chunks.account_id` is set on every chunk, as
    `conversations.ts` does.
  - One vector per chunk, 384 dimensions (the size of multilingual-e5-small), unit length. Vectors are drawn
    around 1,500 random centres, so neighbours exist. Queries are new points near a random centre.
- The search under test is the search Core runs, with no optional filter except the default `searchable = 1`.
  It returns the best 50 conversations, each scored by its best chunk.
  Recall@10 and recall@50 compare each candidate's 50 conversations with the exact scan's.
- Cold: the database and index files are dropped from the page cache (`posix_fadvise DONTNEED`, [evict.py](evict.py),
  no root needed), then a new process runs. Warm: the same with the cache left full. Every measurement is a new
  process, because the CLI starts one per command.
- Queries per process: 20 at 100k, 8 at 1M. So at 1M one missed item moves recall@10 by 1.25 points.
- The shortlist kept in JavaScript (best 400 or so) takes the chunk id, not an object. A first version made an
  object for every scored vector; Bun lost about 0.6 s a query to it. The packed rows were rerun after the fix. The
  `shortlist*` and `embeddings-only` rows were measured with that first version; Node was barely affected.

Commands, from this folder:

```sh
pnpm install                       # compiles hnswlib-node (about 25 s); usearch ships prebuilt
QUERIES=20 ./run.sh 100000 /path/to/cli-core      # writes results-100000.jsonl, store in /var/tmp/vector-bench
QUERIES=8 ./run.sh 1000000 /path/to/cli-core
node summarize.mjs results-1000000.jsonl          # the tables below
node ext-load.mjs                                  # extension loading, per runtime (also: bun ext-load.mjs)
python3 -I ext-load-library.py <libsqlite3.so.0> node_modules/sqlite-vec-linux-x64/vec0.so
```

`run.sh` takes `STAGES="scans type_position shortlist vec0 ann packed narrow maintain"` to rerun some stages only.
A 1M run needs about 10 GB under `/var/tmp` and about 2 hours.

## How to read the tables

- **cold first** / **warm first**: the first query of a new process, in ms, page cache dropped or full. This is
  what a CLI user waits for. ANN rows include opening the index; `vec0` rows include loading the extension.
- **warm median**: the median of the later queries in that process.
- **rows**: rows (or vectors) the search looked at.
- **recall**: share of the exact top 10 and top 50 conversations found. "exact" marks the reference run.

Full tables, query plans and build times: [results-100000.md](results-100000.md),
[results-1000000.md](results-1000000.md). Raw lines: `results-*.jsonl`.

## Results

### Message chunks of one account (`conversation`, the 70 % type)

| Candidate | 100k warm median | 1M warm first | 1M warm median | 1M cold first | Recall@10 / @50 at 1M |
|---|---:|---:|---:|---:|---|
| 1. Current scan (Node) | 510 | 2,990 | 2,869 | 68,236 | exact |
| 1. Current scan (Bun) | 327 | 1,942 | 2,058 | 42,323 | exact |
| Current scan, `dot` without the copy | 460 | 4,410 | 2,615 | – | exact |
| 3. Filter on `k.account_id` | 386 | 2,936 | 2,202 | 42,203 | exact |
| 3. Same, plus index `(account_id, chunkable_type)` | 1,240 | 176,113 | 150,210 | – | exact |
| 3b. Score first on `chunks` + `embeddings`, join the best 400 | 390 | 2,441 | 3,230 | 107,220 | 100 / 100 |
| 4. Same, int8 vectors | 300 | 2,350 | 3,086 | 43,777 | 97.5 / 99.3 |
| 4. Same, int8 then float for the best 800 | 377 | 2,526 | 2,122 | 60,481 | 100 / 100 |
| 5. `vec0` float, k = 100 | 35 | 201 | 175 | 633 | 100 / 100 |
| 5. `vec0` float, k = 400 | 51 | 420 | 302 | 854 | 100 / 100 |
| 5. `vec0` int8, k = 100 | 18 | 202 | 189 | 365 | 97.5 / 98.8 |
| 6. usearch HNSW float, k = 400, ef = 1024, `view` | 12 | 59 | 8 | 688 | 100 / 100 |
| 6. usearch HNSW int8, k = 400, ef = 1024, `view` | 6 | 46 | 4 | 374 | 85 / 92.5 |
| 6. hnswlib HNSW, k = 400, ef = 1024 | 5 | 417 | 6 | 725 | 100 / 100 |
| **Packed blocks, float (Node)** | **24** | **340** | **246** | **2,466** | **100 / 100** |
| **Packed blocks, float (Bun)** | **19** | **261** | **202** | **2,511** | **100 / 100** |

All times in ms. Cold runs repeated on a quiet machine (load average 2.4–2.6), alternating the two:

| 1M, messages, cold first query | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Packed blocks (Node) | 3,401 | 2,520 | 2,443 |
| `vec0` float, k = 100 (Node) | 1,403 | 1,471 | 1,370 |

Both read about the same 590 MB. The difference was not traced; storing a 1.5 MB blob per row puts it on a chain of
overflow pages that SQLite reads one page at a time.

**Bun and the scoring loop.** With the dot product written inline in the search's callback, Bun ran the first one or
two queries of each process about 0.7 s slower than later ones (Node did not), then caught up. Moved into a small
function of its own, Bun's first query took 270–360 ms. The rows above use that function.

At 100k, ANN recall was lower than at 1M: usearch at k = 400 and the default ef = 64 gave 89 % recall@50; ef = 1024
gave 97.6 %. hnswlib at k = 100 and ef = 64 gave 75 %; at k = 400 and ef = 1024, 98 %. usearch's int8 mode stayed
at 85–95 % at any width.

### Images of one account (`image`, the 5 % type)

| Candidate | 100k warm median | 1M warm median | 1M cold first | Recall@10 / @50 at 1M |
|---|---:|---:|---:|---|
| 1. Current scan | 40 | 236 | 14,726 | exact |
| 2. Same, plus index `(chunkable_type, position, id)` | 60 | 232 | 13,509 | exact |
| 3. Filter on `k.account_id` | 32 | 259 | 14,523 | exact |
| 5. `vec0` float, k = 100 | 4 | 14 | 132 | 100 / 100 |
| 6. hnswlib, k = 400, ef = 1024 | 2 | 6 | 269 | 100 / 99 |
| Packed blocks, float | 4 | 20 | 412 | 100 / 100 |

### Every type of one account (no type filter; Core has no such search yet)

| Candidate | 1M warm median | 1M cold first | Recall@10 / @50 |
|---|---:|---:|---|
| Exact scan of `chunks` + `embeddings` | 2,582 | – | exact |
| `vec0` float, k = 100 | 249 | 898 | 100 / 100 |
| usearch, k = 400, ef = 1024, one index per type | 36 | 1,242 | 100 / 100 |
| Packed blocks, float | 348 | 3,328 | 100 / 100 |

### Where the time goes (current scan, messages, 1M, warm, Node)

| Part | ms | How it was measured |
|---|---:|---|
| SQL: walk chunks and join 5 tables, without reading the vector | 1,127 | `variant=sql-only` (reads `v.rowid` from the index only) |
| Reading the 1.5 KB vector of each row into JavaScript | +805 | `read-only` minus `sql-only` |
| Scoring with Core's `dot`, which copies every vector | 884 | `current` |
| Scoring with a `Float32Array` view on the same bytes | 377 | `view-dot` |

Both `node:sqlite` and `bun:sqlite` return each blob as its own `ArrayBuffer` at offset 0, so a view is safe; the
copy in `dot` buys nothing. Packed blocks avoid both of the first two lines: 376 rows of 1.5 MB instead of
385,000 rows of 1.5 KB.

### Narrow filters (messages, `since` = newest 10 % or 1 % of chunks)

| Candidate | 1M, 10 %: warm median / recall@50 | 1M, 1 %: warm median / recall@50 |
|---|---|---|
| Current scan with the filter | 320 ms / exact | 107 ms / exact |
| Packed, shortlist 400, filter after | 305 ms / 73.5 % | 272 ms / 6.8 % |
| Packed, shortlist 4,000, filter after | 315 ms / 100 % | 288 ms / 69.5 % |

100k gave the same picture (74 % and 7.3 % with a 400 shortlist).

### Builds, sizes, upkeep (1M store)

| What | Time | Size |
|---|---:|---:|
| Synthetic store | 292 s | 4,024 MB |
| `vec0` float table, all accounts | 97 s | +1,520 MB |
| `vec0` int8 table, all accounts | 112 s | +392 MB |
| Packed blocks, all accounts | 73–89 s | about +1,470 MB (computed: 1M × 1.5 KB; file size not recorded) |
| usearch float, account 1 only | 190 s | 883 MB |
| usearch int8, account 1 only | 69 s | 279 MB |
| hnswlib, account 1 only (one thread) | 385 s | 883 MB |
| `vec0`: insert 1,000 vectors / delete them | 15 ms / 11 ms | |
| Packed: append 1,000 vectors to the last block | 9 ms | |
| Packed: rebuild one account's message partition (376 blocks) | 35 s | |

## Loading an extension: real runs

| Runtime and SQLite | Result |
|---|---|
| Node 24.19.0, built-in SQLite 3.53.3 | `vec0` loads and answers a partitioned KNN query with `new DatabaseSync(path, { allowExtension: true })` and `db.loadExtension(path)`. Without the option: `ERR_INVALID_STATE extension loading is not allowed`. |
| Node 22.23.2, built-in SQLite 3.51.3 | Same as Node 24. |
| Bun 1.3.14, built-in SQLite 3.53.0 | `db.loadExtension(path)` works with no option. |
| `@wirecat/cli-core-sqlite` 1.0.1, `linux-x64-gnu` library (SQLite 3.53.4) | Loads `vec0` and answers the query, called through its C API from Python `ctypes`: `sqlite3_enable_load_extension` then `sqlite3_load_extension`. Compiled without `OMIT_LOAD_EXTENSION`. |
| System `libsqlite3` 3.46.1 (this Linux) | Same as above. |
| sqlite-vec 0.1.9 `INDEXED BY diskann(…)` | Refused: "could not parse vector column". 0.1.9 has only the exact (brute-force) scan. |

Not verified:

- **Node or Bun actually running on the cli-core-sqlite library.** The official Node build has SQLite inside the
  binary, so `LD_LIBRARY_PATH` does not reach it; only a distribution's Node (for example Alpine's) would use it.
  `Database.setCustomSQLite()` in Bun on Linux ran without error but changed nothing (`sqlite_version()` stayed
  3.53.0). [Bun's documentation](https://bun.com/docs/runtime/sqlite) says the call does nothing outside macOS.
- **macOS and Windows.** Bun's documentation says macOS's system SQLite does not support extensions and that
  `setCustomSQLite` must point Bun at another build first. Core ships a darwin `libsqlite3.dylib` that could serve.
  For Node, the [`node:sqlite` documentation](https://nodejs.org/api/sqlite.html) lists `loadExtension` as added in
  v22.13.0 and v23.5.0, below Core's floor of 22.16; it does not say which version added the `allowExtension`
  option. Node 22.23.2 and 24.19.0 were checked here.
- sqlite-vec's alpha 0.1.10-alpha.4 accepts `INDEXED BY diskann(…)` (an approximate index). It was not measured.
- The [sqlite-vec documentation](https://github.com/asg017/sqlite-vec/blob/main/site/features/vec0.md) says a KNN
  query can filter on partition keys (`=`) and on metadata columns (`=`, `!=`, `<`, `<=`, `>`, `>=`), and that `k`
  is at most 4,096. `searchable`, the current build, deleted messages and a person filter cannot be expressed
  there; they are checked after the search, as in packed.

## Packaging cost

| Option | What ships | Size | Platforms |
|---|---|---:|---|
| Packed blocks | nothing new | 0 | wherever Core runs |
| sqlite-vec 0.1.9 | one `vec0` library per platform, as optional npm packages | about 160 KB each | linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64. **No linux musl** (Alpine), which cli-core-sqlite does ship. |
| usearch 2.26.5 | prebuilt Node addons in one package | 26 MB unpacked (2–4 MB per platform) | linux x64/arm64, darwin, win32-x64 |
| hnswlib-node 3.0.0 | C++ source, compiled at install by node-gyp | 200 KB, plus a compiler on the user's machine | any with a C++ toolchain. pnpm also needs an `allowBuilds` entry. |

Core would also have to open the store with `allowExtension: true` for `vec0`.

## Recommendation

1. **Now, at no risk: use a `Float32Array` view in `dot`** (`src/store/sqlite/vectors.ts`). Scoring drops from 884
   to 377 ms at 1M. Results do not change.
2. **For broad searches, use packed blocks.** On the first query of a warm process they match `vec0` (260–340 ms
   against 200–420 ms at 1M). Cold, they take 2.4–3.4 s against `vec0`'s 1.4 s and the current 68 s. They need no
   native library and no `allowExtension`, and have no gap on Alpine, macOS under Bun or Windows. Core already chose
   WebAssembly over native code for its model runtime, and NEED-518 A named the per-platform extension as the
   cost. Key the blocks by model, account and type. Keep the scoring loop in a small function of its own (see the
   Bun note above).
3. **Keep the SQL scan for narrow filters.** With `chatKey`, a short `since`/`before`, `conversations`, `personId`
   or a project, the SQL path reads few rows and is exact. A shortlist scored first cannot promise that. A rule that
   fits both measured points: count the chunks that pass the filters (`share` of the partition). At or under 10 %,
   use the SQL scan. Above it, use packed blocks with a shortlist of ⌈400 / share⌉. At 10 % that is 4,000, which
   gave 100 % recall@50. With the default filters (share about 92 %) it is about 435; 400 gave 100 %. Shares between
   10 % and 92 % were not measured.
4. **Do not adopt an ANN index yet.** Its query time is not the bottleneck once packed blocks remove the per-row
   cost, and it adds a second store, an open cost per process and tuned recall.

Conditions before packed blocks ship:

- **Upkeep.** Appending is cheap (9 ms per 1,000). Removing is not: a vector cannot be taken out of a block without
  rewriting it, and rebuilding one large partition took 35 s. Leave dead entries and let the join that already runs
  on the shortlist drop them. Then compact a partition when its dead share passes a limit.
- **Reused ids.** `chunks.id` is a plain `INTEGER PRIMARY KEY`. [SQLite's documentation](https://www.sqlite.org/autoinc.html)
  says that without `AUTOINCREMENT`, "ROWIDs from previously deleted rows might be reused". A dead entry could then
  score for a different chunk. Store a short hash prefix per vector and compare it during the join, or rebuild on
  delete.
- **Shortlist size.** 400 kept recall at 100 % for 50 conversations with the default filters. Old builds that pile up
  would need a larger one, or compaction after a rebuild.

`vec0` is the choice instead if cold start matters more than packaging: it was about 1 s faster cold at 1M. It is
also the fallback if upkeep turns out costly. Its row-by-row insert and delete (15 ms and 11 ms per
1,000) can sit in the same transaction as `chunks`. The price is the packaging gaps above.

## What it showed about earlier decisions

- NEED-518 A relied on a plain table being as fast as sqlite-vec. That bench (`bench/vectors` in cli-core) compared
  `vec0` with a matrix already loaded in memory (257 ms at 1M), which no CLI process has. Its own first pass through
  SQLite took 3.2 s at 1M, close to this page's 2.6–2.9 s.
- The brief assumed no index starts with `chunkable_type`. The unique constraint
  `(chunkable_type, chunkable_id, position)` makes one, and `nearestChunks` already walks it. `nearestImages` walks
  every chunk by id instead, but at 5 % images that cost too little to measure.

## Not measured

- Real e5 vectors. Real ones are anisotropic: most pairs score high. The synthetic clusters have no common
  direction. int8 recall and ANN recall depend on this and must be checked on real vectors before relying on them.
- macOS, Windows, Linux arm64, Alpine. Node or Bun running on the cli-core-sqlite library.
- An int8 packed layout, which would read a quarter of the bytes and should shorten the cold read. Smaller blocks
  or a larger page size for packed blocks. `vec0` with metadata columns for `occurred_at`.
  sqlite-vec's DiskANN alpha.
- Filters other than `since`: `chatKey`, `personId`, `scope`, `projectId`, `conversations`.
- Memory of the scan with many accounts at once; the cross-account search reads every account.
- A quiet machine. The ranking of candidates held at both sizes and across repeats, but absolute numbers would be
  lower.

## Core implementation (cli-core#2001)

### Why it was run

After this page, the owner chose the `vec0` index over packed blocks ("I'd better use index so we're scaleable",
25.10.2026), inside `wirecat.db`, kept in step by the store itself, with the extension shipped in
`@wirecat/cli-core-sqlite` ([cli-core#1996](https://github.com/WireCatLabs/cli-core/pull/1996)). The question here:
does Core's implementation ([cli-core#2001](https://github.com/WireCatLabs/cli-core/pull/2001), store version 34)
answer exactly what its scan answers, how much faster, and what does it cost on writes and on the first open of an
older store?

### Setup

- Same machine as above, shared with other agents: load average 14–19 during the 100k run, 3.6–15 during the 600k run.
- Node 24.19.0. cli-core branch `feat/vector-index` (commit `fba30e6f`), built, with a local build of
  `@wirecat/cli-core-sqlite` 1.1.0 (sqlite-vec 0.1.9, plain `-O3`, linux-x64-gnu).
- [core-index.mjs](core-index.mjs) writes a synthetic store through Core's own `openStoreContext` (migrations and
  triggers included): 4 accounts holding 55 / 25 / 15 / 5 % of the messages, 2,000 chats, 5 % of them hidden from
  search, 2 % of messages deleted, one `message` chunk and one 384-dimension unit vector per message, around 1,500
  centres. The vectors are first written with no index (as an older store holds them), then the store's one-time
  fill runs, then 10,000 more messages are written with the index in place.
- Each query is `nearestMessages` for account 1 (55 %), limit 100, as `--discover` asks: no filter, the newest 1 %
  (`since`), and one chat. A new process per measurement, as the CLI starts one per command. Cold: the store's files
  dropped from the page cache ([evict.py](evict.py)), 3 runs. Warm: 3 processes after one that fills the cache, 6
  queries each. "Scan" is the same build with the model's index marked not ready, which sends the search to the scan.
- 1M was not run: 20k messages took 85 MB and 100k 416 MB, so 1M would need about 4.2 GB, over the 3 GB this run was
  allowed. 600k took 2.5 GB.

```sh
./core-index.sh 100000 /path/to/cli-core /var/tmp/core-vec/s100000   # appends to core-results-100000.jsonl
./core-index.sh 600000 /path/to/cli-core /var/tmp/core-vec/s600000
node core-summarize.mjs core-results-600000.jsonl
```

### Results

Medians in ms; first = the first query of a new process, after the store is open.

| 600k messages (330k in account 1) | Scan cold | Index cold | Scan warm | Index warm | Scan warm median | Index warm median | Answers |
|---|---:|---:|---:|---:|---:|---:|---|
| account 1, no filter | 1,901 | 606 | 1,195 | 218 | 1,208 | 201 | same |
| account 1, newest 1 % | 1,152 | 345 | 79 | 45 | 77 | 44 | same |
| one chat (287 messages) | 1,171 | 439 | 71 | 44 | 67 | 41 | same |

| 100k messages | Scan cold | Index cold | Scan warm | Index warm | Scan warm median | Index warm median | Answers |
|---|---:|---:|---:|---:|---:|---:|---|
| account 1, no filter | 512 | 231 | 342 | 67 | 296 | 65 | same |
| account 1, newest 1 % | 223 | 71 | 23 | 14 | 20 | 11 | same |
| one chat (48 messages) | 230 | 89 | 23 | 15 | 16 | 13 | same |

"Answers: same" — every query's 100 message ids, in order, were the same both ways.

| Writes and upkeep | 100k | 600k |
|---|---:|---:|
| Write 1,000 messages with chunk and vector, no index | 131 ms | 73 ms |
| The same with the index | 269 ms | 149 ms |
| One-time fill of the vectors an older store held | 7.0 s | 25.7 s |
| Delete 1,000 chunks (rows leave the index by trigger) | 83 ms | 72 ms |
| Opening the store (cold / warm) | 52 / 13 ms | 221 / 32 ms |

### What it showed

- **Exact, and 3–6× faster on a broad search**: 1.2 s → 0.2 s warm and 1.9 s → 0.6 s cold at 600k. A narrow filter
  (the newest 1 %, one chat) is about 3× faster cold and a little faster warm; the scan was already quick there
  because SQLite filters first.
- **The index costs about 0.08–0.14 ms per message written with a vector.** Syncing messages writes no chunk, so it
  pays nothing; the embed path spends far longer in the model than in this.
- **A plan bug, found here and fixed before these numbers**: the first version of the chunk-insert trigger let SQLite
  read every vector for each new chunk (7 ms a chunk at 100k vectors, 6.9 s per 1,000 messages). It now looks the
  vector up by model and hash (cli-core `fba30e6f`).
- The fill of an older store runs on the first writable open after the upgrade and blocks that command: 26 s at
  600k, so about 45 s at 1M by the same rate.

### Not measured

- 1M (disk, above); Bun; macOS, Windows, Linux arm64, Alpine; Node on `@wirecat/cli-core-sqlite`'s library (the
  restart path). The package's workflow probes each of those for loading the extension, not for speed.
- Images and conversations: they use the same code path, and the cli-core tests check that they answer as the scan
  does; their timings were not taken.
- Ties: every synthetic text is unique, so the "same" column cannot show that a text shared by many messages is
  ranked as the scan ranks it. A cli-core test covers that (300 messages sharing one text).
- Real e5 vectors, which are anisotropic. vec0 is exact, so recall does not depend on them; speed should not either.
