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
| `style/noExcessiveLinesPerFile` at 1000 | A file over 1000 lines. Tests and generated code are exempt. | Top-level rules of every `biome.json`. zoom-cli sets 500, which is stricter. |
| Size exceptions | A file already over the limit growing further, or a file that was split growing back. Each one is an override capped at the file's current size, so growth needs a visible change. | One override per file. |
| `style/noRestrictedImports` | An import across a layer, or a provider SDK outside the module that owns it. Each pattern carries the reason in its message. | `overrides` in each `biome.json`. |
| Command contract | Missing declared effects on any command; the `commands --json` shape. | Each tool's `contracts:check` or `cli-dev lint`. |

"Every `biome.json`" means cli-core and the six CLIs in the table below. cli-base, cli-testing, cli-docs and community
turn on neither the loop rule nor the size limit.

Biome counts lines slightly differently from `wc -l` (store.ts: 1960 against 2042), so the caps in
`biome.json` are Biome's numbers. The table below uses newline counts.

## Run it

From this repository, with each CLI checked out at the commit to measure:

```sh
node performance/engineering/architecture-checks/measure.mjs --date 2026-11-01 \
  --repo cli-core=../cli-core --repo max-cli=../max-cli --repo tg-cli=../tg-cli \
  --repo cli-memo=../cli-memo --repo drive-cli=../drive-cli --repo zoom-cli=../zoom-cli \
  --repo whatsapp-cli=../whatsapp-cli
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

### 2026-10-17

| Repo | Commit | Version | cli-core pin | Loop rule | Size limit | Size exceptions | Boundary rules | Contracts check | Source files | Over 1000 | 501–1000 | Tests over 1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cli-core | 0149f9d6 | 0.324.0 | — | yes | 1000 | 4 | 17 | — | 871 | 3 | 32 | 3 |
| max-cli | 581de1d4 | 0.59.0 | 0.324.0 | yes | 1000 | 0 | 7 | yes | 203 | 0 | 4 | 3 |
| tg-cli | 1ebdef5c | 0.69.0 | 0.323.0 | yes | 1000 | 1 | 2 | yes | 75 | 0 | 4 | 2 |
| cli-memo | fccf3eef | 0.61.0 | 0.320.0 | yes | 1000 | 0 | 5 | yes | 121 | 0 | 2 | 0 |
| drive-cli | d12765e7 | 0.16.0 | 0.307.0 | yes | 1000 | 0 | 4 | yes | 56 | 0 | 0 | 0 |
| zoom-cli | 42b2a55f | 0.23.2 | 0.322.0 | yes | 500 | 0 | 3 | yes | 91 | 0 | 1 | 0 |
| whatsapp-cli | 301b3203 | 0.1.0 | 0.322.0 | yes | 1000 | 0 | 3 | yes | 39 | 0 | 0 | 0 |

cli-core's 17 boundary rules apply again since
[cli-core #1467](https://github.com/WireCatLabs/cli-core/pull/1467). Before it, the last `noRestrictedImports`
override replaced the earlier ones for the files it matched, so most of them caught nothing. This table counts
the rules written in `biome.json`, not whether Biome applies them.

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
alone); length alone is not one. Sizes are from the 2026-10-17 sources. Verdicts for files that
were already on this list come from the 2026-10-14 reading; files new to the list were judged from
their exports and top-level structure, not a full read.

Over 1000 lines:

- cli-core `src/store/sqlite/schema.ts` 1833 — one: the table definitions. Capped in lint.
- cli-core `scripts/schema/spec.mjs` 1507 — one: tables of column changes and the spec builder. Capped
  in lint.
- cli-core `src/store/sqlite/emails.ts` 1076 — several: mail storage and reads, plus chunking threads.
  The mail index queue moved to `email-index.ts` on 2026-10-14
  ([cli-core #1212](https://github.com/WireCatLabs/cli-core/pull/1212)) and the file has grown back
  since. Biome counts it under 1000, so it has no cap.

Split since 2026-10-14, and capped at their new size so they do not grow back:

- cli-core `src/store/store.ts` 2042 → 301 (cap 438): the store split into areas
  ([cli-core #1389](https://github.com/WireCatLabs/cli-core/pull/1389)).
- cli-core `src/store/sqlite/lucene.ts` 1070 → 710 (cap 710): the per-field compilers moved to
  `lucene-fields.ts` in the same PR.
- tg-cli `src/telegram/adapter.ts` 2312 → 625 (cap 615 in Biome's count): split by feature
  ([tg-cli #555](https://github.com/WireCatLabs/tg-cli/pull/555)).
- zoom-cli `src/program.ts` 1182 → under 500
  ([zoom-cli #141](https://github.com/WireCatLabs/zoom-cli/pull/141)).

501 to 1000 lines, several jobs:

- cli-core `src/store/sqlite/knowledge.ts` 865 — reminders (own table, used by the scheduler) beside
  tags, organizations and relations. Seam: `sqlite/reminders.ts`.
- cli-core `src/cli/messenger/conversations-command.ts` 806 — the `build --analyze` flow lives in the
  command. Seam: a conversations service; the command keeps the prompt and rendering.
- cli-core `src/cli/messenger/store-maintenance-command.ts` 797 — inspection, rebuild, backup and
  restore logic inside the command. Seam: `src/store/maintenance.ts`.
- cli-core `src/store/sqlite/meetings.ts` 761 — attachment and word-query helpers that `emails.ts`
  borrows. Seam: `sqlite/attachments.ts`, so mail stops importing meetings.
- cli-core `src/services/attachments.ts` 634 — borderline: file extraction (OCR or text) that never
  touches the store. Seam: an extraction module testable without a store.
- cli-core `src/services/notes-search.ts` 628 — embedding jobs for notes and mail beside note search.
  Seam: `notes-embed.ts`.
- cli-core `src/cli/messenger/context.ts` 611 — borderline: the lazy store, opening a connection
  (`connectFor`) and the messenger context. Seam: connection opening, which `serve` and the commands
  share.
- cli-core `src/mcp/tool.ts` 548 — tool definitions and the call runner. Seam: `mcp/run.ts`, so tool
  modules stop pulling in recording and services.
- cli-core `src/cli/messenger/backfill-command.ts` 541 — two command groups, `sync` and `jobs`. Seam:
  `jobs` to its own file.
- cli-core `src/background/schedules.ts` 504 — OS timer installers and desktop notices beside
  schedules. Seam: `background/timers.ts`, per OS.
- max-cli `src/server/server.ts` 721 — keeps the upstream connection alive and serves the local
  socket. Seam: the reconnecting upstream as its own class.
- max-cli `src/config.ts` 518 — settings, config file editing and send-time parsing. Seam: send
  times and config editing to their own modules.
- cli-memo `src/mail/command.ts` 595 — the rules file parser beside the `mail` command and its
  renderers. Seam: `mail/rules.ts`.

501 to 1000 lines, one job: cli-core `domain/models.ts` 844, `domain/task-categories.ts` 812 (the
category list and its trigger words), `services/tasks.ts` 796, `services/messages.ts` 756,
`cli/messenger/tasks-command.ts` 727, `store/sqlite/notes.ts` 713, `store/sqlite/lucene.ts` 710,
`cli/settings.ts` 692, `ports/messenger.ts` 679, `store/sqlite/conversations.ts` 618,
`scripts/parity/consumer-fixture.mjs` 592, `cli/program.ts` 562, `services/messages-search.ts` 556,
`kit/fake.ts` 554, `store/sqlite/note-search.ts` 554, `cli/messenger/stats-answers.ts` 543,
`search/lucene/registry.ts` 537, `services/archive.ts` 530, `store/sqlite/lucene-fields.ts` 524,
`store/sqlite/work-tasks.ts` 520, `kit/contract.ts` 516, `mcp/tools/tasks.ts` 514; max-cli
`scripts/test-matrix-untested.ts` 997 (a table), `domain/map.ts` 535; tg-cli
`scripts/test-matrix-untested.ts` 796 (a table), `telegram/adapter.ts` 625, `telegram/map.ts` 576,
`telegram/messages.ts` 501; cli-memo `mail/import.ts` 739 (the mail import loop); zoom-cli
`scripts/installed-platform.mjs` 710.

Tests over 1000 lines (exempt from the lint rule, listed to keep them visible): cli-core
`messenger.test.ts` 4941, `mcp.test.ts` 3876, `admin-commands.test.ts` 1122; max-cli
`server/server.test.ts` 1717, `client.test.ts` 1291, `program.test.ts` 1037; tg-cli
`telegram/adapter.test.ts` 3097, `options.test.ts` 1096.

## What it showed

- Turning the loop rule on (2026-10-14) found one loop each in max, tg and drive that earlier counts
  missed: an MCP server lazily importing the program that imports it. Each was cut by having the
  program pass itself in. The earlier [cycle script](../code-quality/runtime-cycles.mjs) keeps only
  loops through `src/store` or `src/services`, and skips dynamic imports.
- On 2026-10-17, 3 source files are over 1000 lines, all in cli-core; 1 of them holds several jobs.
  43 files are between 500 and 1000; 13 of those hold several jobs. Four of the seven files over 1000
  on 2026-10-14 were split along the seams named then.
- The six CLIs pin five different cli-core versions (0.307.0 to 0.324.0) while cli-core is at
  0.324.0. drive-cli is 17 minor versions behind.
- cli-core's services no longer import `cli/`
  ([cli-core #1281](https://github.com/WireCatLabs/cli-core/pull/1281)), and a boundary rule now fails
  lint if one does: services, sends, replies, attachments, moderation, models, analysis, domain and
  ports never import `src/cli/`.

## Not measured

Runtime behaviour, test coverage, function length and complexity, and whether a command file holds
business logic: no rule can check that last one without many false alarms, so it stays a review
question and a verdict above. Effects coverage is not recounted here; each tool's contracts check
already fails when a command lacks declared effects. Repositories outside cli-core and the six CLIs
(cli-base, cli-docs, cli-testing, community) were not measured.
