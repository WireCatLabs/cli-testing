<!-- cspell:words attio ydisk -->

# A CLI from one config: linear-cli against attio-cli

Measured 2026-11-18 on the first build of `linear` (`@wirecat/linear-cli`).

## Why it was run

The connector-factory plan says a new WireCat CLI should come mostly from one file, `wirecat.config.ts`: the agent
writes the config, and the template, the API generator and cli-core write the rest. Two pilots test it. attio-cli (a
CRM with an OpenAPI description) tests how the config maps fields. linear-cli (an issue tracker with a GraphQL schema)
also tests two foundation pieces that had never had a user: the `graphql` spec kind and the `tracker` category. The
question: with no hooks, how much does the builder still write by hand, how long does it take to reach a green
`cli-dev ready`, and what can the config not say? The answer decides what the shared packages fix next, before
the next CLI from a config.

## Setup

- `npx @wirecat/cli-template@0.31.0 new --from-config wirecat.config.ts`, the config written first; cli-core 0.700.0
  and cli-base 0.118.0 at the start, 0.701.0 and 0.119.0 at the end.
- The schema came from Linear's introspection, without a key. No request reached a Linear workspace.
- One builder agent, with one helper agent that built the shared fake in cli-core and three reviewer agents.
- Lines are counted with [count.mjs](../yandex-disk/count.mjs) from the ydisk measurement, with the first commit
  (the output of `new`) as the baseline. Changes inside that first commit are counted by building the CLI again with
  the same `new` and the same config, and diffing. attio-cli's numbers are from its own measurement,
  [source-manifest](https://github.com/WireCatLabs/cli-testing/pull/383), taken on its first release (people,
  companies and workspace members).

```sh
node ../yandex-disk/count.mjs <linear-cli checkout> f11ece6
```

## Results

| | linear-cli | attio-cli |
|---|---|---|
| Template | 0.31.0 | 0.28.0 |
| `wirecat.config.ts` lines | 102 (7 kinds) | 64 (3 kinds) |
| Hook lines | 0 | 23 |
| Source written after `new`, hooks included | 7 | 42 |
| Scripts written after `new` (spec fixes, live check) | 39 | not counted |
| Tests written after `new` | 60, all moved into the template since | 101 |
| Generated lines | 121,761 (493 operations) | 107 operations |
| `new` to `pnpm source:check` green | 9 min | not measured |
| `new` to every `cli-dev ready` row verified except the live check | 2 h 54 min, about 1 h 55 min of it on shared packages | about 2 h 40 min (1 h 20 min, then 1 h 20 min fixing the kit), plus two releases |

The linear-cli lines by hand, by what they are for:

- Linear's own facts (about 25 lines): the eight scalars of its schema, the two queries left out because a mutation
  has the same name, the key sent with no `Bearer`, the pace under its 2,500 requests an hour, the texts.
- The live check (about 25 lines): what it reads from `sync --json` and the keyring entry it uses.
- Tests (60 lines): they fixed the template's own tests, and moved into cli-template.

## What it showed

- **The config carried the whole source.** Seven kinds, Relay paging, changes by `updatedAt` with an overlap,
  archived rows, and an id pass for deletions: 102 lines of data, no hooks. linear-cli has 7 source lines
  written after `new` and no hook; attio-cli needed a 23-line hook, since Attio keeps old values of an attribute in
  the same list.
- **Most of the time went to the foundation, as with Attio.** Five gaps blocked a green `cli-dev ready`, and each was fixed in its
  shared package rather than in the CLI:
  - cli-base: `cli-dev ready` did not know the tracker category (#651).
  - cli-core: nothing could run `trackerSourceContract` over a source from a config. The new
    `trackerManifestFake` is the tracker's version of the CRM fake (#3120, about 930 lines).
  - cli-template: the Desktop sync line went over its 40 characters.
  - cli-template: the GraphQL `api` test ran out of memory on Linear's schema, since Linear's filters nest in each
    other.
  - cli-template: every `api` test case waited for the pace for real.
- **Seven more gaps were recorded, not worked around:**
  - no `cycle` kind;
  - no budget for Linear's complexity points;
  - no OAuth for a tracker from a config;
  - a query and a mutation with the same name get the same id;
  - a misspelled variable passes `source:check`;
  - a tracker has no `store status`;
  - the template's live check looks for a keyring entry the owner does not use.
- **Reviews found what the checks did not.** The first version of the cli-core fake let a change filter on the wrong
  field (`createdAt`) or with the wrong operator (`lt`) pass the contract, and the same for a filter that would drop
  rows from the id pass. On the real service, the first never syncs an edited issue and the second marks live
  issues deleted. Both were fixed before the push.

## What was not measured

- The live check against a real Linear workspace: it is the owner's, and had not run when this was written. Nothing
  here proves the config against Linear's real answers, only against its schema and a fake built from it.
- attio-cli again: its numbers are its own measurement's, taken with another counter (`count.py`); the two scopes
  differ (seven tracker kinds against three CRM kinds).
- Linear's complexity cost of a sync page: no request was sent.
- Hours a person spent: the owner answered one question (release cli-core and build in full) and nothing more.
