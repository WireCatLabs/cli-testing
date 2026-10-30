# gcal 0.1.1: where the time goes

Measured 2026-10-30, with the scripts beside this page. Raw numbers are in [`results/`](results/).

## Why we ran it

gcal (`@wirecat/gcal-cli`) is the newest WireCat CLI. It was released as 0.1.1 without a performance baseline. The
owner asked what is slow in it before more people sync real calendars into the shared store.

The questions:

1. How fast does gcal start next to drive, memo and tg, and what does it load to start?
2. How fast are the offline reads on a large store: 5,000 and 50,000 events?
3. What does a sync cost without the network: how many Google requests, and how much time to write the store?
4. How fast do its MCP server start and answer one `gcal_read` call?

The answers rank the fixes at the end of this page.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node 24.19.0, npm 11.17.0,
  pnpm 11.28.8. Other jobs shared the machine. The 1-minute load average was 30–76 during the start timings and
  5–11 during the read timings. Each result file records the load of its rounds (`load1`). The comparisons on one
  page alternate their variants round by round, so a load spike hits every variant alike. Absolute numbers on a quiet
  machine will be lower.
- **Code.** gcal 0.1.1 (git tag `v0.1.1`, cli-core 0.475.0, cli-base 0.65.1). drive 0.46.0, memo 0.123.0 and tg
  0.107.0 were installed from npm. The store driver is Node's `node:sqlite`, as on every Node install of cli-core
  0.475.0.
- **Variants** ([`setup.sh`](setup.sh)):
  - `stock`: gcal as released, compiled by `tsc` only.
  - `bundled`: the same source, with esbuild 0.28.2 and `cli-dev bundle --bin dist/bin/gcal.js`, the build that
    drive, memo and tg use ([bundle-rollout](../../startup/bundle-rollout/README.md)).
  - `cache`: the `tsc` build, with a prepared-statement cache added to cli-core's `node:sqlite` driver by
    [`statement-cache.mjs`](statement-cache.mjs). This is the fix that this page proposes for the store.
- **Isolation.** Every run has its own `HOME`, XDG folders, `GCAL_CONFIG_DIR`, `GCAL_STATE_DIR`, `GCAL_CACHE_DIR` and
  `MESSAGING_STORE`. `DBUS_SESSION_BUS_ADDRESS` is unset, so the system keyring is out of reach. There was no sign-in
  to Google, no network and no real calendar data.
- **Synthetic store** ([`build-store.mjs`](build-store.mjs)). The script runs gcal's own `run()` with `sync`
  against an in-process fake of the Calendar API. The fake has the response shapes of gcal's test fixture. It pages
  at `maxResults`, answers `events.instances` for each repeating event, and keeps the session in cli-base's
  `memoryKeyring()`. There are 4 owned calendars. Events fall in gcal's sync window (one year back, three months
  ahead). Each event has 0–7 guests from a pool of 400 people. 4% of events repeat weekly.

  | store | events listed | repeating | slots | stored entries | file |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | 5k | 5,000 | 222 | 6,957 | 11,957 | 21 MB |
  | 50k | 50,000 | 2,249 | 70,699 | ~120,000 | 199 MB |

- **Commands.** [`run.sh`](run.sh) runs everything. [`startup.sh`](startup.sh) and [`reads.sh`](reads.sh) use
  [`ab.mjs`](ab.mjs): 2 untimed warm-up rounds, then 15 rounds (starts) or 10 rounds (reads), pinned with
  `taskset -c 0-3`, each variant with its own warm compile cache. [`mcp-time.mjs`](mcp-time.mjs) measures MCP: spawn
  to the `initialize` answer, `tools/list`, then one `tools/call`. [`count-modules.mjs`](count-modules.mjs) and
  [`import-chain.mjs`](import-chain.mjs) are load hooks that count the loaded files and show who imported them.

## Results

### 1. Start, median of 15 (p95), ms ([`results/startup-*.json`](results/))

