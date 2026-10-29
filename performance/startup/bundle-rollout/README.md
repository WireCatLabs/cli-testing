# The bundle across the WireCat CLIs

Measured 2026-10-27, with the scripts beside this page.

## Why we ran it

tg 0.100.0 starts from an esbuild bundle and halved every short command ([tg-bundle](../tg-bundle/README.md)); an
in-place upgrade with a server running then needed one more fix ([tg-bundle-upgrade](../tg-bundle-upgrade/README.md)).
The owner approved moving tg's script into one shared build command, `cli-dev bundle` in cli-base
([cli-base#382](https://github.com/WireCatLabs/cli-base/pull/382), rule
[WC-LAY-10](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/layout.md)), and bringing it to every
CLI, one at a time.

The questions, for each CLI:

1. Does the shared command build it, and which packages must stay outside the bundle?
2. Is every output byte-identical before and after, under npm's and pnpm's layouts?
3. Does a running MCP server keep answering after an in-place upgrade from one bundle to another, also when it was
   started with a flag before `mcp serve`?
4. Does the start gain 15% or more? Below that, or not identical, the CLI does not move.
5. For tg: does the shared command change nothing against tg's own script?

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node 24.19.0, npm 11.17.0,
  pnpm 11.28.8, Bun 1.3.14. The 1-minute load average was 2.1–4.2 during the timings, 5.2–5.9 for drive (each round's
  load is in `rounds-<cli>.txt`).
- **Code.** Each CLI on cli-core 0.469.0 and cli-base 0.65.0. `before` is the CLI's `main` before its bundle pull
  request (`tsc`'s `dist/`; for tg, tg's own `scripts/bundle.ts`), `after` is the bundle pull request. Both are built
  with `pnpm build` and packed with `npm pack --ignore-scripts` ([`final.sh`](final.sh)).
- **Isolation.** Every run has its own `HOME`, XDG folders, `MESSAGING_STORE`, `TMPDIR` and npm prefix or `PNPM_HOME`;
  `DBUS_SESSION_BUS_ADDRESS` is unset, so the keyring is out of reach. No account and no network.
- **Commands.** [`final.sh`](final.sh) runs, per CLI:
  - [`installed.sh`](installed.sh): installs each tarball with npm and with pnpm, runs the CLI's command list
    (`commands-<cli>.txt`, 22–27 commands) with [`identity.sh`](identity.sh), one MCP session
    ([`mcp-session.mjs`](mcp-session.mjs): initialize, tools, prompts, resources; it fails unless three tools are
    listed) and [`assets-probe.mjs`](assets-probe.mjs) (every file path the bundle rewrote exists).
    [`compare.sh`](compare.sh) compares before with after after normalising temp and install paths, run ids,
    timestamps and durations, and refuses a run whose MCP session or `commands --json` is empty.
  - [`upgrade.sh`](upgrade.sh), twice: installs bundle A, opens an MCP session over stdio, upgrades in place to B (the
    next patch version, every chunk renamed: the worst case), then the same session answers the reads in
    `reads-<cli>.json`. Once with `<profile> mcp serve`, once with a flag before it (`--quiet`, `--read-only` or
    `--no-record`). [`trace-loads.mjs`](trace-loads.mjs) counts the bundle files the server loaded and logs every
    import that failed.
  - [`bench.mjs`](bench.mjs): each command once untimed, then 10 rounds pinned to CPUs 0–3, before and after
    alternating, warm (one compile cache per variant) and cold (an empty one for every run); median wall and CPU.

## Results

### Start time, median of 10, ms (wall / CPU) ([raw](results.txt))

| CLI | command | warm before | warm after | change | cold change |
| --- | --- | ---: | ---: | ---: | ---: |
| max | `messages list --help` | 436 / 570 | 211 / 265 | **−52%** | −51% |
| wa | `messages list --help` | 416 / 540 | 200 / 250 | **−52%** | −50% |
| zm | `meetings list --help` | 422 / 555 | 186 / 230 | **−56%** | −52% |
| memo | `search all --help` | 420 / 540 | 186 / 235 | **−56%** | −52% |
| drive | `search --help` | 453 / 610 | 219 / 280 | **−52%** | −48% |
| cli-template (`clidev`) | `config show --help` | 366 | 151 | **−59%** | — |
| tg (own script → shared) | `messages list --help` | 204 / 250 | 208 / 260 | +2% (noise) | +3% (noise) |

Every other command measured moves the same way: `--help` −50 to −55%, an offline read −43 to −54%. `--version` halves
in every CLI (max 37 → 19 ms, drive 44 → 20, tg 34 → 20): the loader answers it from the version built into it,
before any of the bundle loads. cli-template's skeleton was timed from its repository's `dist/`: its package installs
the `cli-template` scaffolder, not `clidev`.

### Per CLI

| CLI | released with the bundle | outside the bundle, besides the shared defaults | identical (npm, pnpm) | asset paths | upgrade, `mcp serve` / with a flag | tarball |
| --- | --- | --- | --- | ---: | --- | --- |
| tg | 0.103.0 | `@mtcute/*`, `undici` | yes, yes | 14 / 14 | pass / pass (148 loads each) | 3.04 → 3.04 MB |
| max | 0.84.0 | `ws` (its optional `bufferutil`, `utf-8-validate`) | yes, yes | 16 / 16 | pass / pass (139) | 0.48 → 2.99 MB |
| wa | 0.14.0 | none; the Go engine is found from wa's own module | yes, yes | 12 / 12 | pass / pass (131) | 0.30 → 2.72 MB |
| zm | 0.57.0 | none | yes, yes | 13 / 13 | pass / pass (210) | 0.26 → 2.78 MB |
| memo | 0.120.0 | none | yes, yes | 12 / 12 | pass / pass (107) | 0.40 → 3.12 MB |
| drive | 0.45.0 | `@googleapis/*`, `google-auth-library` (their `debug` requires an optional `supports-color`) | yes, yes | 13 / 13 | pass / pass (222) | 0.57 → 3.31 MB |
| cli-template | not released; builds every new CLI with the bundle ([#76](https://github.com/WireCatLabs/cli-template/pull/76)) | none | yes (repository `dist/`) | — | not applicable | — |

Each released version was installed from npm into an empty prefix: `--version`, `--help` and an offline read answer,
and `dist/bin/<cli>.js` is the 36-line `cli-dev bundle` loader.

The shared defaults are what cli-core and cli-base bring: native modules (`*.node`, `@napi-rs/*`, `@resvg/*`,
`@huggingface/*`, `sherpa-onnx*`, `onnxruntime-*`, `better-sqlite3`), `bun:sqlite`, `@wirecat/cli-core-onnx`,
`@wirecat/cli-core-sqlite` and `ogg-opus-decoder`. A CLI's externals were found by building with none: the build fails
and names every bundled module that would look in the wrong place ([identity summary](identity/summary.txt)).

- **Identical.** After normalising, the only difference in every CLI and layout is in `runs list --json`: the stack
  frames of a failed run's record name bundle chunks instead of cli-core's files, and runs that started in the same
  second can list in another order (the same runs, compared as a set). wa finds its Go engine in both layouts.
- **Upgrade.** In every CLI the running MCP session listed its three tools and answered every read after the upgrade,
  with each chunk renamed under it, both when started as `<profile> mcp serve` and with a flag before `mcp serve`.
  The only failed loads are optional packages that fail the same way without the bundle (`@napi-rs/canvas`, the
  keyring's other platform builds, `ws`'s `bufferutil`).
- **Smoke.** Each CLI's smoke test runs the bundle under Node (`smoke:node`, new, in CI) and Bun (`smoke:bun`): the
  bin starts the bundle, the loader preloads only chunks that exist, the loader's `--version` equals the bundle's,
  `skill show` reads the shipped skill, `doctor` finds the document readers, and, where a read needs no account, the
  store opens (tg, max, wa, zm, memo).

## What it showed

1. **Every CLI gains about half of every start, the same as tg.** Warm help and offline reads drop 43–56%, cold ones
   45–52%. Each CLI loads about 1,000 files of mostly cli-core before it does any work; the bundle replaces them with
   a few dozen.
2. **The shared command needed one per-CLI setting: the packages that stay outside.** max and drive needed one or two,
   because a bundled CommonJS library optionally required a package that is not installed. The build refused them and
   named the file, so nothing was guessed.
3. **Two bugs surfaced only in the rollout.**
   - The loader missed a server started with a flag before `mcp serve`. It looked for `serve`, `watch` or `mcp` in
     the first three words; since cli-core 0.463 the server is `mcp serve`, so `drive personal --read-only mcp serve`
     put `serve` fourth and preloaded 91 of 138 chunks instead of all. cli-base 0.65.0 skips flags
     ([cli-base#389](https://github.com/WireCatLabs/cli-base/pull/389)); every released CLI above has the fix.
   - On Windows, pnpm runs scripts through `cmd.exe`, which keeps single quotes, so `--external '@mtcute/*'` matched
     nothing and tg's first 0.103.0 release attempt failed in its Windows job. The patterns are double-quoted now
     ([tg-cli#777](https://github.com/WireCatLabs/tg-cli/pull/777), and WC-LAY-10's example).
4. **The price is size:** about 2.5 MB more to download and 10–13 MB more on disk per CLI, about 4% of an install.

## What was not measured

- drive's store reads: they need a signed-in Google profile, so its identity and upgrade checks stop at the profile.
- A server connected to a real account, the `serve` relay of tg, max and wa, memo and zoom with real data.
- Bun global installs; macOS and Windows beyond the CI and release jobs, which build and test there.
