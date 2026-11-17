<!-- cspell:words bitrix hubspot -->

# Hand-written code in a new CLI: HubSpot against Bitrix24 and amoCRM

## Why this was run

WireCat makes a new CLI for each service. Bitrix24 and amoCRM took days each, and most of their code is the same
work done again: an `api` group, a fake service for tests, the sync of CRM records. The plan was to move that work
into the shared packages (cli-core, cli-base) and the template (cli-template), so a new CLI writes only what is
specific to its service.

The question: with cli-template 0.25.0, cli-core 0.687.0 and cli-base 0.109.0, how much code does a new CRM CLI
still need by hand? HubSpot was the first CLI built this way, so it is the first answer. The result decides what
moves into the template next.

## Setup

- Linux x86_64, Node 24.19.0. Counted on 2026-11-17.
- hubspot-cli: made with `new` from cli-template 0.25.0 (commit `28d04db`), measured at `b3c4725`. It reads
  HubSpot's CRM (deals, contacts, companies, leads, activities, owners, pipelines, properties) into cli-core's shared
  store, plus an `api` group generated from 15 HubSpot specs. It writes nothing and has no OAuth yet.
- bitrix24-cli at `7e2877e` and amo-cli at `99709b4` (`origin/main`). Both were written mostly by hand, on older
  versions of the shared packages.
- The command, from this folder:

```sh
python3 count.py \
  --repo hubspot="$HOME"/Projects/AI/hubspot-cli@b3c4725 --since hubspot=28d04db \
  --repo bitrix24="$HOME"/Projects/AI/bitrix24-cli@origin/main \
  --repo amo="$HOME"/Projects/AI/amo-cli@origin/main \
  --exclude 'bitrix24:src/calls/**' --exclude bitrix24:src/commands/calls.ts \
  --exclude bitrix24:src/commands/meetings.ts --exclude bitrix24:src/commands/sync-calls.ts \
  --exclude bitrix24:src/commands/transcribe.ts --exclude bitrix24:src/commands/models.ts \
  --exclude bitrix24:src/commands/products.ts --exclude bitrix24:src/crm/product.ts \
  --exclude bitrix24:src/crm/stage-history.ts --exclude bitrix24:src/crm/writer.ts \
  --exclude bitrix24:src/bitrix/oauth.ts \
  --exclude amo:src/amo/oauth.ts --exclude amo:src/crm/writer.ts --exclude amo:src/commands/write.ts
```

`count.py` counts the lines of the `.ts` files under `src/` at a git ref. It splits them into source, tests
(`*.test.ts`), test helpers (`src/testing/`) and generated code (`src/generated/`). For hubspot-cli it also counts
the lines added since the template commit. The `--exclude` globs leave out what hubspot-cli does not have yet:
calls, transcription, products, stage history, writes and OAuth. The [raw result](result.json) holds every number.

## Results

| | hubspot-cli | bitrix24-cli | amo-cli |
|---|---:|---:|---:|
| Source lines, comparable | **2,370** (2,064 written after `new`) | 4,148 | 5,026 |
| Source lines left out as not comparable | 0 | 2,293 | 605 |
| Tests | 1,554 | 6,958 | 3,719 |
| Test helpers (fakes) | 640 | 810 | 4,002 |
| Generated | 12,027 | 0 | 0 |
| Time from `new` to `cli-dev ready` (all rows but the live check) | 50 min (03:06 → 03:56) | 11 days, 134 commits | — |

Where hubspot-cli's 2,064 hand-written source lines are:

| Folder | Lines | What |
|---|---:|---|
| `src/crm/` | 1,052 | HubSpot records → cli-core's CRM shapes, incremental search, activities, associations |
| `src/hubspot/` | 343 | HTTP transport, HubSpot errors, rate limits, account details |
| `src/commands/` | 316 | sign-in, account, the CRM commands' wiring |
| `src/` root | 250 | context, config, store, program, identity, reasons |
| `src/setup/` | 160 | the setup flow and its texts in three languages |

## What it showed

- **The comparable code by hand fell by half:** 2,064 lines against 4,148 in bitrix24-cli and 5,026 in amo-cli.
  The `api` group of 157 operations and its types took no hand-written code. The fake service took 640 lines, not
  810 to 4,002.
- **The earlier estimate was too low.** The plan expected 1,100 to 1,400 lines. The mapping in `src/crm/` alone is
  1,052, because HubSpot's search answers carry no associations and its change feed must be built from search by
  modified time.
- **About 400 lines are the same in every CRM CLI:** the CRM commands' wiring, the store entry, the context and
  the "account already taken" check. The template does not make them yet for `--category crm`. Moving them into
  the template or cli-core is the next saving.
- **Time is not comparable.** hubspot-cli was built by three agents in parallel (two builders and a lead) on a
  finished plan. Bitrix24's 11 days include research, OAuth, calls and many rounds of review.

## What was not measured

- hubspot-cli has not been checked against a real HubSpot account yet. The live check waits for the owner's
  test portal, and fixes it needs may add code.
- No writes, no OAuth: both will add code that bitrix24-cli and amo-cli already have.
- Lines say nothing about quality. The review of hubspot-cli's first slice was still running when this was
  counted.
- One CLI is one data point; the Yandex Disk pilot is the second.
