# What cli-base's `standards` split saved at start

Measured 2026-10-18.

## Why we ran it

[standards-split-before](../standards-split-before/README.md) found that `@wirecat/cli-base/standards`, loaded at
every CLI start, parsed six tables only the lint, audit and docs tools read. It estimated the cost of a split by
swapping the entry with a hook. The split then shipped for real:
- cli-base 0.45.0 keeps the run-time contract in `/standards` and moves the tables to `/standards/tables`;
- cli-core 0.342.0 reads `VOCABULARY` from there.

This run checks the estimate on two real builds that differ only in those two versions.

## Setup

- **Builds.** Two local builds of max-cli `884d5b2` (`origin/main`):
  - before: cli-base 0.44.5 and cli-core 0.341.0, as published;
  - after: the same commit with only cli-base 0.45.0 and cli-core 0.342.0. max needed no code change.
- **State.** `HOME` is an empty folder: no account, no store, no personal data.
- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node v24.19.0. Load average
  was about 2 during the run, much quieter than the "before" run (30 to 37).
- **Method.** The tracing and timing tools of [what-the-cli-entry-loads](../what-the-cli-entry-loads/README.md)
  (`graph-hook.mjs`, `time.mjs`). No hook swaps anything: each build loads what it ships.
- **Run.**

  ```sh
  ./run.sh <max-cli before> <max-cli after> 41
  ```

## Results

### Files and bytes (exact)

| | files loaded | bytes loaded | standards files |
|---|---|---|---|
| `max --version` / `--help`, before | 1,056 | 6,969,861 | 13 |
| `max --version` / `--help`, after | 1,050 | 6,882,699 | 7 |

- After the split, a start loads `effects`, `errors`, `index`, `log`, `output`, `registry` and `steps`.
- No longer loaded: `audit`, `flags-how`, `flags-what`, `identifiers`, `lint` and `vocabulary`.
- The difference is 87 KB. It is slightly more than the estimate's 82 KB, because `FIELD_RULES` also left `output.js`.
- `--version` and `--help` load the same set.

### Time, median (min) of 41 alternating runs

| | before | after |
|---|---|---|
| `max --version` | 415 ms (366) | 398 ms (364) |
| `max --help` | 408 ms (367) | 395 ms (360) |

## What it showed

- **The split removes what the estimate said it would:** 6 files and 0.6% of the files; 87 KB and 1.3% of the bytes.
  Every start now loads 7 standards files instead of 13.
- **The time gain is small and in the expected range.** The medians moved by 13 to 17 ms. The minimums moved by 2 to
  7 ms, which is closer to the 7 to 12 ms the estimate measured in one process. On a quiet machine the "after"
  build was faster on both commands.
- The split was made for the boundary, and the measurement confirms it: the start no longer carries the lint and
  audit tables.

Decision fed: closes the cli-base standards split plan (private, `docs_ai/plans/2026-10-18-cli-base-standards-split.md`
in cli-private). The other CLIs (tg, memo, drive, zoom) get the same saving when they move to cli-base 0.45.0 and
cli-core 0.342.0.

## What was not measured

- Other CLIs, a cold operating system file cache, macOS, Windows and Bun.
- `max mcp`, which now loads `/standards/tables` when the MCP agent starts. That cost moved there from every start
  and was not timed.
- Repeat runs: one run of 41 pairs. The file and byte counts are exact; read the milliseconds as rough.