| command | gcal 0.1.1 | gcal bundled | drive 0.46.0 | memo 0.123.0 | tg 0.107.0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `--version` | **133** (268) | 51 (113) | 50 (138) | 41 (111) | 45 (105) |
| `--help` | **587** (841) | 260 (333) | 337 (398) | 307 (386) | 317 (407) |
| `commands` | **707** (2,087) | 336 (942) | 440 (5,595) | 449 (38,821) | 409 (804) |
| `doctor` | **531** (601) | 231 (265) | 305 (337) | 277 (359) | 325 (392) |

The p95 values for `commands` are load spikes from other jobs on the machine. The medians are stable.

What starts with each command ([`results/modules.jsonl`](results/modules.jsonl)):

| CLI | `--version` | `--help` |
| --- | --- | --- |
| gcal 0.1.1 | 51 files, 383 KB (valibot 206 KB, through `@wirecat/cli-base`) | **1,099 files**, 7.5 MB (cli-core: 915 files) |
| gcal bundled | 1 file | 67 files, 6.9 MB |
| drive / memo / tg | 1 file | 80 / 59 / 52 files, 8.3 / 7.9 / 6.5 MB |

Even bundled, every gcal command loads code that a calendar does not use: `@xmldom/xmldom` (attachments), `liquidjs`
(reply templates), `fflate` (the ONNX model runtime), `chardet` and `psl`. They come through cli-core's `cli` entry:
`cli/index.js` → `mcp/meeting-preparation.js` → `services/index.js` → attachments and embeddings, and
`cli/index.js` → `replies/dry-run.js` → `replies/template.js` ([`results/import-chains-help.txt`](results/import-chains-help.txt)).

Package size: the gcal tarball is 0.75 MB (136 files), because cli-core installs beside it as a dependency (13.4 MB,
2,154 files). The drive, memo and tg tarballs carry their bundles (13.6–16.7 MB). Installed with
`npm install --ignore-scripts` into an empty folder, gcal takes 263 MB in 15,399 files. drive takes 297 MB, memo
278 MB and tg 319 MB. The largest packages in gcal's install come with cli-core: `echarts` 62 MB, `@anthropic-ai/sdk`
24 MB, `sherpa-onnx` 15 MB and `ogg-opus-decoder` 10 MB.

### 2. Offline reads, median of 10 (p95), ms ([`results/reads-*.json`](results/))

| command | 5k stock | 5k bundled | 50k stock | 50k bundled | 50k cache |
| --- | ---: | ---: | ---: | ---: | ---: |
| `events list today` | 556 | 307 | 691 (936) | 410 (578) | 722 |
| `events list week` | 426 | 204 | 639 (854) | 389 (661) | 642 |
| `events show <id>` | 421 | 204 | 575 (631) | 282 (325) | 587 |
| `search roadmap` | 445 | 226 | 969 (1,283) | 624 (822) | 975 |
| `search budget review` | 422 | 206 | 612 (1,000) | 328 (468) | 631 |
| `people list` | 449 | 234 | 866 (1,653) | 570 (1,433) | 769 |
| `links review` | 402 | 192 | 494 (615) | 235 (388) | 531 |
| `status` | 405 | 188 | 613 (748) | 316 (398) | 617 |

On the 5k store, every read is start time: a CPU profile of `events list week` and of `search` shows module loading
(package.json reads, compiling and resolving) and no store work worth naming. On the 50k store, three reads do real
work on top of the start:

- **`events list today` and `week`**: the list query in cli-core
  (`src/store/sqlite/calendar.ts:738-739`) wraps both time bounds in `CASE WHEN e.all_day = 1 … END`. SQLite cannot
  use the bound to seek, so the plan is `SCAN e USING INDEX events_by_time`. The query reads every event from the
  start of the window (84,364 past events) before the first match. Run alone in `sqlite3`, it takes 134–199 ms. The
  same query with a plain lower bound on `starts_at` gets `SEARCH e USING INDEX events_by_time (starts_at>? AND
  starts_at<?)` and takes 29 ms.
- **`search roadmap`**: about 400 ms more than start time on the 50k store. This page did not profile it.
- **`people list`**: one `store.event(id)` call for each of up to 1,000 events in the week (cli-core
  `src/calendar/reads.ts:227-229`). Each call runs five queries. That costs about 250 ms on top of the start.

