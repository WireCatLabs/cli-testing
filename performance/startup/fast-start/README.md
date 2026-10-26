# Fast start: `--version` before the program, heavy clients on first use

Measured 2026-10-25.

## Why we ran it

The owner saw WireCat Desktop pages take seconds to load. Each page runs a few CLI commands, and each command
started slowly: `tg --version` loaded about 2,000 module files and cost 0.7–0.9 s of wall time and about 1 s of CPU
before it read its arguments (no network: checked with `strace`). AI agents call the CLIs many times, so they pay
this on every call too.

The questions:

1. Where does a start go, per tool?
2. How much do these changes save:
   - answering a bare `--version` before the program loads;
   - loading each tool's heavy client library only in the commands that need it?
3. Is loading each command's code only when it runs worth building, and would a one-file bundle do the same?

The answers fed the lazy-loading decision, cli-core's CORE-40 in its
[backlog](https://github.com/WireCatLabs/cli-core/blob/main/docs/dev/BACKLOG.md). Earlier pages on the same
question: [cold-start-and-install](../cold-start-and-install/README.md),
[what-the-cli-entry-loads](../what-the-cli-entry-loads/README.md) and
[lazy-store-and-services](../lazy-store-and-services/README.md).

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), Linux 7.0.0-38-generic, Node 24.19.0, compile cache on (the bins
  enable it). Other agents were working: load average 7–26 during the runs. That is why every comparison
  alternates its variants in each round, and why CPU time is the better column.
- **Code.** Local builds of each tool's `main` on 2026-10-25, all on cli-core 0.423.0 (`tg-cli` 0.91.0, `max-cli` 0.75.0,
  `whatsapp-cli` 0.9.0, `zoom-cli` 0.45.0, `drive-cli` 0.34.0, `cli-memo` 0.103.0).
- **Variants.**
  - `main`: the tool as it is.
  - `pr`: the tool's pull request (tg: mtcute loads when a command connects; drive: Google's libraries load when a
    command reaches Google; wa: the bin takes the app identity without the settings).
  - `+core`: the same, plus the cli-core pull request: [`harness.sh`](harness.sh) copies the tool, copies its
    installed cli-core 0.423.0 with the branch's `dist/cli/entry.js` and `dist/cli/first-run.js` and the new
    `./cli/start` export, and makes the bin import `startCli` from `./cli/start`. It links to `node_modules` and
    never writes there. Only one copy of `commander` loads.
  - `bundle`: [`bundle.sh`](bundle.sh), esbuild 0.28.2 on tg's `pr` build: one ESM file, `bun:sqlite` and
    `better-sqlite3` replaced by empty stubs, native addons left outside. `bundle+cache` starts it from a two-line
    file that turns the compile cache on first.
- **State.** The owner's machine and profiles. Read-only commands only: `--version`, `--help`, `config show --json`,
  `runs list --json`. Nothing was sent, synced, signed in or changed. Only timings are kept here.
- **Commands.**

  ```sh
  node ab.mjs 10 main=<main>/dist/bin/tg.js pr=<pr>/dist/bin/tg.js pr+core=<copy>/tool/dist/bin/tg.js
  node --import ./graph.mjs -e "await import('<cli-core>/dist/cli/index.js')"   # what each module holds in
  ```

  [`ab.mjs`](ab.mjs) runs every command once untimed per variant, then 10 rounds, the variant order rotating each
  round, and prints the median wall time and the median CPU time (user + system, from `/usr/bin/time`).

## Results

### Modules loaded by `--version`

| tool | main | pr | +core |
| --- | ---: | ---: | ---: |
| tg | 1,915 | 1,109 | 57 |
| max | 1,285 | — | 55 |
| wa | 1,125 | 1,126 | 57 |
| zm | 1,173 | — | 1,173 |
| drive | 1,380 | 1,179 | 1,179 |
| memo | 1,331 | — | 1,073 |

cli-core is 880–900 of them in every tool. tg's mtcute and @fuman were 650; drive's Google libraries about 120.
zm, drive and memo still load cli-core's `./cli` before `startCli` runs (see "What it showed").

### Median wall / CPU, ms ([raw](results-ab.txt))

