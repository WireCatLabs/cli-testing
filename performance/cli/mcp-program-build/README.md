# Building the command tree on every MCP call

Measured 2026-10-29 on [cli-core #2176](https://github.com/WireCatLabs/cli-core/pull/2176) and
[cli-base #399](https://github.com/WireCatLabs/cli-base/pull/399), with [`bench.mjs`](bench.mjs) beside this page.

## Why we ran it

The owner asked whether a CLI's MCP server has to rebuild the whole command tree for every tool call. It does today:
cli-core's `run()` calls `createProgram()` each time, and that cost tg about 16 ms per call on a warm process.

The tree cannot simply be reused. `run()` writes the call's own state into it: a `preAction` hook,
`provide(program, environment)` and option values such as the profile. A tree shared between calls would carry one
call's state into the next.

A CPU profile of 400 builds showed that about a third of the build was two self-checks that give the same answer every
time: the shared-command contract check (`assertSharedContracts`, ~16%) and the check that every query field's
example runs (`defineQuery` / `exampleProblems`, ~20%). The question was what running each of them once per process
saves, while the tree itself is still built per call. The answer decided whether to merge and release the two pull
requests above.

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), pinned to 4 CPUs with `taskset -c 0-3`. Node 24.19.0, Linux.
- tg-cli at `origin/main` 6682d29, built with `pnpm build`. Two copies of it, each with its own install:
  - **before**: cli-core packed from `main` e0967274 without the change, cli-base 0.65.1;
  - **after**: cli-core packed from the same commit with cli-core #2176, cli-base 0.65.2 (cli-base #399).
  Each copy resolves exactly one cli-base.
- `HOME`, the XDG directories, `TG_CONFIG_DIR`, `TG_STATE_DIR` and `MESSAGING_STORE` point at a temporary directory,
  and `DBUS_SESSION_BUS_ADDRESS` is unset, so no real store or keyring is reached.

```sh
taskset -c 0-3 node bench.mjs /path/to/tg-cli 9 50
```

Each of the 9 processes imports tg's `dist/program.js` and cli-core from tg's `node_modules`, then times:

- (a) `createProgram(definition)`, the build an MCP tool call pays;
- (b) `run(["commands", "--json"], definition)`, a whole call that builds the tree and describes every command.

It times each once ("first in process"), then 50 more times ("warm"). The table gives the median across processes,
in ms. The two builds were run alternately, twice.

## Results

| run | (a) first | (a) warm | (b) first | (b) warm |
| --- | ---: | ---: | ---: | ---: |
| before | 40.4 | 12.2 | 27.0 | 17.8 |
| after | 42.7 | 6.2 | 20.4 | 11.7 |
| before | 41.1 | 12.9 | 30.9 | 18.0 |
| after | 37.6 | 6.3 | 21.6 | 12.1 |

`commands --json` printed the same 385,085 bytes with both builds (sha256 prefix `5fe4d367f33f`).

A CPU profile of 400 warm builds (`node --cpu-prof`) before the change put `createProgram` at 78% of samples, with
`defineQuery` 20%, `assertSharedContracts` 16%, `withStatisticsQuery` 11% and `withQuery` 10% inside it. After the
change none of those four appear in the profile.

## What it showed

- A warm build of tg's tree takes half as long: 12.5 → 6.2 ms. A warm `commands --json` call is about 6 ms faster
  (18 → 12 ms). That is the time each MCP tool call saves.
- The first build in a process does not move: it runs both checks once either way, and its time is mostly code being
  compiled for the first time.
- The output is identical, so no caller sees a different tree.
- The remaining ~6 ms is building the Commander tree itself. Removing it means splitting the tree from each call's
  state, which is tracked as its own refactoring in cli-core.

## What was not measured

- A real MCP session over stdio. The bench calls `run()` in-process, which is what the MCP server does per tool call,
  but not the protocol's own cost.
- max-cli, zoom-cli, whatsapp-cli, memo, drive-cli and gcal-cli. They build their trees through the same
  `createProgram`, but their numbers are not here.
- tg against a released cli-core: the after build was packed from the pull request, before release.
- Memory use.
