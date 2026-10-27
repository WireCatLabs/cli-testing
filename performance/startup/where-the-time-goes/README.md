# Where a command's start goes, and what the server pays per request

Measured 2026-10-27 on tg-cli, with the scripts beside this page.

## Why we ran it

A tg command still takes about 450 ms before it does any work, after the earlier rounds:
[fast start](../fast-start/README.md) (a bare `--version` before the program loads), Node's compile cache, the lazy
`bot api` group (tg-cli #749) and the [shared-command check](../../cli/shared-contract-check/README.md) made O(n)
(cli-base 0.62.0). The owner asked for quick wins only, and three questions:

1. **The server.** When `serve` or an MCP server runs a command, does each request build the program again, and what
   does that cost? Could the server build the command tree once and reuse it, given that Commander keeps parsed
   option values on its `Command` objects?
2. **Why a command is slow.** Is it the amount of code, or repeated work such as loops at start-up? Where do the
   milliseconds go: Node's own start, loading and compiling modules (which ones), or our top-level code and building
   the program?
3. **Caching between runs.** Is the compile cache really on and hit? Is there another cheap, safe cache, for example
   for `commands --json`?

The answers decided which changes ship now (only small ones that save about 10% of a common command, or much of a
server request) and which go on the list of larger options.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node 24.19.0. Every timed
  process is pinned to four CPUs with `taskset -c 0-3`, as CI does. Other agents ran tests at the same time: the
  load average is written next to each result, from 3.8 to 18. Comparisons alternate their variants every round, so
  read the differences, not the absolute numbers, across tables.
- **Code.** tg-cli `main` built with `pnpm build`: ae64c39 for the compile-cache and the first server table, 927704d
  (0.96.0) for the rest. Both use cli-core 0.449.0 and cli-base 0.62.0.
- **State.** `HOME`, the four XDG folders, `MESSAGING_STORE`, `WIRECAT_STATE_DIR`, `TMPDIR` and `NODE_COMPILE_CACHE`
  pointed at an empty folder. The config holds one profile, `bench`, with no login. No real store, account or
  message was opened.
- **Commands.** `tg messages list --help` (the program is built and help is printed), and
  `tg bench chats list --offline`, which goes through settings, permissions and the store, then exits 6 with "nothing
  recorded for profile bench yet". It measures the path to the store, not a list with rows.

```sh
node ab.mjs 15 "before=node <copy>/tool/dist/bin/tg.js messages list --help" "after=…"   # wall and CPU, alternated
node split.mjs <tg-cli> messages list --help        # Node start, import, build, run, in one process
node warm.mjs <tg-cli> 40 bench chats list --offline  # what an in-process request costs once loaded
node --cpu-prof --cpu-prof-interval 100 <tg-cli>/dist/bin/tg.js messages list --help
node phases.mjs CPU.*.cpuprofile                     # CPU time by what it was spent on
node --import ./trace.mjs <tg-cli>/dist/bin/tg.js …  # files and KB loaded per package
node --import ./resolves.mjs …                       # how many imports were resolved, by kind
node --import ./who.mjs …                            # which file first imports a package (WHO_PACKAGES=a,b)
./variant.sh <tg-cli> <out> [stub]                   # a copy of tg with cli-core and cli-base copied, optionally
                                                     # without eight top-level third-party imports
NODE_DEBUG_NATIVE=COMPILE_CACHE node <tg-cli>/dist/bin/tg.js …   # compile cache reads and writes
```

`variant.sh` copies files and symlinks the rest; it never writes into `node_modules/.pnpm`, whose files are hard
links into pnpm's store.

## Results

### 1. The time split of one command

`tg messages list --help`, one process, median of 9 ([results-split.txt](results-split.txt), load 12.6–12.9):

| phase | ms | share |
| --- | ---: | ---: |
| Node start (`bootstrapComplete`) | 13 | 3% |
| importing `program.js`: about 1,110 module files | 394 | 83% |
| building the program the first time (`createProgram`) | 48 | 10% |
| parsing the words and printing the help | about 0–5 | 1% |

`tg bench chats list --offline` splits the same way (import 420 ms, build 53 ms); its own work, opening settings and
the store, adds about 35 ms.

CPU profiles, 3 per command, sampled every 0.1 ms, each sample attributed by its whole stack
([results-phases.txt](results-phases.txt), load 8.0):

| what the CPU did | `messages list --help` | `chats list --offline` |
| --- | ---: | ---: |
| resolving imports to files: URLs, `package.json` lookups, `stat`, `realpath` | 176 ms (35%) | 182 ms (33%) |
| modules' top-level code (and the command's async work) | 85 ms (17%) | 116 ms (21%) |
| compiling, with the compile cache on | 75 ms (15%) | 76 ms (14%) |
| reading, linking and instantiating modules | 65 ms (13%) | 73 ms (13%) |
| garbage collection | 49 ms (10%) | 47 ms (8%) |
| building the program (`createProgram`) | 48 ms (9%) | 49 ms (9%) |
| parsing and running the command, before its first `await` | 6 ms (1%) | 6 ms (1%) |

