# The bundle, rolled out to every WireCat CLI

Measured 2026-10-27, with the scripts beside this page.

## Why we ran it

tg 0.100.0 starts from an esbuild bundle and halved every short command ([tg-bundle](../tg-bundle/README.md)); an
in-place upgrade with a server running then needed one more fix ([tg-bundle-upgrade](../tg-bundle-upgrade/README.md)).
The owner approved moving tg's script into one shared build command, `cli-dev bundle` in cli-base 0.64.0
([cli-base#382](https://github.com/WireCatLabs/cli-base/pull/382), rule
[WC-LAY-10](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/layout.md)), and bringing it to the other
CLIs one at a time.

The questions, for each CLI:

1. Does the shared command build it, and which packages must stay outside the bundle?
2. Is every output byte-identical before and after, under npm's and pnpm's layouts?
3. Does a running MCP server keep answering after an in-place upgrade from one bundle to another?
4. Does the start gain 15% or more? Below that, or not identical, the CLI does not move.
5. For tg: does the shared command change nothing against tg's own script?

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node 24.19.0, npm 11.17.0,
  pnpm 11.28.8, Bun 1.3.14. Other sessions were busy: the 1-minute load average was 11–36 during the timings (each
  round's load is in `rounds-<cli>.txt`). Before and after alternate every round, so the load hits both; the absolute
  numbers are higher than on a quiet machine, the ratios are what to read.
- **Code.** Each CLI's `main` on 2026-10-27 (max 0.82.0, wa 0.13.0, zm 0.55.0, memo 0.117.0, drive 0.43.0,
  cli-template 0.8.0, tg 0.100.0), with the cli-core and cli-base it pins. `before` is `tsc`'s `dist/`; `after` is the
  same `dist/` bundled by `cli-dev bundle` from cli-base 0.64.0's code ([`pack.sh`](pack.sh)). Both are packed with
  `npm pack --ignore-scripts`. For tg, `before` is tg's own `scripts/bundle.ts` and `after` is `cli-dev bundle`, on the
  same `dist/`.
- **Isolation.** Every run has its own `HOME`, XDG folders, `MESSAGING_STORE`, `TMPDIR` and npm prefix or `PNPM_HOME`;
  `DBUS_SESSION_BUS_ADDRESS` is unset, so the keyring is out of reach. No account and no network.
- **Commands.**

  ```sh
  OUT=work/results ./check-cli.sh max ~/src/max-cli max commands-max.txt "smoke mcp" --bin dist/bin/max.js --external ws
  ./make-ab.sh ~/src/max-cli work/ab/max "npx cli-dev" --bin dist/bin/max.js --external ws   # A and B for the upgrade
  MCP=mcp ./upgrade.sh max max smoke work/ab/max/A.tgz work/ab/max/B.tgz reads-max.json
  node bench.mjs 10 bench-max.json <before>/prefix/bin/max <after>/prefix/bin/max
  ```

  - [`check-cli.sh`](check-cli.sh) packs both builds, installs each with npm and with pnpm
    ([`installed.sh`](installed.sh)), runs the CLI's command list (`commands-<cli>.txt`, 22–27 commands) with
    [`identity.sh`](identity.sh), one MCP session ([`mcp-session.mjs`](mcp-session.mjs): initialize, tools, prompts,
    resources; it fails unless three tools are listed) and [`assets-probe.mjs`](assets-probe.mjs) (every file path
    the bundle rewrote exists). [`compare.sh`](compare.sh) compares before with after after normalising temp and install
    paths, run ids, timestamps and durations, and refuses a run whose MCP session or `commands --json` is empty.
  - [`upgrade.sh`](upgrade.sh) installs bundle A, opens an MCP session over stdio, upgrades in place to B (the next
    patch version, every chunk renamed: the worst case), then the same session answers the reads in `reads-<cli>.json`.
    It passes when no call after the upgrade times out or crashes. [`trace-loads.mjs`](trace-loads.mjs) logs every
    module load that fails.
  - [`bench.mjs`](bench.mjs): each command once untimed, then 10 rounds pinned to CPUs 0–3, warm (one compile cache per
    variant) and cold (an empty one for every run), median wall and CPU.

## Results

### Start time, warm, median of 10, ms (wall / CPU) ([raw](results-2026-10-27.txt))

| CLI | command | before | after | change | cold change |
| --- | --- | ---: | ---: | ---: | ---: |
| max | `messages list --help` | 746 / 935 | 336 / 435 | **−55%** | −49% |
| max | `bench chats list --offline` | 743 / 955 | 422 / 525 | −43% | −40% |
| wa | `messages list --help` | 592 / 750 | 279 / 365 | **−53%** | −49% |
| wa | `bench chats list --offline` | 650 / 835 | 336 / 430 | −48% | −45% |
| zm | `meetings list --help` | 476 / 630 | 201 / 255 | **−58%** | −51% |
| zm | `bench meetings list` | 472 / 630 | 229 / 280 | −51% | −44% |
| memo | `search all --help` | 792 / 985 | 351 / 425 | **−56%** | −51% |
| memo | `notes list` | 771 / 975 | 351 / 425 | −54% | −51% |
| drive | `search --help` | 714 / 905 | 347 / 435 | **−51%** | −46% |
| drive | `commands --json` | 737 / 935 | 338 / 425 | −54% | −45% |
| cli-template (`clidev`), on cli-core 0.464 | `config show --help` | 366 | 151 | **−59%** | — |
| tg (own script → shared) | `messages list --help` | 447 / 485 | 458 / 490 | +2% (noise) | −13% (noise) |

`--version` halves too (max 67 → 33, drive 72 → 29 ms): the loader answers it from the version built into it, before
any of the bundle loads. cli-template's skeleton was timed from its repository's `dist/`, not from an install: its
package installs the `cli-template` scaffolder, not `clidev`.

### Per CLI

| CLI | outside the bundle, besides the shared defaults | identical (npm, pnpm) | asset paths | upgrade A → B, MCP running | tarball | package unpacked | whole install |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| max | `ws` (its optional `bufferutil`, `utf-8-validate`) | yes, yes | 16 / 16 | pass, 9 calls | 0.48 → 2.97 MB | 3.9 → 14.9 MB | 266 → 277 MB |
| wa | none (the Go engine is found from wa's own module) | yes, yes | 12 / 12 | pass, 9 calls | 0.30 → 2.70 MB | 2.5 → 13.2 MB | 283 → 293 MB |
| zm | none | yes, yes | 13 / 13 | pass, 7 calls | 0.25 → 2.76 MB | 2.3 → 13.4 MB | 264 → 275 MB |
| memo | none | yes, yes | 12 / 12 | pass, 8 calls | 0.40 → 3.10 MB | 3.5 → 15.4 MB | 271 → 283 MB |
| drive | `@googleapis/*`, `google-auth-library` (their `debug` requires an optional `supports-color`) | yes, yes | 13 / 13 | pass, 7 calls | 0.57 → 3.29 MB | 4.7 → 17.4 MB | 285 → 297 MB |
| cli-template | none | yes (repository `dist/`, on cli-core 0.464) | — | not applicable (no published bin); `kit:e2e` builds a new CLI with the bundle | — | — | — |
| tg | `@mtcute/*`, `undici` | yes ([cli-base#382](https://github.com/WireCatLabs/cli-base/pull/382)) | — | covered by [tg-bundle-upgrade](../tg-bundle-upgrade/README.md) | 3.02 → 3.02 MB | — | — |

The shared defaults are what cli-core and cli-base bring: native modules (`*.node`, `@napi-rs/*`, `@resvg/*`,
`@huggingface/*`, `sherpa-onnx*`, `onnxruntime-*`, `better-sqlite3`), `bun:sqlite`, `@wirecat/cli-core-onnx`,
`@wirecat/cli-core-sqlite` and `ogg-opus-decoder`. A CLI's externals were found by building with none: the build fails
and names every bundled module that would look in the wrong place ([identity summary](identity/summary.txt)).

- **Identical.** After normalising, the only difference in every CLI and layout is the stack frames in a failed run's
  record (`runs list --json`), which name bundle chunks instead of cli-core's files. In cli-template one listing put
  two runs that started in the same second in the other order: the faster build started both within one second, and
  the list breaks ties by run id. wa finds its Go engine (`found: true`) in both layouts.
- **Upgrade.** In every CLI the running MCP session listed its three tools and answered every read after the upgrade,
  with each chunk renamed under it; the reads that reach the store answered as before the upgrade (`item.not-found`,
  or "no stored meetings"). The only failed loads are optional native add-ons that fail the same way without the bundle
  (`bufferutil`, the keyring's other platform builds). zm and memo answer `prompts/list` and `resources/list` with
  "method not found", before and after: they serve no prompts.
- **Smoke.** Each CLI's branch adds the bundle checks to its smoke test, run under Node (`smoke:node`, new) and Bun
  (`smoke:bun`) in CI: the bin starts the bundle, the loader preloads only chunks that exist, the loader's `--version`
  equals the bundle's, `skill show` reads the shipped skill, `doctor` finds the document readers, and, where a read
  needs no account, the store opens (max, wa, zm, memo). All pass under both runtimes.

## What it showed

1. **Every CLI gains about half of every start, the same as tg.** Warm help and offline reads drop 43–58%, cold
   ones 40–51%. The gain does not depend on the CLI: each loads about 1,000 files of mostly cli-core before it does any
   work, and the bundle replaces them with a few dozen.
2. **The shared command needed only one per-CLI setting: the packages that stay outside.** max and drive each needed
   one or two, because a bundled CommonJS library optionally required a package that is not installed. The build
   refused them and named the file, so nothing was guessed.
3. **The price is size again:** about 2.5 MB more to download and 10–13 MB more on disk per CLI, about 4% of an install.
4. **cli-template ships it; the other CLIs wait for a dependency bump.** `cli-dev bundle` needs cli-base 0.64, and
   cli-core accepts it from 0.464.0 ([cli-core#2115](https://github.com/WireCatLabs/cli-core/pull/2115)). The template
   moved to 0.464 ([cli-template#75](https://github.com/WireCatLabs/cli-template/pull/75)) and builds every new CLI
   with the bundle ([cli-template#76](https://github.com/WireCatLabs/cli-template/pull/76)): `kit:e2e` made a CLI whose
   `pnpm build` bundled it and whose tests passed. The CLIs' moves to 0.464 and later also carry `mcp serve` and the
   `skill` JSON envelope, which change their code, and other sessions own those bumps. Each CLI's bundle branch
   (`perf/bundle`) waits for its bump; zm, drive and memo already pass their bundle smoke on 0.463.

## What was not measured

- The final builds. These numbers are from each CLI's `main` on its current cli-core, with the shared command's code
  from cli-base 0.64.0. The bundle branches will be checked again on the bumped dependencies before they merge.
- drive's store reads: they need a signed-in Google profile, so its identity and upgrade checks stop at the profile.
- A server connected to a real account, Bun global installs, macOS and Windows.
- A quiet machine: the load average was 11–36.
