# What cli-base's `standards` entry costs at start, before a split

Measured 2026-10-18.

## Why we ran it

`@wirecat/cli-base/standards` holds two kinds of things: the contract a command uses while it runs (effects, error
object, output envelopes, log record, next steps) and tables only the lint, audit and docs tools read (the verb and
flag vocabulary, lint rules, audit rules, parity groups, identifiers). One import loads all of it, and each table is
checked with Valibot when it loads. The question was how much of a CLI's start the dev-only tables cost, so that a
plan to split the entry ("runtime" and "tables") states its saving from a measurement rather than a guess.

## Setup

- **Build.** Local build of max-cli `3cf8c0b2` (`origin/main`), on cli-base 0.43.5 and cli-core 0.333.0 from npm.
  cli-base `main` is 0.44.0; it adds about 20 lines to `flags-how`, `lint` and `vocabulary`, which does not change
  the picture.
- **State.** `HOME` set to an empty folder. No account, no store, no personal data.
- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0.0-38-generic, Node v24.19.0. The machine
  was busy: load average 30 to 37 during the run. `node -e 0`: 30 ms median.
- **Method.** The same as [what-the-cli-entry-loads](../what-the-cli-entry-loads/README.md), whose `graph-hook.mjs`
  and `time.mjs` this folder reuses. The "after" variant is simulated: [split-hook.mjs](split-hook.mjs) serves a
  copy of `standards/index.js` without the `audit`, `lint`, `identifiers` and `vocabulary` re-exports in place of
  the real one. Both variants run under the same hook, so both pay its cost.
- **Scripts** (this folder):
  - [run.sh](run.sh) traces, counts files and bytes, and times everything below.
  - [split-hook.mjs](split-hook.mjs) swaps in the runtime-only index.
  - [dev-cost.mjs](dev-cost.mjs) loads the runtime half, then times importing the full entry in the same process,
    with Node's compile cache on (as in max's bin) after one warm-up.
- **Run.**

  ```sh
  ./run.sh <max-cli> 41
  ```

## Results

### Files and bytes (exact)

| | files loaded | bytes loaded | standards files |
|---|---|---|---|
| `max --version` / `--help` now | 1,036 | 6,860,157 | 13 |
| with a runtime-only entry | 1,030 | 6,778,695 | 6 |

The six dev-only files (`audit`, `lint`, `identifiers`, `vocabulary`, `flags-how`, `flags-what`) are 82 KB of the
entry's 106 KB. `--version` and `--help` load the same set.

At start, 23 modules import the entry: 22 in cli-core and max's `commands/setup.js`. None of them uses a dev-only
name. cli-core's MCP agent (`mcp/agent.js`), which reads `VOCABULARY`, is not loaded at start.

### Time, median (min) of 41 alternating runs

| | time |
|---|---|
| import the full entry alone | 57 ms (29) |
| import the runtime half alone | 45 ms (24) |
| dev-only files, after the runtime half is loaded | 12.4 ms (7.0) |
| `max --version`, now / runtime-only | 681 ms (442) / 699 ms (451) |
| `max --help`, now / runtime-only | 706 ms (469) / 654 ms (457) |

## What it showed

- **The dev tables cost about 7 to 12 ms of a start**, measured in one process with the compile cache on: the files
  plus Valibot checking the tables. That is 0.6% of the files and 1.2% of the bytes a start loads.
- **End to end, the difference is not measurable above noise** on this machine: the two variants swap places between
  `--version` and `--help`, and each moves by more than the expected 7 to 12 ms.
- **The case for the split is the boundary, not speed.** The runtime contract and the tables lint reads are two
  different things with different readers; the speed gain is real but small.

Decision fed: the cli-base standards split plan (private, `docs_ai/plans/2026-10-18-cli-base-standards-split.md` in
cli-private) states the saving as these numbers.

## What was not measured

- A quiet machine. Read every millisecond figure as rough; file and byte counts are exact.
- The real split. "After" is a hook that swaps the index; `FIELD_RULES` still loads inside `output.js`.
- Other CLIs (tg, memo, drive, zm), a cold operating system file cache, macOS, Windows and Bun.
- `max mcp`, which loads the MCP agent and would read `VOCABULARY` from wherever the split puts it.

The split shipped in cli-base 0.45.0; the real numbers are in [standards-split-after](../standards-split-after/README.md).