What is loaded ([`trace.mjs`](trace.mjs)): 1,111 files. cli-core is 903 of them (5.2 MB), cli-base 53, tg itself
27; then xmldom (8 files, 270 KB), valibot (202 KB), psl (185 KB), `liquidjs` (175 KB), commander, `fflate`, `chardet`
and 15 smaller packages. Resolving them took 5,114 resolutions: 3,746 relative, 1,047 bare (505 of them
`@wirecat/cli-base`, 141 `valibot`, 119 `@wirecat/cli-base/commands`, 101 `commander`) and 321 built-ins. Node
caches a resolution per importing file, not per name, so every file that imports `@wirecat/cli-base` walks the
`node_modules` folders again. That is about 30 µs per resolution, spread evenly: no single hot spot.

Repeated work at start, inclusive CPU per profiled run:

| what | ms | where |
| --- | ---: | --- |
| checking every query field's example on every start | 20–28 | cli-base `defineQuery` → `exampleProblems`; the first `Intl.DateTimeFormat` with a time zone, in `dayBoundary`, is most of it |
| top-level code of `string-width`, reached through `cli-table3` | 10–15 | cli-base `pretty.js` |
| top-level code of `psl` (the public suffix list) | 9–13 | cli-core `domain/mentions.js` |
| the shared-command check | 5–10 | cli-base `assertSharedContracts`, already O(n) |
| `@xmldom/xmldom` freezing its tables | 5–8 | cli-core `attachments/container.js` |

There is no loop that grows with the input, and no nested loop, on the start path any more.

A larger young generation does not help: `--max-semi-space-size=16` 428 ms, `=64` 461 ms, default 427 ms
(`chats list --offline`, 12 rounds).

### 2. Eight third-party packages that only some commands use

cli-core and cli-base import psl, `@xmldom/xmldom`, `fflate` (twice), `liquidjs`, `chardet`, iconv-lite, image-size
(three files) and cli-table3 at the top of a module, and use them only inside functions. `variant.sh … stub` removes
those imports in a copy; `--help` output stayed byte-identical and the loaded files went from 1,116 to 1,057.
`stub+query` also skips the example check in `defineQuery` ([results-lazy.txt](results-lazy.txt), load 10.3–11.2,
15 rounds):

| variant | `messages list --help` wall / CPU | `chats list --offline` wall / CPU |
| --- | ---: | ---: |
| before | 425 / 560 | 454 / 590 |
| stub | 392 / 500 (−8% / −11%) | 421 / 540 (−7% / −8%) |
| stub+query | 382 / 490 (−10% / −13%) | 407 / 520 (−10% / −12%) |

A second run (load 9.6–12.4): before 415 / 560 and 443 / 590; stub 394 / 500 (−5% / −11%) and 399 / 520
(−10% / −12%); stub+query 354 / 480 and 413 / 530. A first try at load 10–11: before 510 / 680, stub 478 / 620 for
`--help` (−6% / −9%). Read the stub as 5–10% wall and 8–12% CPU.

### 3. The server: what each request pays

