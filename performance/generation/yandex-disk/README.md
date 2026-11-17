# Yandex Disk CLI: hand-written code and time on the shared foundation

Measured 2026-11-17 on the first build of `ydisk` (`@wirecat/yandex-disk-cli`).

## Why it was run

The CLI-factory plan says a new documents CLI should be built mostly from shared parts: the template, the API
generator and cli-core's shared commands, so that the builder writes only the source, the sign-in adapter and file
transfer. notion-cli, built before those parts existed, took about 4,531 hand-written lines and about 25 hours. The
question: on the foundation as released on 2026-11-17, how many lines does a comparable CLI take by hand, and how
long from `cli-template new` to a CLI whose `cli-dev ready` checks all pass? The answer decides whether the next
pilots (HubSpot) start from the template, or wait for more shared parts.

## Setup

- `npx @wirecat/cli-template new` (0.25.0, run from its source at the same commit) with `--category files --spec
  swagger --sign-in token`, then cli-core 0.690.0 and cli-base 0.110.0.
- One builder agent, with up to three helper agents at a time (API generation, test port, reviews).
- Lines are counted with [count.mjs](count.mjs): production TypeScript under `src/` without `src/generated/`, and
  tests and fakes apart; with the template commit as baseline it also counts the lines written on top of it.

```sh
node count.mjs <yandex-disk-cli checkout> <template commit>
node count.mjs <notion-cli checkout>
```

## Results

| | ydisk | notion-cli |
|---|---|---|
| Production lines, hand-written (without generated code) | 1,437 | 4,531 when counted by the plan; 5,316 today |
| of which written on top of the template | 897 | — |
| Tests and fakes | 1,907 | 5,514 today |
| Generated | 5,000 | 75,675 |
| From `new` to all `cli-dev ready` rows verified except the live check | 1 h 26 min; 1 h 40 min with two review rounds | about 25 h |

ydisk does what notion-cli's documents part does for its service: sign-in by pasted token, chosen folders synced into
the shared store, search, the shared catalog and knowledge commands, live file commands, and the generated `api`
group (20 operations; three that answer a file link are left out), with cli-core's source and command contracts
passing over strict fakes.

## What it showed

- **68 % fewer production lines than notion-cli** (1,437 against 4,531). The template gave the sign-in,
  transport, harness and owner scripts; the generator gave the `api` group; cli-core gave the documents commands.
- **The saving needed foundation work first, done during the build**, and counted apart: about 880 lines added to
  cli-core (`documentLibraryCommands`, moved from notion-cli's wiring; sources without a change feed; path-addressed
  sources; `fileText`, moved from drive-cli) and five vocabulary words in cli-base. Without them ydisk would have
  copied about 800 lines of notion-cli's wiring.
- **The time is not the builder's alone.** The hour and forty minutes covers the CLI; the foundation PRs, two
  releases of cli-core, one of cli-base and one of cli-template ran beside it, in about two more hours.
- **Fresh-agent reviews found real defects** the checks did not: an MCP path that let an agent overwrite or upload
  any local file, a file saved under another file's id after a move, an upload whose lost answer was reported as a
  network error. All were fixed before the first push.

## What was not measured

- The live check against a real Yandex account: it is the owner's, and had not run when this was written.
- Hours a person spent: the owner answered four questions at the start and nothing more.
- notion-cli's time is the plan's estimate, not a measurement.