| tool | command | main | pr | +core |
| --- | --- | ---: | ---: | ---: |
| tg | `--version` | 967 / 1,250 | 712 / 990 | **68 / 70** |
| tg | `--help` | 785 / 1,120 | 673 / 950 | 622 / 890 |
| tg | `config show --json` | 882 / 1,230 | 674 / 1,010 | 663 / 980 |
| tg | `runs list --json` | 860 / 1,200 | 654 / 980 | 624 / 920 |
| max | `--version` | 560 / 790 | — | **56 / 60** |
| max | `--help` | 536 / 790 | — | 571 / 790 |
| max | `config show --json` | 638 / 870 | — | 646 / 910 |
| max | `runs list --json` | 624 / 930 | — | 602 / 880 |
| wa | `--version` | 740 / 1,020 | 754 / 1,040 | **73 / 80** |
| wa | `--help` | 593 / 840 | 752 / 940 | 567 / 800 |
| wa | `config show --json` | 533 / 750 | 506 / 720 | 504 / 740 |
| wa | `runs list --json` | 549 / 820 | 531 / 750 | 498 / 750 |
| zm | `--version` | 426 / 600 | — | 394 / 600 |
| zm | `--help` | 433 / 630 | — | 437 / 650 |
| zm | `config show --json` | 434 / 640 | — | 420 / 630 |
| zm | `runs list --json` | 491 / 700 | — | 506 / 700 |
| drive | `--version` | 754 / 1,050 | 727 / 1,020 | 607 / 860 |
| drive | `--help` | 614 / 870 | 715 / 990 | 673 / 940 |
| drive | `config show --json` | 639 / 910 | 627 / 880 | 596 / 850 |
| drive | `runs list --json` | 1,248 / 1,320 | 1,212 / 1,250 | 1,198 / 1,360 |
| memo | `--version` | 477 / 710 | — | 406 / 580 |
| memo | `--help` | 593 / 850 | — | 539 / 780 |
| memo | `runs list --json` | 526 / 770 | — | 548 / 790 |

memo has no `config show` (its `config` has only `unset`); the run exits 2 and is left out. The load average rose
to 26 during the drive rows. Importing drive's `program.js` alone, alternated 15 times: main 640 ms wall / 890 ms
CPU, pr 630 / 850.

### A bundle of tg ([raw](results-bundle.txt))

| command | pr | pr+core | bundle | bundle+cache |
| --- | ---: | ---: | ---: | ---: |
| `--version` | 629 / 910 | 61 / 60 | 551 / 670 | 470 / 590 |
| `--help` | 619 / 880 | 660 / 930 | 570 / 680 | 576 / 720 |
| `config show --json` | 630 / 940 | 654 / 950 | 509 / 640 | 551 / 690 |
| `runs list --json` | 673 / 980 | 648 / 950 | 610 / 740 | 468 / 600 |

`bundle` and `bundle+cache` come from two runs (load average 6–9); compare each with its own column. The bundle is
21 MB. Its `commands --json` was byte-identical to the unbundled build's.

## What it showed

- **A bare `--version` drops from 0.6–1.0 s to 56–73 ms** in tg, max and wa once the bin takes `startCli` from
  `./cli/start` (about 55 files). The cut that made it possible: cli-core's `entry.ts` reached 837 files on its own,
  because the first-run questions imported the store and its maintenance. Loaded when a command asks, they cost
  nothing at start, and cli-core's `program.js` alone went from 847 files to about 320.
- **zm, drive and memo do not gain yet.** Each imports something that loads `./cli` before `startCli`: zm's
  `bin/main.ts` (the program and `runsDirFor`), drive's bin (`program.js`, `failure.js`), memo's bin (`failure.js`).
  Each needs a small bin change after the cli-core release.
- **tg: every command is about 200 ms wall and 220 ms CPU faster** with mtcute loaded only when a command connects.
- **drive: about 40 ms of CPU** with Google's libraries loaded on first use. That is below the noise of a full run
  at this load.
- **Every other command still pays cli-core's `./cli`: ~880 files, ~400 ms.** The module graph has no cheap cut.
  The largest module that, made lazy, would free others frees 119 of 1,056. Mounting only the command being run is
  not safe either: `config`, the bot commands, the envelope and the step hints walk the whole command tree.
- **A bundle saves about 100–150 ms wall and 300 ms CPU per command in tg**, once the compile cache is on before the
  bundle loads. It needs stubs for `bun:sqlite` and `better-sqlite3` and leaves native addons outside, so it is a
  separate build to test. It is not trivial, so this round does not ship it.

## What was not measured

- Commands that connect to a messenger or open the store for real work.
- MCP server start-up (`mcp` loads everything on purpose).
- Bun, Windows and macOS.
- A bundle of any tool other than tg, and a bundle with cli-core's `./cli/start` in front of it.
- The test steps of the tools' CI.
- A quiet machine: other agents kept the load average between 7 and 26.
