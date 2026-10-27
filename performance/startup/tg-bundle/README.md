# A bundle of tg: one start instead of about 1,110 files

Measured 2026-10-27 on tg-cli, with the scripts beside this page.

## Why we ran it

A tg command took about 400 ms before it did any work. [Where the time goes](../where-the-time-goes/README.md)
showed that 83% of it was importing about 1,110 module files (903 of them cli-core's), and that a third of the CPU
went to resolving 5,114 imports. No quick win reached 10%. Its list of larger options put a one-file bundle first.
[Fast start](../fast-start/README.md) had measured a rough bundle of tg at 100–150 ms wall and about 300 ms CPU per
command. That bundle stubbed SQLite and was not checked for identical behaviour, so it did not ship. The owner
approved trying a real one on tg first.

The questions:

1. Does a bundle that ships keep the gain? The bar was 15% on a warm `tg messages list --help`.
2. Can it keep every behaviour the same, in npm's and pnpm's layouts, with every lazy load still lazy?
3. What does it cost in package size?

The answer decided whether tg-cli merges the bundle
([tg-cli#764](https://github.com/WireCatLabs/tg-cli/pull/764)), and whether the other CLIs should follow.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node 24.19.0 (and 22.23.2 for
  the identity checks), npm 11, pnpm 11.28.8, Bun 1.3.14. Every timed process is pinned to CPUs 0–3 with `taskset`.
  Other sessions were quiet: the 1-minute load average was 2.7–3.7 during the first run and 2.9–3.5 during the
  second; each round's load is in [results.txt](results.txt).
- **Code.** `before`: tg-cli `main` at 350a088 (0.99.0, cli-core 0.452.0, cli-base 0.63.0). `after`: the pull
  request on top of it. Both built with `pnpm build`, packed with `npm pack --ignore-scripts` as the Windows workflow
  does, and installed from the tarball with `npm install -g --prefix <temp>` ([`install.sh`](install.sh)). The
  identity checks also used `pnpm add -g` with its own `PNPM_HOME` and store.
- **The bundle.** esbuild 0.28.2, the version cli-core already uses. `pnpm build` runs `tsc`, then the bundle script
  [`scripts/bundle.ts`](https://github.com/WireCatLabs/tg-cli/blob/main/scripts/bundle.ts). It bundles
  `dist/bin/tg.js` into `dist/bundle/` (ESM, split into chunks, names kept). `dist/bin/tg.js`, the path npm links
  and MCP configs name, becomes a five-line loader: it turns on the compile cache, then imports the bundle.
- **State.** `HOME`, the four XDG folders, `MESSAGING_STORE`, `WIRECAT_STATE_DIR` and `TMPDIR` in an empty temp
  folder for each variant, with one profile `bench` and no login. No real store, account or message was opened.
- **Commands.**

  ```sh
  node bench.mjs 10 <before>/prefix/bin/tg <after>/prefix/bin/tg   # warm and cold, alternated, load per round
  ./identity.sh <install dir> <out dir>                             # 28 commands and an MCP session, normalised
  node graph.mjs <dist/bundle> tg.js                                # what the entry loads statically
  cp assets-probe.mjs <installed dist/bundle>/ && node <that copy>  # every rewritten file path exists
  NODE_DEBUG_NATIVE=COMPILE_CACHE tg messages list --help           # the chunks come from the compile cache
  ```

  [`bench.mjs`](bench.mjs) runs `--version`, `--help`, `messages list --help`, `bot api get-me --help` and
  `bench chats list --offline`. Each runs untimed once, then for 10 rounds, the variant order alternating each round.
  "Warm" keeps one compile cache folder per variant; "cold" gives every run an empty one, as after an install or a
  reboot. It prints the median wall time and the median CPU time (user + system, from `/usr/bin/time`).

## Results

### Start time, median of 10, ms (wall / CPU) ([raw](results.txt))

| command | warm before | warm after | change | cold before | cold after | change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `--version` | 39 / 30 | 31 / 20 | −8 ms | 44 / 40 | 34 / 20 | −10 ms |
| `--help` | 398 / 520 | 203 / 260 | **−49%** | 550 / 670 | 281 / 340 | **−49%** |
| `messages list --help` | 389 / 510 | 192 / 250 | **−51%** | 534 / 660 | 272 / 340 | **−49%** |
| `bot api get-me --help` | 417 / 550 | 219 / 290 | **−47%** | 574 / 710 | 313 / 390 | **−45%** |
| `bench chats list --offline` | 408 / 535 | 221 / 290 | **−46%** | 573 / 700 | 305 / 380 | **−47%** |

The second run (load 2.9–3.5) agreed within 5 ms: warm `messages list --help` 393 / 510 → 193 / 250, cold
540 / 670 → 272 / 335, warm `chats list --offline` 424 / 540 → 224 / 290.

### What a command loads

- `messages list --help`: 55 files, all of them accepted from the compile cache on the second run, against about 1,110
  before. The entry loads 5 files (199 KB); the program chunk and its static chunks are 51 files (6.25 MB). The bundle
  has 99 files in all.
- The Bot API group, the mtcute adapter, both SQLite drivers, echarts and undici are reached only through `import()`.
  No chunk on the start path imports `node:sqlite`, `@mtcute/*` or `bot-api`. On Node 22 no SQLite warning appears.
- `--version` is still answered before the program loads.

### Identical behaviour

[`identity.sh`](identity.sh) ran 28 commands and two MCP sessions ([`mcp-probe.mjs`](mcp-probe.mjs): initialize,
tools, prompts and every prompt) against each of the four installs: before and after, with npm and with pnpm. Among
them: `commands --json` (722 KB), `--help`, `guide`, `skill show` for tg's skill and both of cli-core's, `doctor`,
`config show`, `mcp config`, the store-opening commands, an unknown command and a usage error. Once run ids,
timestamps and durations are normalised, every output is byte-identical between before and after, in both layouts.
Two differences remain, and both are expected:

- **Stack frames in a failed run's record** (`runs list --json`) name bundle chunks, such as
  `bundle/chunk-CIBJGQOQ.js:1183`, instead of cli-core's files. One frame reads `_Command`, not `Command`: V8 uses
  the declared name, and esbuild renamed the class inside the bundle. The class's `name` property is still
  `Command`.
- **pnpm's folder hash** in `mcp config`: pnpm names a package's folder by its content, and the content changed.

With Node 22.23.2, `--version`, `messages list --help`, `chats list --offline`, `guide`, `doctor --json` and
`commands --json` gave the same output before and after. The store that `chats list --offline` creates has the same
597 objects in all four installs. Under Bun, from the repository's pnpm layout, `chats list --offline` reaches the
store (`item.not-found`) and `doctor` finds every reader, as before. `pnpm smoke:node` and `pnpm smoke:bun` pass, and
so do the test suite (2,180 tests, which run against `src/`), the shared-contract check (`contracts:check`: help,
`commands --json`, two usage errors, the MCP schema), `security:no-leak`, `lint:commands` and `package:check`.
None of the packages left outside the bundle depends on cli-base, cli-core, commander or valibot, so no second copy
of their classes loads; cli-base's `isCliError` checks a brand, not `instanceof`, in any case.

### What had to change to make it identical

| problem | what broke | fix |
| --- | --- | --- |
| `import.meta.url` in a module moved into a chunk points at the chunk | `tg guide` found no scenarios; cli-core's skills, chart font, `package.json` version and the embeddings child script would resolve next to the chunk | the build replaces `import.meta.url` in tg's, cli-core's and cli-base's modules with the module's original URL: under `dist/` for tg, or under the installed package, found with `import.meta.resolve("@wirecat/cli-core")` |
| a package loaded at run time resolves from the chunk, which is tg's folder | under pnpm, `doctor` showed every document reader as missing, and opening the store failed with `store.vector-extension-missing`: pnpm puts cli-core's dependencies beside cli-core, not beside tg. npm's flat layout hid it | in cli-core's and cli-base's modules, `import.meta.resolve(x)` and `import()` of a package outside the bundle resolve from the original module. `module.registerHooks` adds a resolve hook for that one call and removes it after, so Node gives its own answer from the right parent |
| the same under Bun, which has no `registerHooks` | in this repository's pnpm layout, Bun lost the store and the readers the same way; the first smoke test missed it, because its offline read had no profile and stopped before the store | under Bun, `Bun.resolveSync(specifier, <the original module's folder>)`; when it finds nothing, the plain lookup keeps Bun's own error. The smoke test now sets a profile, requires `item.not-found` from the store, and checks that `doctor` finds the readers |
| `await import("yaml")` of a CommonJS package | `tg guide` crashed: Node gives a CommonJS module's named exports (`parseDocument`), a split esbuild chunk gives only `default` | a dynamic import of CommonJS goes through a module that exports exactly the names Node finds (`Object.keys` of Node's own import, `module.exports` included) |
| esbuild renames clashing top-level names (`run` → `run2`) | function and class `name` values reach errors | `keepNames` |
| a worker started from its own file (`@eshaz/web-worker`, under `ogg-opus-decoder`) | voice transcription would start a worker from a chunk | `ogg-opus-decoder` stays outside the bundle |
| native modules, `bun:sqlite`, mtcute and undici | can't be bundled, or must resolve as tg's own dependency | outside the bundle: `*.node`, `@napi-rs/*`, `@resvg/*`, `@huggingface/*`, `sherpa-onnx*`, `onnxruntime-*`, `@wirecat/cli-core-onnx`, `@wirecat/cli-core-sqlite`, `@mtcute/*`, `undici`, `better-sqlite3` |
| the compile cache | the bundle's own `enableCompileCache()` would come after its chunks compiled | the loader turns it on before importing the bundle |

The build fails when a bundled third-party module uses `import.meta`, `__dirname`, `__filename` or
`require.resolve`. Three were read and allowed: commander and `@colors/colors` mention them only in comments and
messages, and liquidjs resolves with explicit `paths`. It also fails when a bundled module outside tg imports a
package that stays outside. All 14 rewritten file paths exist in both installed layouts ([`assets-probe.mjs`](assets-probe.mjs)).

### Package size

| | before | after |
| --- | ---: | ---: |
| tarball | 503 KB | 3.02 MB |
| tg's package, unpacked | 4.1 MB, 269 files | 16.1 MB, 368 files |
| the whole npm install, dependencies included | 258 MB | 270 MB (+4.7%) |

The bundle (12 MB) duplicates code that is still installed: cli-core and cli-base stay dependencies for their skills,
fonts, recipes, child scripts and native packages. Whitespace minification made it 8.9 MB and was no faster, so the
bundle is not minified: stack traces stay readable.

## What it showed

1. **The gain holds in a bundle that ships: about half of every start.** Warm `messages list --help` went from 389 to
   192 ms wall (−51%) and from 510 to 250 ms CPU. Cold starts improved by the same share, 534 to 272 ms. `--version`
   was already answered before the program loads and stays at about 30 ms. The rough bundle in fast start saved less
   (100–150 ms), probably because it was one file with no chunks and ran at load 6–9; this was not measured.
2. **Identical behaviour needs the fixes in the table above, and npm alone would have hidden the package lookups.** The
   package lookups that cli-core does from its own place broke only under pnpm's layout, under Node and Bun alike;
   the CommonJS named-export difference broke only `guide`. Each now fails the build, or is covered by the smoke test, if it
   comes back.
3. **The cost is size**, 2.5 MB more to download and 12 MB more on disk.

### How it carries to the other CLIs

max, wa, zm, memo and drive start the same way: a `dist/bin/<x>.js` with cli-core's `startCli`, and a `tsc` build.
cli-core and cli-base are most of what they load, so the same script should give a similar share. It needs, per
CLI:

- the bin name, and its own outside packages: max's `ws` and `sherpa-onnx`, drive's Google client libraries (large
  CommonJS, not checked), and memo's `yaml` (now handled);
- a run of the identity set under npm and pnpm, since a CLI may load its own packages by name.

The script's knowledge is mostly about cli-core: where it looks for files, which packages it loads by name. So it
belongs in one shared place, not copied five times: a `cli-dev bundle` command in cli-base, with the outside
packages as configuration, and a cli-base standard once tg has shipped one release with it. cli-template would then
call it in its `build`. A simpler bundle would need cli-core to stop finding files and packages from its own place:
for example a `./resolve` export that resolves from cli-core's folder.

## What was not measured

- Commands that connect to Telegram. They still load mtcute's ~650 files outside the bundle, as before.
- macOS and Windows timings. The pull request's CI covers their install and run (`install-windows.yml`,
  `platform-run`), not their speed.
- Bun's speed, and a global `bun add -g` install. Bun was checked from the repository's pnpm layout only.
- A store with rows, and MCP or serve requests after the start.
- Memory.
- An installed CLI upgraded in place with servers running: measured in [tg-bundle-upgrade](../tg-bundle-upgrade/README.md).
