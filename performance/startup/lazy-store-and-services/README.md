# Loading the store and services on first use

Measured 2026-10-18. Follows [what-the-cli-entry-loads](../what-the-cli-entry-loads/README.md) and
[consumer-test-speed](../../ci/consumer-test-speed/README.md).

**Outcome: measured, not merged.** [cli-core#1590](https://github.com/WireCatLabs/cli-core/pull/1590), the change
measured here, was closed. It saved about 30 ms on the bare import, but the start of `tg` and `max` and their test
steps did not change beyond the noise. That gain did not justify a moved store file and imports that load later
(the first version of the change made `serve` hang in a test). The page stays as a negative result, so the same
cut is not tried again without a new reason.

## Why we ran it

The owner asked to make the CI and test steps of the CLIs faster.
[consumer-test-speed](../../ci/consumer-test-speed/README.md) found that importing `@wirecat/cli-core/cli` costs
about 500 ms and 700 modules in each test file of tg-cli, max-cli and whatsapp-cli: 18–31 % of their test CPU, and
probably 25–30 s of max-cli's 102 s CI test step. It suggested loading the heavy command groups on first use. Each
CLI's own start (`tg --help`, `max messages send`) probably paid the same.

[what-the-cli-entry-loads](../what-the-cli-entry-loads/README.md) had already found, on cli-core 0.299.0, that lazy
action bodies would not pay without rewriting the command modules, and moved the MCP server out of the entry
instead (913 → 801 files). Today the entry loads 882 modules, counted by a different hook, so the two numbers
compare only roughly. The questions: what does it load now, and why? Is
there a cut short of rewriting the command modules, and what does it save in the import, in a consumer command's
start, and in a consumer's test step? The answer decided whether cli-core#1590 merges. It did not: the pull request
was closed.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (12 cores, 24 threads), Node 24.19.0, pnpm 11.20.0. Other agents' work was
  running: load average 4–11 during the runs.
- **cli-core.** `main` at [`9047652`](https://github.com/WireCatLabs/cli-core/commit/90476525) (0.343.0 and two
  unreleased changes), built with `pnpm build`. "Base" is that build; "new" is the same commit with the change
  (link below).
- **Consumers.** Fresh clones: tg-cli [`38bb5e8`](https://github.com/WireCatLabs/tg-cli/commit/38bb5e8), max-cli
  [`cefb41e`](https://github.com/WireCatLabs/max-cli/commit/cefb41e). cli-core linked the way its parity job does
  (`scripts/parity/build-app.sh`): `pnpm pack`, then `pnpm add @wirecat/cli-core@file:<tarball>
  @wirecat/cli-base@0.45.0`, then `pnpm build`. To switch base and new, the installed package's `dist` was
  replaced with `rsync -a --delete`, outside the timed part.
- **Isolation.** `HOME`, `TMPDIR`, the XDG folders, `WIRECAT_STATE_DIR` and `MESSAGING_STORE` pointed at a scratch
  folder. No real store, profile or network.
- **Commands.**
  - Modules loaded by one run: [`count-modules.mjs`](../../ci/consumer-test-speed/count-modules.mjs) (or the same hook
    counting cli-core's `dist` only), e.g. `node --import <hook> dist/bin/tg.js --version`.
  - Where the time goes: `node --cpu-prof --cpu-prof-interval 100 -e "await import('./dist/cli/index.js')"`, then
    [`profile-by-package.mjs`](profile-by-package.mjs).
  - Why each module is loaded: [`module-graph.mjs`](module-graph.mjs) over cli-core's `dist`.
  - Wall time: [`bench.mjs`](bench.mjs), base and new alternated in each round, one untimed warm-up run before each
    timed one (tg and max enable Node's compile cache, so a warm run is the normal one), 12–15 rounds, medians.
  - Test step: `npx vitest run`, base and new alternated, two runs each for tg-cli and three for max-cli.

## Results

### Where the time goes

A cold `import('@wirecat/cli-core/cli')` took 380–560 ms. In a CPU profile of 465 ms, Node's ES module loader
(resolving, reading `package.json` files, compiling, linking) took about 320 ms and garbage collection 34 ms.
cli-core's own top-level code took about 15 ms, the libraries it loads about 33 ms. **The cost is the number of modules, not
any slow module.** Nothing heavy loads at import: no ONNX runtime, no speech engine, no `node:sqlite`, no ECharts.

The entry reached 704 of cli-core's 829 `dist` modules. It is a re-export file: it names about 280 values from
125 modules, and each of those loads its own imports:

| folder | modules | reached through |
|---|---|---|
| `cli/` | 179 | the command modules; they build the command tree, its help and `commands --json`, so they load |
| `store/` | 158 | `store/store.js`, whose `openStore` imports all 40 store areas; services import small constants from it |
| `services/` | 99 | command modules import constants (`DELETE_AT_ONCE`, `TASK_QUERY`, `EVENTS_DAYS`…) from service modules, and `servicesFor` from `services/index.js` |
| `entities/` | 49 | the entity schemas the command contract describes; they load |
| `meetings/` | 46 | the meeting commands and the store |
| the rest | 173 | domain, search, sends, attachments, readers, replies, runs… |

The import graph is dense: no single module, removed, saves more than 60 modules, and most save under 10, because
the same modules are reached by many paths.

The consumers load more than `cli`. Both tg-cli and max-cli import `@wirecat/cli-core/store` at startup (tg in
`src/telegram/storage.ts` for `openCache`, max in several files). The store barrel alone reached 239 modules, so
store modules load in a consumer whatever the `cli` entry does. Without `cli`, the other entries tg uses (`.`,
`/sends`, `/store`, `/background`, `/update`) reach 282 cli-core modules.

`tg --version` loads 1,722 modules: 714 of cli-core, 606 of `@mtcute/core` and about 100 more of mtcute's
`@fuman/*` packages, loaded by tg-cli itself. max-cli's `--version` loads 1,081, 716 of them cli-core's.

### The change

[cli-core#1590](https://github.com/WireCatLabs/cli-core/pull/1590) (closed, not merged) defers what a command needs only when it runs:

- `openStore` (in `store/store.ts`) imports the store's implementation, now in `store/message-store.ts`, on the
  first open.
- The commands that build services (`conversations`, `serve`, and the shared messenger context) import
  `servicesFor` when they run.
- Command modules import small constants from the module that defines them, not through `services/index.js`.

Names, types, help text and `commands --json` stay the same: `tg --help`, `tg commands --json`, `max --help`,
`max commands --json` and several subcommand helps were byte-identical between base and new.

| modules loaded | base | new |
|---|---|---|
| `import('@wirecat/cli-core/cli')`, cli-core modules (all modules) | 704 (882) | 618 (796) |
| `@wirecat/cli-core/store` barrel, static graph | 239 | 184 |
| `tg --version`, cli-core modules (all modules) | 714 (1,722) | 629 (1,637) |
| `max --version`, cli-core modules (all modules) | 716 (1,081) | 666 (1,031) |

| wall time, median | base | new | n |
|---|---|---|---|
| `import('@wirecat/cli-core/cli')`, from the tg checkout | 426 ms | 396 ms | 15 |
| `import('@wirecat/cli-core/cli')`, from the max checkout | 439 ms | 417 ms | 15 |
| `tg --version` | 532 ms | 525 ms | 15 |
| `tg --help` | 562 ms | 546 ms | 15 |
| `max --version` | 431 ms | 420 ms | 15 |
| `max --help` | 433 ms | 429 ms | 15 |

| test step, `npx vitest run` | base | new |
|---|---|---|
| tg-cli, wall (2 runs each) | 26.6 s, 24.5 s | 26.9 s, 23.7 s |
| max-cli, wall (3 runs each) | 43.7 s, 47.0 s, 41.4 s | 39.6 s, 44.3 s, 40.4 s |

Both builds failed the same tests (tg-cli 75 in 3 files, max-cli 101 in 7): help and wording that changed in
cli-core after the 0.342.0 both consumers pin. One extra base run of max-cli also timed out in
`src/generated/generated.test.ts`.

## What it showed

- **The entry's import got 7–12 % faster (about 30 ms) and loads 86 fewer modules.** The bare import is what a
  consumer's test file pays first.
- **A tg or max command starts about as fast as before**, within 1–3 %, which is inside the noise here. A
  consumer loads the store barrel anyway, and on a warm compile cache a module costs about 0.3 ms, so 85–50 fewer
  modules are 15–25 ms of 420–560 ms.
- **The test steps did not measurably change.** tg-cli was within noise; max-cli's median went from 43.7 s to
  40.4 s, but the spread of each side (41–47 s, 40–44 s) overlaps. Most consumer tests run a command, and a
  command that builds services loads them then.
- **So the change was not merged.** About 30 ms on the import, and nothing a user or a CI run would notice, is not
  worth the moved code and the risk of imports that load later.
- **It confirms [what-the-cli-entry-loads](../what-the-cli-entry-loads/README.md):** lazy action bodies alone do
  not pay. What paid here was cutting hubs: `openStore`'s import of the whole store, and `servicesFor`.
- **What is left is mostly needed or is a design question:**
  - `servicesFor` builds every service at once, so the first command that builds services loads about 400
    modules. Loading each service on first use would change the `Services` object from plain properties to
    something loaded asynchronously: a design change, not attempted.
  - The 179 command modules and 49 entity modules build the command tree, so they load.
  - About 60 command modules import constants (query field lists, limits, option parsers) from service modules.
    Moving each constant into a small module of its own would let the `cli` entry stop at about 460 modules and
    the consumer set at about 510 (the graph's estimate), for perhaps another 30–40 ms of the bare import. Not
    done: about 60 files and 10 new modules for a few percent of a command's start.
  - On the consumer side, tg-cli's 700 mtcute modules are as many as all of cli-core's, and both consumers could
    import `openCache` and `openStore` without loading the whole store barrel.

  - Publishing the `cli` entry as one bundled file, the other change
    [consumer-test-speed](../../ci/consumer-test-speed/README.md) suggested, attacks the loader cost directly: it
    cuts the number of modules, not which ones load. Not tried here.

## What was not measured

- CI: no consumer has run its CI against the change.
- whatsapp-cli: its checkout was not touched.
- A command that runs an action (`messages send`, `search`): it loads the deferred modules, so it can only be as
  fast as before or slightly faster.
- Cold starts without the compile cache for tg and max (the bare import above is cold).
- Bun.
