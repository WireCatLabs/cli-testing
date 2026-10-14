# Architecture checks

The owner asked for linters to enforce the design where they can, for our own rules on top, and for a
check that no file grows huge or mixes several jobs: over 1000 lines is a problem, over 500 is
suspicious, with justified exceptions. They also asked for a table that is re-measured every month,
so the past state and the trend stay visible. This page is that table. Each month adds a row; the
lint rules themselves live in each repository's `biome.json` and fail its CI.

## What each repository enforces

| Rule | What it stops | Where |
| --- | --- | --- |
| `suspicious/noImportCycles` | Two modules that import each other, directly or through others. Type-only imports are allowed. | Top-level rules of every `biome.json`. Inside an `overrides` entry Biome builds no import graph and reports nothing. |
| `style/noExcessiveLinesPerFile` at 1000 | A file over 1000 lines. Tests and generated code are exempt. | Top-level rules of every `biome.json`. |
| Size exceptions | A file already over 1000 growing further. Each one is an override capped at the file's current size, so growth needs a visible change. | One override per file. |
| `style/noRestrictedImports` | An import across a layer, or a provider SDK outside the module that owns it. Each pattern carries the reason in its message. | `overrides` in each `biome.json`. |
| Command contract | Missing declared effects on any command; the `commands --json` shape. | Each tool's `contracts:check` or `cli-dev lint`. |

Biome counts lines slightly differently from `wc -l` (store.ts: 1960 against 2042), so the caps in
`biome.json` are Biome's numbers. The table below uses newline counts.

## Run it

From this repository, with each CLI checked out at the commit to measure:

```sh
node performance/engineering/architecture-checks/measure.mjs --date 2026-11-01 \
  --repo cli-core=../cli-core --repo max-cli=../max-cli --repo tg-cli=../tg-cli \
  --repo cli-memo=../cli-memo --repo drive-cli=../drive-cli --repo zoom-cli=../zoom-cli
```

It reads `package.json`, `biome.json` and the tracked source files, and prints a dated table and
the list of files over 500 lines. It builds nothing and needs no account. The same checkouts give
the same output.