The statement cache changes no read beyond noise. Reads are bound by start time and by query plans.

### 3. Sync without the network ([`results/sync-*.json`](results/))

Google requests for each sync, counted by the fake and confirmed against the code:

- `calendarList.list`: 250 per page (gcal `src/calendar-source.ts:211-214`), 1 request.
- `events.list`: 2,500 per page, `showDeleted`, with no expansion (`src/calendar-source.ts:226-233`). One request
  per page, per calendar.
- `events.instances`: **one request for each repeating event in every full round** (cli-core
  `src/calendar/sync.ts:289` and `:304-319`). A full round runs at least once a day (`sync.ts:215`).
- gcal sends no `fields` mask. Google returns every field of every event, and gcal keeps about 30 of them.

| store | requests in a full round | first sync stock | first sync cache | no-change sync | `--rescan` stock | `--rescan` cache |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 5k | 1 + 4 + **222** | 10.0 s | **3.5 s** | 39 ms / 26 ms | 9.2 s | 2.9 s |
| 50k | 1 + 20 + **2,249** | 278 s, 3 runs | **62 s**, 3 runs | 159 ms / 232 ms | see below | see below |

An earlier 50k pair at the default deadline gave 142 s (5 runs) for stock and 30 s for cache. Both pairs show the
same gap: the cache makes the first sync 4.5–4.7 times faster. The fake answers in microseconds, so these numbers
are the CPU and disk cost of the store alone. With the real network, the 2,249 `instances` requests come on top.

The wall time goes to these places:

- **Statement preparation.** cli-core's `node:sqlite` driver prepares every statement again on every call
  (`src/store/drivers/node-sqlite.ts:26-38`; the same on cli-core `main` at 0.486.0). In the 5k stock profile,
  `prepare` is 5.3 s of the 20 s total, and the garbage collector is another 2.8 s
  ([`results/profile-sync-stock-5000.txt`](results/profile-sync-stock-5000.txt)). A per-connection `Map` from SQL
  text to its prepared statement removes that cost. The write path builds the same SQL text every time, so the cache
  hits.
- **One commit for each repeating event.** With the cache in place, a 20k sync run with
  `statement-cache.mjs --timing` spent 10.0 s of 39.5 s in `COMMIT`: 3,659 commits, 2.7 ms each
  ([`results/sql-time-cache-20000.json`](results/sql-time-cache-20000.json)). The sync saves the slots of each
  series in their own transaction, then saves the cursor in another (`sync.ts:315-317`). The store runs WAL with the
  default `synchronous = FULL`, so each commit waits for the disk.
- **Repeated reads per entry.** `SELECT * FROM calendar_entries WHERE id = ?` ran 374,025 times for 48,225 entries:
  `entryRow` is called again after each step of `saveEntries` (`src/store/sqlite/calendar.ts:544,648,654`). Other
  lookups also repeat once per attendee: the identity of an email ran 563,304 times.
- **`zoneOk` in gcal** (`src/calendar-source.ts:68-76`) builds an `Intl.DateTimeFormat` to check a time zone. It
  runs 2–3 times per event. In the 50k cache profile, it is 16.9 s of 150 s self time, the largest cost outside
  SQLite ([`results/profile-sync-cache-50000.txt`](results/profile-sync-cache-50000.txt)).

Every query of the write path uses an index. The plans for `existingFor` (3 lookups), `refreshAround`,
`cancelOccurrences`, `markUnseen`, the series back-fill and `store.event()` all show `SEARCH … USING INDEX`. The
cost is in the number of statements and commits, not in a scan.

**A bug found on the way: an interrupted `--rescan` rescans only the calendars it reached.** The 50k
`sync --rescan` stopped at its request budget and was run again without the flag, as the hint says. That second run
gave the remaining calendars an incremental round instead of a full one: 13 of 20 list pages and 1,125 of 2,249
series were asked. Afterwards, the cursors of calendars 3 and 4 still held the `fullAt` of the first sync. The run
saves no round for a calendar it skips after the stop (`sync.ts:409`, `if (stopped) continue`). The next run then
picks the round from the age of the last full round (`sync.ts:215`), and the rescan request is lost.

