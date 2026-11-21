<!-- cspell:words attio -->

# A documents source from a config: notion-cli against attio-cli

Measured 2026-11-21 on notion-cli's move to a source from `wirecat.config.ts` (branch `feat/source-from-config`,
`@wirecat/notion-cli` after 0.6.0).

## Why it was run

attio-cli (a CRM) and linear-cli (an issue tracker) build their sync sources from one file, `wirecat.config.ts`:
the config names the API calls, cli-core runs them, and hooks hold what the config cannot say. Documents CLIs had no
such path: notion-cli's source was about 1,000 lines over Notion's SDK. The plan in cli-private (PR 11 of the
connector-factory plan) asked whether a documents CLI can take the same path, and what cli-core lacks for it.

The question: once notion-cli's source comes from its config, how much is config and how much stays hooks, and does
anything change for a user? The answer decides whether the next documents CLI (Google Drive, Yandex Disk) starts from
a config, and what cli-core adds first.

## Setup

- Linux x86_64, Node 26.1.0. One builder agent, with one fresh reviewer agent for the cli-core part.
- notion-cli at `ea70b65` (0.6.0) before, `9c59227` (branch `feat/source-from-config`) after, on cli-core 0.718.0,
  which carries `documentSourceFromManifest` (cli-core [#3191](https://github.com/WireCatLabs/cli-core/pull/3191)), and
  cli-base 0.125.0.
- notion-cli was not made with `new --from-config`: it is an existing CLI moved over. So "time from `new` to green"
  does not apply. The move is measured by its diff instead.
- attio-cli's numbers are from its own measurement,
  [generation/source-manifest](../../generation/source-manifest/README.md), on its 0.1.0.
- The command, with [count.mjs](count.mjs) in this folder (git only, no network):

```sh
# from this folder, with notion-cli checked out at ~/Projects/AI/notion-cli
node count.mjs ~/Projects/AI/notion-cli ea70b65 9c59227
```

The raw numbers are in [result.json](result.json).

## Results

| | notion-cli (documents) | attio-cli 0.1.0 (CRM) |
|---|---:|---:|
| `wirecat.config.ts` lines | **43** | 126 |
| Hook code (notion: `src/sync/*.ts` but tests) | **1,707** | 8 |
| Calls the config names | 9 (account, search, data source query, page, database, block, block children, Markdown, user) | not counted |
| Source lines changed by the move | +185 / −131 | n/a |
| Tests changed by the move | +79 / −19, no old expectation changed, one test added | n/a |
| Tests passing | 311 of 311 before, 312 of 312 after | n/a |

The hook row is not the same scope for both. For attio it is one file, `src/hooks.ts`. For notion it is the whole
`src/sync/` folder but its tests, types and front matter included, and it leaves out the read port in `src/notion/`.

What moved into the config: the account (`bot.workspace_id` and the bot id), every request the sync sends, the API
version header, both paces (the connection's and the data source queries' own) and which saved pages are read again
(`reread`). What stayed hooks: the resumable pass over search and data sources, the block tree, finding a row's
container, the run's deadline and the front matter.

## What it showed

- **For a documents CLI the config is the edge, the hooks are the source.** 43 lines of config against 1,707 lines of
  hook code. attio is the other way round, 126 against 8. A CRM maps rows to fixed record kinds, which a config says
  well. Notion's sync is an algorithm: a pass that resumes across runs, a tree of blocks, rows whose parent must be
  looked up. No field list can say that.
- **The config still pays.** Every request the sync makes is now one the config names, sent through the same request
  path as `notion api`. The source's tests run it through those calls, and a fake that answers only the nine
  operations would fail on any other. The `~authors` version trick (about 36 lines) went away for cli-core's `reread`.
- **cli-core needed four things,** all added in #3191: a documents manifest and `documentSourceFromManifest`,
  `reread` in the sync engine, `api.headers` and `api.pace` in the config, and a `files` category with a source. The
  review found two defaults that would loop for the next CLI that relies on them (a change round past 100 pages, a
  `reread` with no content hook). Both were fixed before the push.
- **One change for a user**: a token whose answer names no workspace now fails with `source.no-account`, not
  `notion.no-workspace`. The same pages are read, with the same limits.

## What was not measured

- A live sync on the owner's workspace: see the notion-cli release's live check.
- The time a person spent: none. The move was one agent's session.
- A documents CLI built with `new --from-config`: none exists yet, so the time from `new` to green is unknown.
- notion-cli's commands (`pages show` and the rest) still read through Notion's SDK. Only the sync moved.
