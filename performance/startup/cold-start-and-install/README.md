# Cold start and install size of the five CLIs

Measured 2026-10-15 (IDEA-172).

## Why we ran it

An external architecture review said `@wirecat/cli-core`, the library every WireCat CLI is built on, pulls heavy
dependencies (ECharts, sherpa-onnx, the Anthropic SDK, the MCP SDK, document parsers), and that a simple command
such as `drive --help` or `tg commands --json` should not load them. Nobody had measured it.

The question: do simple commands pay for the heavy dependencies, at start or on disk? The answer decides whether
cli-core gets lazy or optional entry points for those dependencies. We split it only if the numbers show a real
cost.

## Setup

- **What was installed.** The latest published version of each CLI, each one alone in its own folder, with
  `npm install --ignore-scripts @wirecat/<cli>@latest`. No install script is needed for these commands. The
  CLIs' own `postinstall` acts only on a global install. `better-sqlite3` (tg-cli, through `@mtcute/node`) has
  a native build script, but no measured command loads its native part.

  | CLI | version | cli-core | cli-base |
  |---|---|---|---|
  | `@wirecat/tg-cli` | 0.58.0 | 0.285.0 | 0.31.1 |
  | `@wirecat/max-cli` | 0.53.0 | 0.279.0 | 0.28.1 |
  | `@wirecat/cli-memo` | 0.38.0 | 0.285.0 | 0.31.1 |
  | `@wirecat/drive-cli` | 0.8.1 | 0.283.0 | 0.31.1 |
  | `@wirecat/zoom-cli` | 0.17.1 | 0.285.0 | 0.31.1 |

- **State.** Every run had `HOME`, `MESSAGING_STORE` and `WIRECAT_STATE_DIR` set to empty folders inside the
  bench folder. No account, no profile, no store. No personal data was involved.
- **Commands.** `--version`, `--help` and `commands --json`, run as `node <package>/dist/bin/<bin>.js …`, which is
  what the npm launcher runs.
- **Metrics.**
  - Install size: `du -sk node_modules`. Packages: entries in `package-lock.json`. Biggest packages: `du` of
    each top-level folder in `node_modules`, nested dependencies counted in their parent.
  - "Optional on disk": the summed size of the packages that only some commands need: echarts and zrender,
    `@resvg/*`, `@napi-rs/canvas`, `@anthropic-ai/sdk`, sherpa-onnx, onnxruntime-common,
    `@wirecat/cli-core-onnx`, `@wirecat/cli-core-sqlite`, `@huggingface/tokenizers`, ogg-opus-decoder and
    `@wasm-audio-decoders/*`, unpdf, mammoth, word-extractor, defuddle, linkedom, `@mixmark-io/domino`.
  - Cold start: wall time of the whole process, 1 warm-up run and then the median of 10 runs. The operating
    system's file cache is warm. The same for `--help` with a warm `NODE_COMPILE_CACHE`, and for
    `await import(<package>)` alone in each install folder.
  - Loaded modules: [trace-hook.mjs](trace-hook.mjs), loaded with `node --import`, records every URL that
    goes through Node's module `load` hook (`module.registerHooks`, so both `import` and `require`) and every
    `process.dlopen` call (native addons).
  - Peak memory: `/usr/bin/time -f %M` for `--help`, the median of 5 runs.
- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic x86_64 (Ubuntu), Node
  v24.19.0, npm 11.17.0. Other work was running: the load average was 15 during the second run. A bare
  `node -e 0` took 29 ms (median).
- **Run.**

  ```sh
  node bench.mjs ~/.cache/startup-bench-$(date +%F) > results.json
  ```

  `bench.mjs` installs the five CLIs into the folder you pass, measures them and prints JSON. Progress goes to
  stderr. Add `--skip-install` to measure an existing install again. Full output of the second run:
  [results.json](results.json).

## Results

### Install

| CLI | installed | packages | optional on disk | biggest packages (MB) |
|---|---|---|---|---|
| tg | 278 MB | 197 | 169 MB | echarts 61.4, @mtcute/core 21.5, cli-core 19.6, @anthropic-ai/sdk 17.6, sherpa-onnx 14.7 |
| max | 241 MB | 152 | 169 MB | echarts 61.4, cli-core 19.8, @anthropic-ai/sdk 17.6, sherpa-onnx 14.7, cli-core-onnx 13.7 |
| memo | 242 MB | 153 | 169 MB | echarts 61.4, cli-core 19.6, @anthropic-ai/sdk 17.6, sherpa-onnx 14.7, cli-core-onnx 13.7 |
| drive | 255 MB | 200 | 169 MB | echarts 61.4, cli-core 19.1, @anthropic-ai/sdk 17.6, sherpa-onnx 14.7, cli-core-onnx 13.7 |
| zm | 256 MB | 234 | 169 MB | echarts 61.4, cli-core 19.6, @anthropic-ai/sdk 17.6, sherpa-onnx 14.7, cli-core-onnx 13.7 |