A second, smaller bug: without a meaning model, `search` says to run `gcal models download e5-small`, but gcal
has no `models` command, and that command fails with `input.invalid`.

The budget also splits runs earlier than expected. Even with `--timeout 30m`, the 50k first sync took 3 runs. The
request budget assumes 2 s per request (`src/background/budget.ts:26`, `DEFAULT_REQUEST_MS`), and the default
command deadline is 30 s (`src/cli/execution.ts:6`).

### 4. MCP, median of 15 (p95), ms ([`results/mcp-*.json`](results/))

`gcal personal mcp serve` over stdio, then `gcal_read` with `{"command":"events list","arguments":{"words":["week"]}}`:

| store, build | spawn → `initialize` | `tools/list` | `gcal_read` events list week |
| --- | ---: | ---: | ---: |
| 5k stock | 758 (869) | 5 | 93 (110) |
| 5k bundled | 366 (482) | 4 | 80 (139) |
| 50k stock | 720 (1,335) | 5 | 293 (376) |
| 50k bundled | 397 (504) | 4 | 321 (388) |

The bundle halves the MCP server's start. The tool call on the 50k store is the unbounded week query above, plus
about 111 KB of answer.

## What it showed

Ranked by what each fix saves:

1. **Cache prepared statements in cli-core's `node:sqlite` driver**: first sync 2.9–4.7 times faster in these runs.
   The driver is shared, so every CLI's store writes are likely to gain. That was not measured here.
2. **Bundle gcal** as drive, memo and tg are bundled. Change the `build` line in gcal's `package.json` to
   `tsc --build --force && cli-dev bundle --bin dist/bin/gcal.js` and add esbuild as a dev dependency. Every short
   command and the MCP server start drop by about half: `--help` 587 → 260 ms, `events show` 421 → 204 ms.
3. **Fewer commits per sync.** Save the slots of several series, and the cursor, in one transaction. Another option
   is `synchronous = NORMAL` under WAL, which keeps the file consistent and can lose only the last transactions on a
   power cut. That is a store-wide choice.
4. **Fewer `events.instances` requests.** The daily full round asks Google for the slots of every repeating event
   again (2,249 requests at 50k). Expand the series locally from the `RRULE` (the engine already supports
   `expands: "local"`), or ask again only for series whose `updated` changed. A `fields` mask on `events.list` and
   `events.instances` would also shrink each page. The size of that saving is inferred, not measured.
5. **Cache the checked time zones** in gcal's `zoneOk` with a `Map`: about 11% of the sync CPU at 50k.
6. **Give the events list a lower time bound SQLite can seek on**: about 150 ms off `events list` and every
   `gcal_read` of it at 50k. Add a lower bound on `starts_at` outside the `CASE`. That needs the longest event span
   as its margin, or an index on `ends_at`.
7. **`people list`**: read the participants of all listed events in one query instead of 1,000 `store.event()`
   calls.
8. **Load less at start.** cli-core's `cli` entry pulls in meeting preparation, attachments, embeddings and reply
   templates for every command. gcal uses none of them.

## What was not measured

- A quiet machine. The load average was high, and the absolute numbers are higher than they would be on a quiet
  machine. The ratios between variants come from alternating rounds.
- Whether the bundled gcal gives byte-identical output to the stock build under npm and pnpm, and whether a running
  MCP server survives an upgrade. [bundle-rollout](../../startup/bundle-rollout/README.md) checked this for the other
  CLIs, but not for gcal.
- Whether the statement cache is correct. No cli-core test ran against the patched driver. The Bun driver
  (`bun-sqlite.ts`) was not checked.
- Real Google latency, real payload sizes and the saving from a `fields` mask.
- `search` with a meaning model (none was downloaded), `sync --embed`, and the plan of the `search` query.
- Cold starts with an empty compile cache.
- Write commands (`events create`, `update`, `delete`, `respond`) and `calendars busy`.
