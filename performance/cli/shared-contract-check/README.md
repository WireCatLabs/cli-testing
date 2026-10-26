# The shared-command check, described once per pass

Measured 2026-10-26 on [cli-base #366](https://github.com/WireCatLabs/cli-base/pull/366), with
[`bench.mjs`](bench.mjs) beside this page.

## Why we ran it

Every WireCat CLI pays for cli-base's shared-command check. It runs when a shared command is built, and again in a
`preAction` hook before each command runs. A profile of tg-cli put it at about 60% of each command's 67–90 ms setup,
even for `tg --version`, and tg's tests start commands at least 1,944 times.

The check described each protected command on a temporary root. That also described the command's whole subtree and
then threw it away. So each command was described once for itself and once more inside every group above it, and
this happened three times per run: twice when the command was built, once before it ran.

The question was how much of that cost goes away when each pass describes every command once and reuses the result.
The answer decided whether cli-base #366 was worth releasing and moving every CLI to.

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), pinned to 4 CPUs with `taskset -c 0-3` as CI does. Node 24.19.0, Linux.
  Other jobs were running on the machine at the same time.
- tg-cli at `origin/main` 2acf93f, built with `pnpm build`: 594 protected commands, 14 accepted overrides.
- **before**: cli-base `origin/main` 24826fd (0.61.3). **after**: cli-base #366 (12e7df9). Each `dist` was copied
  into the cli-base package that tg and cli-core 0.447.0 both resolve, so both used the same build.
- `HOME`, the XDG directories and `MESSAGING_STORE` pointed at a temporary directory. No real store was opened.

```sh
taskset -c 0-3 node bench.mjs /path/to/tg-cli 9 20
```

Each of the 9 processes imports tg's `dist/program.js` and then times three things:

- (a) `createProgram()`, which builds the program and registers every shared command;
- (b) one `assertSharedContracts(program)`;
- (c) one `run(["--version"])`, which builds the program and runs the check before the action.

It times each once ("first in process"), then 20 more times ("warm"). The table gives the median across processes,
in ms.

## Results

| | before | after |
| --- | ---: | ---: |
| (a) build the program, first in process | 108.5 | 76.5 |
| (a) build the program, warm | 50.0 | 35.2 |
| (b) one check, first | 29.4 | 7.1 |
| (b) one check, warm | 11.2 | 4.8 |
| (c) `run(["--version"])`, first | 58.5 | 61.1 |
| (c) `run(["--version"])`, warm | 49.2 | 29.3 |

Alternating runs (15 processes each) show how much the shared machine moved the numbers:

| run | (a) first | (b) first | (c) first | (a) warm | (b) warm | (c) warm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before | 121.6 | 23.9 | 62.8 | 46.1 | 11.0 | 46.6 |
| after | 84.5 | 10.4 | 58.1 | 36.3 | 4.7 | 33.8 |
| before | 145.2 | 35.8 | 82.2 | 69.8 | 17.6 | 69.3 |
| after | 102.8 | 9.8 | 72.2 | 45.0 | 7.7 | 42.1 |

`sharedContracts(program)` and `sharedContractOverrides(program)` returned byte-identical JSON (898 KB) with both
builds.

## What it showed

- One check costs about half as much warm (11 → 5 ms) and a quarter as much the first time (29 → 7 ms).
- Building the program is about 30% faster, because registration describes each command once instead of twice per
  ancestor.
- A warm `run(["--version"])` is about 40% faster (49 → 29 ms). That is the case for a test worker that runs many
  commands, which is where tg's 1,944 starts happen.
- The first `run` in a fresh process did not move measurably. Its time is dominated by code that has not been compiled
  yet, not by the check.
- The contracts are the same, so no CLI and no third-party program built on cli-base sees a different check.

## What was not measured

- A real `tg --version` from the shell. Since [fast start](../../startup/fast-start/README.md) it prints the version
  before the program loads, so the check is not on that path.
- max-cli, zoom-cli, memo, whatsapp-cli and drive-cli. Their programs are built the same way, but their numbers are
  not here.
- The time tg's whole test suite takes with the new version.
- Memory use.