The next five, in every CLI: `@wirecat/cli-core-sqlite` 9.8, ogg-opus-decoder 9.8, `@mixmark-io/domino` 8.7,
zod 8.2 and `@wasm-audio-decoders/opus-ml` 7.9 (drive: web-streams-polyfill 8.8; tg: better-sqlite3 10.1).
Every list is in [results.json](results.json).

### Cold start (median ms of 10 runs)

| CLI | `--version` | `--help` | `--help`, first run | `commands --json` | `--help`, compile cache | peak RSS, `--help` |
|---|---|---|---|---|---|---|
| tg | 910 | 688 | 609 | 685 | 559 | 260 MB |
| max | 535 | 518 | 488 | 595 | 445 | 197 MB |
| memo | 569 | 597 | 515 | 597 | 534 | 190 MB |
| drive | 767 | 795 | 506 | 819 | 550 | 197 MB |
| zm | 657 | 720 | 590 | 757 | 696 | 185 MB |

"First run" is the same command in an earlier run of the same script, at a lower load. The difference between
the two runs (up to 290 ms for drive) is machine noise. Read every number here as about 0.5 to 0.8 seconds.

Importing one package alone, in the same folders (median ms, process start included, `node -e 0` is 29 ms):
`@modelcontextprotocol/server` 86 to 148, `@wirecat/cli-base` 53 to 83, `@wirecat/cli-core` (its root entry) 107
to 182.

### What `--help` and `commands --json` load

Both commands load the same files in each CLI. No native addon is loaded by any of them.

| CLI | files loaded | packages loaded | heavy packages loaded |
|---|---|---|---|
| tg | 1,727 | 55 | MCP SDK, better-sqlite3 (JavaScript only), @mtcute |
| max | 1,084 | 38 | MCP SDK |
| memo | 1,101 | 40 | MCP SDK |
| drive | 1,078 | 76 | MCP SDK, googleapis and google-auth-library |
| zm | 976 | 36 | MCP SDK |

Not loaded by any CLI: sherpa-onnx, echarts, `@resvg/resvg-js`, `@anthropic-ai/sdk`, unpdf, mammoth,
word-extractor, defuddle, linkedom, `@huggingface/tokenizers`, `@wirecat/cli-core-sqlite`, `node:sqlite`.

The files that are loaded, for `zm --help` (other CLIs are close): 649 of cli-core's 714 JavaScript files
(3.9 MB), zod (96 files, 0.8 MB) and `@modelcontextprotocol/server` (8 files, 0.8 MB). By cli-core folder: `cli`
172, `store` 111, `services` 85, `mcp` 47, `entities` 45, `meetings` 40, `domain` 26, `search` 17; the `speech`,
`charts`, `embeddings` and `readers` folders load a few files each but not the packages behind them.

One CPU profile of `zm --help`, made by hand, shows where the time goes:

```sh
node --cpu-prof --cpu-prof-dir=<dir> <zoom-cli>/dist/bin/zm.js --help
```

Of 701 ms sampled, 453 ms is inside Node itself, and 196 ms of that is `compileSourceTextModule` (compiling ES
modules). Package code running at the top level is under 25 ms per package (cli-core 23, cli-base 19, psl 15,
zod 14).

## What it showed

- **The review's claim about start time is wrong.** No simple command loads sherpa-onnx, ECharts, the Anthropic
  SDK or a document parser. cli-core already imports them only where they are used. An entry point split for
  these packages would not make `--help` faster.
- **Start time is still slow: about 0.5 to 0.8 seconds for `--version`.** Node itself starts in 29 ms. The rest
  is loading about 1,000 ES module files (1,700 for tg) before any command runs: almost all of cli-core, the MCP
  server and zod, and the CLI's own command tree. Most of it is module resolution and compilation, not package
  code. `--version` pays the same as `--help`.
- **The heavy packages cost disk, not time.** 169 MB of each CLI's 241 to 278 MB install is packages that only a
  few commands use (charts, speech, embeddings, Anthropic, document readers). ECharts alone is 61 MB.

Recommendation, for the decision this fed:

1. **Install size: worth splitting.** Making the 169 MB optional (optional peer dependencies of cli-core,
   or separate packages installed on first use) would cut each install to about 70 to 110 MB.
2. **Start time: not an entry point split.** The fix is to load less at start: import each command's
   module only when that command runs, and load the MCP server and zod only for `mcp`. Bundling each CLI into
   one file is the other option. Either should help `--version` and `--help` most.
3. **Compile cache:** `NODE_COMPILE_CACHE` gave 3 to 31% in this run, but the noise was as large. It needs a run
   on a quiet machine before it is worth turning on.

## What was not measured

- A cold operating system file cache (first start after a reboot). That is likely slower.
- Commands that do real work (`search`, `sync`, `transcribe`) and the time to load the heavy packages when they
  are needed.
- macOS and Windows, pnpm or global installs, and the install script of `better-sqlite3`.
- `mcp` server start time.
- A quiet machine: other work was running. The two runs differ by up to 290 ms.