serve's relay ([`relay.ts`](https://github.com/WireCatLabs/cli-core/blob/main/src/background/relay.ts), `listenRelay`)
and the MCP server ([`mcp/server.ts`](https://github.com/WireCatLabs/cli-core/blob/main/src/mcp/server.ts)) both call
cli-core's `run()` in the same process for every request. `run()` builds a new program each time: `createProgram`,
the CLI's `commands()` factories, the shared-command check, the help set-up, then a new `preAction` hook and
`provide(program, environment)` for that request. The modules are already loaded, so the request pays none of the
import.

[`warm.mjs`](warm.mjs), median of 40 calls after 5 untimed ones, 3 processes ([results-warm.txt](results-warm.txt)):

| request | build the program | whole request, build included |
| --- | ---: | ---: |
| `messages list --help` (load about 4) | 11–15 ms | 11–19 ms |
| `bench chats list --offline` (load about 4) | 11 ms | 20 ms |
| `bench chats list --offline --json` (load about 4) | 11 ms | 20 ms |
| `bench chats list --offline` (load 16–18) | 16–18 ms | 33–36 ms |

A client that relays to a running serve still starts its own process first: the relay is chosen inside `preAction`,
after the whole program is loaded and built, so a relayed `tg …` pays the same ~430 ms locally.

Reusing one program across requests is not safe as the code stands:

- Both servers run requests at the same time. The relay starts `serve()` for each connection without waiting, and the
  MCP server starts `runCommandForAgent` without waiting.
- Commander 15 can parse the same tree again (`saveStateBeforeParse` / `restoreStateBeforeParse` in
  `commander/lib/command.js`), but only one parse at a time: option values, `args` and `processedArgs` live on the
  shared `Command` objects.
- `run()` attaches per-request state to the program: a `preAction` hook closing over that request's output control
  and input, and `provide(program, environment)` with its streams, signal and exit code. On a shared tree the hooks
  would pile up and requests would see each other's environment.

### 4. Caching between runs

- **The compile cache is on and hit.** Every CLI's bin calls `module.enableCompileCache()` with no folder, so Node uses
  `NODE_COMPILE_CACHE` or else `<os.tmpdir()>/node-compile-cache` (`/tmp/node-compile-cache` here, 28 MB). With
  `NODE_DEBUG_NATIVE=COMPILE_CACHE`, a second `tg messages list --help` read 1,089 entries and accepted 1,095 code
  caches, against 1,111 files loaded. The bin's static `import` of `@wirecat/cli-base` runs before the call, so those
  few files are not cached; that is a few milliseconds.
- **What it saves** ([results-cache.txt](results-cache.txt), load 3.8): `messages list --help` 408 ms with the cache,
  495 without (−18%); `chats list --offline` 428 against 521 (−18%).
- **It is cold after every reboot.** `/tmp` here is on the root file system but is emptied at boot: after this
  machine restarted, only the cache written since was there. The first start of each CLI after a reboot pays the
  extra ~90 ms once.
- **`commands --json`** takes about 100 ms more than `--help` (740 against 652 ms at load 13–17,
  [results-commands.txt](results-commands.txt)): describing the whole tree and writing 722 KB of JSON. A cache of
  that document keyed by the CLI's and cli-core's versions would save those 100 ms on that one command, but not
  the ~400 ms import every command pays.

## What it showed

1. **The server rebuilds the program for every request, and it costs about 11 ms of a 20 ms request** once the code is
   loaded. Reusing the tree is not a quick win: requests run concurrently, and Commander and `run()` keep
   per-request state on the tree. A safe version would need a pool of programs, or `run()` restructured so that no
   request state lives on the `Command` objects. The gain, about 11 ms per request, matters for a busy MCP session of
   small calls and not at all next to a command that reads the network.
2. **A command is slow because of how much code it loads, not because of a loop.** 83% of the wall time is importing
   about 1,110 files. Within that, the biggest share is not compiling (15%, the cache works) but resolving imports
   (about 35% of CPU): 5,114 resolutions at about 30 µs each. Building the program is 10%. The only repeated work left
   at start is the example check of every query (20–28 ms CPU) and the top-level code of a few third-party packages.
3. **No quick win reached the bar of about 10% wall on its own.** Not importing eight third-party packages at start
   saves 5–10% wall and 8–12% CPU; adding a start without the query example check reaches about 10% wall (7–15%
   across runs). Both are larger than "small": eight files in cli-core with synchronous call sites (psl, iconv-lite
   and image-size are used from synchronous code, so they need a lazy `require` rather than `await import()`), and a
   decision in cli-base on when a broken example should fail. Neither shipped in this round.
4. **The compile cache is the cache that matters, and it already works** (−18%). The only cheap improvement is where
   it lives: a folder that survives a reboot.

### Larger options, with the gains measured here

| option | gain | cost |
| --- | --- | --- |
| a one-file bundle of each CLI (see [fast start](../fast-start/README.md)) | 100–150 ms wall, ~300 ms CPU per command: it removes most of the 35% spent resolving | a separate build with stubs for `bun:sqlite` and `better-sqlite3` |
| lazy loading of the eight third-party packages | 5–10% wall, 8–12% CPU per command | eight files in cli-core and one in cli-base; a `createRequire` getter where the caller is synchronous |
| check query examples in tests or on first use, not at start | about 2–3% wall more | cli-base decides when a broken example fails |
| reuse built programs in serve and MCP | about 11 ms per request | a pool or a restructured `run()` |
| decide on the client whether to relay, before loading the program | ~430 ms → tens of ms for a relayed command | the relay decision needs the command's effects and permissions, which are known only from the tree |
| a compile cache folder that survives a reboot (`enableCompileCache(<cache dir>)`) | ~90 ms on the first start after a reboot | one line in each bin; the folder has to be cleaned of old Node versions |
| cache the `commands --json` document by versions | ~100 ms on that command only | a cache to invalidate; nothing for other commands |

## What was not measured

- A command that reads rows: `chats list --offline` stops at "nothing recorded". A store with data, and the date
  formatting in its output, may pay the `Intl` cost that the query check pays now.
- max, wa, zm, memo and drive. Their programs are built the same way from the same cli-core.
- An MCP or relay request end to end over its socket; `warm.mjs` calls `run()` directly.
- Bun, macOS and Windows, and a cold operating-system file cache.
- Memory.
- A quiet machine: the load average was 3.8 to 18.