Monthly: the `architecture` job in [monthly.yml](../../../.github/workflows/monthly.yml) clones each
CLI's `main` on the first of the month, writes the table to the run summary and opens an issue
titled "Architecture checks YYYY-MM" with it. Copy the table under [Trend](#trend), give every new
file over 500 lines a verdict under [Files over 500 lines](#files-over-500-lines), and close the
issue in the same PR.

Columns: *Loop rule* and *Size limit* say whether the rule is on at the top level. *Boundary rules*
counts distinct `noRestrictedImports` messages, that is, distinct reasons. *Contracts check* says
whether the tool has `contracts:check` or `lint:commands`; it does not apply to the cli-core library.
*Over 1000* and *501–1000* count source files, without tests or generated code.

## Trend

### 2026-10-14, adoption of the October refactor

Measured by building each tool and reading its `commands --json` with a throwaway home folder, and
counting loops with the [cycle script](../code-quality/runtime-cycles.mjs). Later rows leave these
columns to the tools' own checks: the contracts check fails on a command without declared effects,
and the loop rule fails lint.

| Repo | cli-core pin | Contract | Commands with declared effects | Runtime import loops | Loop rule in lint |
| --- | --- | --- | --- | --- | --- |
| cli-core | — | 3 | — | 0 | yes |
| max-cli | 0.273.0 | 3 | 328/328 | 0 | no |
| tg-cli | 0.273.0 | 3 | 478/478 | 0 | no |
| cli-memo | 0.273.0 | 3 | 87/87 | 0 | no |
| drive-cli | 0.273.0 | 3 | 141/141 | 0 | no |
| zoom-cli | 0.273.0 | 3 | 52/52 | 0 | no |

The loop counts missed one loop each in max, tg and drive (see [What it showed](#what-it-showed)).

### 2026-10-14, before the lint guards

| Repo | Commit | Version | cli-core pin | Loop rule | Size limit | Size exceptions | Boundary rules | Contracts check | Source files | Over 1000 | 501–1000 | Tests over 1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cli-core | c6a50cd8 | 0.277.0 | — | yes | no | 0 | 13 | — | 734 | 5 | 23 | 3 |
| max-cli | 295e9411 | 0.52.0 | 0.276.0 | no | no | 0 | 7 | yes | 217 | 0 | 5 | 4 |
| tg-cli | 4a6c2a6e | 0.55.0 | 0.275.0 | no | no | 0 | 2 | yes | 62 | 1 | 2 | 2 |
| cli-memo | 82a9e502 | 0.29.0 | 0.274.0 | no | no | 0 | 0 | yes | 90 | 0 | 1 | 0 |
| drive-cli | a163251c | 0.6.0 | 0.275.0 | no | no | 0 | 0 | yes | 39 | 0 | 1 | 0 |
| zoom-cli | cd4d160f | 0.13.0 | 0.273.0 | no | no | 0 | 0 | yes | 70 | 1 | 2 | 0 |

### 2026-10-14, after the lint guards

| Repo | Commit | Version | cli-core pin | Loop rule | Size limit | Size exceptions | Boundary rules | Contracts check | Source files | Over 1000 | 501–1000 | Tests over 1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cli-core | 87b9bb9d | 0.277.0 | — | yes | 1000 | 5 | 13 | — | 734 | 5 | 23 | 3 |
| max-cli | 3049380b | 0.52.0 | 0.276.0 | yes | 1000 | 0 | 7 | yes | 217 | 0 | 5 | 4 |
| tg-cli | 0e3d4099 | 0.55.0 | 0.275.0 | yes | 1000 | 1 | 2 | yes | 62 | 1 | 2 | 2 |
| cli-memo | 18d9a9cd | 0.29.0 | 0.274.0 | yes | 1000 | 0 | 5 | yes | 90 | 0 | 1 | 0 |
| drive-cli | 29906cff | 0.6.0 | 0.275.0 | yes | 1000 | 0 | 4 | yes | 39 | 0 | 1 | 0 |
| zoom-cli | 65516542 | 0.13.0 | 0.273.0 | yes | 1000 | 1 | 3 | yes | 70 | 1 | 2 | 0 |

The guards: [cli-core #1211](https://github.com/WireCatLabs/cli-core/pull/1211),
[max-cli #634](https://github.com/WireCatLabs/max-cli/pull/634),
[tg-cli #503](https://github.com/WireCatLabs/tg-cli/pull/503),
[cli-memo #150](https://github.com/WireCatLabs/cli-memo/pull/150),
[drive-cli #41](https://github.com/WireCatLabs/drive-cli/pull/41),
[zoom-cli #83](https://github.com/WireCatLabs/zoom-cli/pull/83).

## Files over 500 lines

One line per file: one job or several, and for several, the seam a split would follow. A split
needs a seam (a dependency it removes, a loop it cuts, or a part that can be tested or replaced
alone); length alone is not one. Verdicts were read from the 2026-10-14 sources.

Over 1000 lines, capped in lint:

- cli-core `src/store/store.ts` 2042 — several: the `MessageStore` interface and shared types, the
  wiring of every SQLite module, re-exports. Seam: move the interface and types to their own module;
  23 SQLite modules import types back from `store.ts`.
- cli-core `src/store/sqlite/schema.ts` 1714 — one: the table definitions.
- cli-core `scripts/schema/spec.mjs` 1440 — one: tables of column changes and the spec builder.
- cli-core `src/store/sqlite/emails.ts` 1139 — several: mail storage and reads, plus chunking threads
  and the mail index queue. Seam: move the index part to `email-index.ts`, as `note-index.ts` did.
- cli-core `src/store/sqlite/lucene.ts` 1070 — one: compiles a parsed search query into SQL.
- tg-cli `src/telegram/adapter.ts` 2312 — several: one class for login, the live updates loop, reads,
  sends, topics, folders, group admin and contacts. Seam: move login and the updates loop to modules
  that take the client, as comments and join requests already are.
- zoom-cli `src/program.ts` 1182 — several: program wiring, watch planning and ingest, choosing the
  API or file source. Seam: a watch service and a source factory.

501 to 1000 lines, several jobs:

- cli-core `src/store/sqlite/knowledge.ts` 856 — reminders (own table, used by the scheduler) beside
  tags, organizations and relations. Seam: `sqlite/reminders.ts`.
- cli-core `src/cli/messenger/conversations-command.ts` 811 — the `build --analyze` flow lives in the
  command. Seam: a conversations service; the command keeps the prompt and rendering.
- cli-core `src/cli/messenger/store-maintenance-command.ts` 794 — inspection, rebuild, backup and
  restore logic inside the command. Seam: `src/store/maintenance.ts`.
- cli-core `src/store/sqlite/meetings.ts` 746 — attachment and word-query helpers that `emails.ts`
  borrows. Seam: `sqlite/attachments.ts`, so mail stops importing meetings.
- cli-core `src/services/attachments.ts` 620 — borderline: file extraction (OCR or text) that never
  touches the store. Seam: an extraction module testable without a store.
- cli-core `src/services/notes-search.ts` 560 — embedding jobs for notes and mail beside note search.
  Seam: `notes-embed.ts`.
- cli-core `src/mcp/tool.ts` 538 — tool definitions and the call runner. Seam: `mcp/run.ts`, so tool
  modules stop pulling in recording and services.
- cli-core `src/background/schedules.ts` 503 — OS timer installers and desktop notices beside
  schedules. Seam: `background/timers.ts`, per OS.
- max-cli `src/server/server.ts` 722 — keeps the upstream connection alive and serves the local
  socket. Seam: the reconnecting upstream as its own class.
- max-cli `src/config.ts` 581 — settings, config file editing and send-time parsing. Seam: send
  times and config editing to their own modules.
- cli-memo `src/search/command.ts` 561 — the search logic sits in the command file and other modules
  import it from there. Seam: `search/search.ts`.
- drive-cli `src/program.ts` 768 — policy checks and the raw API call written inline. Seam: move
  them to `policy.ts` or a drive API service.
- zoom-cli `src/recording-archive.ts` 706 — download, lock folder and manifest storage. Seam: a lock
  module and a manifest store.

501 to 1000 lines, one job: cli-core `domain/models.ts` 815, `services/messages.ts` 768,
`cli/settings.ts` 738, `store/sqlite/notes.ts` 699, `ports/messenger.ts` 663,
`store/sqlite/conversations.ts` 622, `scripts/parity/consumer-fixture.mjs` 584,
`services/messages-search.ts` 555, `kit/fake.ts` 552, `store/sqlite/note-search.ts` 543,
`cli/messenger/stats-answers.ts` 542, `services/archive.ts` 526, `store/sqlite/mentions.ts` 525,
`search/lucene/registry.ts` 521, `kit/contract.ts` 515; max-cli `scripts/test-matrix-untested.ts`
946 (a table), `domain/map.ts` 529, `adapter/max-adapter.ts` 525; tg-cli
`scripts/test-matrix-untested.ts` 779 (a table), `telegram/map.ts` 576; zoom-cli
`scripts/installed-platform.mjs` 658.

Tests over 1000 lines (exempt from the lint rule, listed to keep them visible): cli-core
`messenger.test.ts` 5043, `mcp.test.ts` 3679, `admin-commands.test.ts` 1062; max-cli `mcp.test.ts`
1985, `server/server.test.ts` 1688, `client.test.ts` 1286, `program.test.ts` 1079; tg-cli
`telegram/adapter.test.ts` 3014, `options.test.ts` 1108.

## What it showed

- Turning the loop rule on found one loop each in max, tg and drive that earlier counts missed: an MCP
  server lazily importing the program that imports it. Each was cut by having the program pass
  itself in. The earlier [cycle script](../code-quality/runtime-cycles.mjs) keeps only loops through
  `src/store` or `src/services`, and skips dynamic imports.
- 7 source files are over 1000 lines; 4 of them hold several jobs and have a named seam. 34 files are
  between 500 and 1000; 13 of those hold several jobs.
- The tools pin four different cli-core versions (0.273.0 to 0.276.0) while cli-core is at 0.277.0.
  cli-memo's own rule is to pin what tg and max pin; tg and max differ from each other today.
- 20 of cli-core's service files import from `cli/`, about a dozen of those imports at run time (error and
  recovery helpers, thread parsing, settings, run records). A lint rule "services do not import `cli/`"
  needs those helpers moved below both layers first; until then it would only list exceptions.

## Not measured

Runtime behaviour, test coverage, function length and complexity, and whether a command file holds
business logic: no rule can check that last one without many false alarms, so it stays a review
question and a verdict above. Effects coverage is not recounted here; each tool's contracts check
already fails when a command lacks declared effects. Repositories outside the six CLIs (cli-base,
cli-docs, cli-testing, community) were not measured.
