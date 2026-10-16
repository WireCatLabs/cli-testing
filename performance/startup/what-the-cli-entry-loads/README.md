# What the `cli` entry loads, and the compile cache

Measured 2026-10-16.

## Why we ran it

[cold-start-and-install](../cold-start-and-install/README.md) found that every CLI takes 0.5 to 0.8 seconds to start
and that most of it is loading about 1,000 module files. The architecture re-review's step 6 planned to load each
command's code only when it runs ("lazy action bodies"). Before rewriting command modules, the question was: which
imports keep those files loaded, and would lazy action bodies remove them? The answer decided what step 6 builds.

## Setup

- **Builds.** Local builds, not npm: max-cli `15eea93e` (0.56.0 prepared) on cli-core 0.298.0; tg-cli `0461bf8`
  on cli-core 0.298.0; cli-core `main` at 0.299.0 before and after moving the MCP server out of the `cli`
  entry (cli-core PR `refactor/mcp-entry`).
- **State.** `HOME` set to an empty folder. No account, no store, no personal data.
- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node v24.19.0. Other work was
  running (load average 3 to 6). `node -e 0`: 22 ms median.
- **Scripts** (this folder):
  - [graph-hook.mjs](graph-hook.mjs) records every resolved import with its parent (`module.registerHooks`).
  - [reach.py](reach.py) counts the files reachable from `dist/cli/index.js` in such a trace, with and without the
    MCP SDK and zod.
  - [time.mjs](time.mjs) runs several commands alternately, N times each, and prints the median and minimum.
- **Run.**

  ```sh
  TRACE_OUT=max-help.tsv node --import ./graph-hook.mjs <max-cli>/dist/bin/max.js --help
  TRACE_OUT=entry.tsv node --import ./graph-hook.mjs --input-type=module -e "await import('<cli-core>/dist/cli/index.js')"
  python3 reach.py entry.tsv
  node time.mjs 21 "- node <tg-cli>/dist/bin/tg-nocache.js --help" "- node <tg-cli>/dist/bin/tg.js --help"
  ```

  `tg-nocache.js` is the same build with the `enableCompileCache()` line removed.

## Results

### What `max --help` loads

1,107 files: cli-core 630, max 140, zod 96, cli-base 59, then small packages. Every cli-core file comes through one
import, `@wirecat/cli-core/cli`. Loading that entry alone takes about 530 ms of the 670 ms `max --help` takes
(median of 15 runs).

Shortest import chains, from the trace:

- MCP SDK and zod: `bin/max.js` → `program.js` → `cli/index.js` → `mcp/bot/server.js` → `@modelcontextprotocol/server`.
- Services: `cli/index.js` → `services/inbox.js`; meetings: `cli/index.js` → `mcp/text.js` → `meetings/mcp/index.js`.

How many files each of the entry's re-exports reaches (of 913): `mcp/bot/server.js` 676, `cli/bot/command.js` 602,
then every messenger command factory between 552 and 587 (`messages-command.js` 587, `chats-command.js` 582,
`conversations-command.js` 552).

### The MCP server out of the `cli` entry

| | files the entry loads | `import()` of the entry, median (min) of 21 |
|---|---|---|
| before | 913 | 409 ms (361) |
| after | 801 | 347 ms (320) |

`createBotServer`, `botToolName`, `serveOverHttp`, `MCP_PATH` and `revokeAll` moved to `@wirecat/cli-core/mcp`;
only max's and tg's tests imported them from `cli`.

### Compile cache in tg's bin

| | `tg --help` | `tg --version` |
|---|---|---|
| without `enableCompileCache()` | 597 ms (574) | 598 ms (579) |
| with it | 489 ms (471) | 492 ms (465) |

Median (min) of 21 alternating runs, after two warm-up runs filled the cache.

## What it showed

- **Lazy action bodies would not pay.** Every messenger command factory reaches 550 to 590 of the entry's files on
  its own, mostly services and the store. Moving action bodies behind `await import()` removes files only if the
  factory module stops importing those services, which means rewriting about 170 command modules.
- **What does pay is small and safe.** The MCP SDK and zod were a tenth of the entry, reached through one
  re-export; moving it cut 112 files and about 15% of the entry's import time. Node's compile cache cut tg's start by
  about 18% for every later run.
- **The common core is the floor.** About 550 shared files load for any command. Going below that takes a bundle or
  splitting cli-core's services, neither of which this step does.

Decision fed: step 6 PR 5 became the compile cache in each bin and the `./mcp` entry, instead of lazy action bodies.

## What was not measured

- A cold operating system file cache, macOS, Windows and Bun (under Bun `enableCompileCache()` does nothing).
- The first run after an upgrade, which compiles everything once and writes the cache.
- `max --help` end to end with both changes, which waits for max's adoption.
- A quiet machine: read every millisecond figure as about ±10%; file counts are exact.
