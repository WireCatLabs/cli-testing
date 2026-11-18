<!-- cspell:words attio bitrix hubspot -->

# Attio CLI from a config file: hand-written code and time

Measured 2026-11-18 on the first build of `attio` (`@wirecat/attio-cli`) and on its first release, 0.1.0.

## Why it was run

hubspot-cli was the first CRM CLI made from the template, and it still took 2,340 hand-written lines: most of them map
HubSpot's answers to cli-core's CRM records ([new-cli-lines](../../engineering/new-cli-lines/README.md)). The next
step of the plan moves that mapping into a config file: `wirecat.config.ts` names the API calls and the path of each
field in the answer, cli-core's runtime does the paging and the sync, and a builder writes code only for what the
config cannot say (a hook).

Attio was the pilot. The question: how much does a CRM CLI take by hand when it is built only from the config and
hooks, and how long from `cli-template new` to `cli-dev ready`? Every place the config could not say something was
logged as a gap. The answer decides whether the next CRM CLIs start from a config file.

## Setup

- Linux x86_64, Node 24.19.0. One builder agent, with a fresh agent for each review.
- attio-cli made with `new --from-config` from cli-template 0.28.0, on cli-core 0.696.0 and cli-base 0.114.0 at the
  start; finished on cli-base 0.117.0 and cli-core 0.698.0, which carry the gaps the pilot fixed (below).
- attio-cli syncs Attio's people, companies and workspace members into cli-core's store, and has an `api` group of
  107 operations generated from Attio's OpenAPI description. It has no deals, no custom attributes, no writes and no
  OAuth yet (see "What was not measured").
- hubspot-cli at `253e6c4` and bitrix24-cli at `7e2877e`, counted as in
  [new-cli-lines](../../engineering/new-cli-lines/README.md), with the same exclusions for bitrix24-cli.
- The command, with [count.py](../../engineering/new-cli-lines/count.py) from new-cli-lines:

```sh
python3 ../../engineering/new-cli-lines/count.py \
  --repo attio="$HOME"/Projects/AI/attio-cli@003b809 --since attio=8ab8f8b \
  --repo hubspot="$HOME"/Projects/AI/hubspot-cli@253e6c4 --since hubspot=28d04db \
  --repo bitrix24="$HOME"/Projects/AI/bitrix24-cli@7e2877e \
  --exclude 'bitrix24:src/calls/**' --exclude bitrix24:src/commands/calls.ts \
  --exclude bitrix24:src/commands/meetings.ts --exclude bitrix24:src/commands/sync-calls.ts \
  --exclude bitrix24:src/commands/transcribe.ts --exclude bitrix24:src/commands/models.ts \
  --exclude bitrix24:src/commands/products.ts --exclude bitrix24:src/crm/product.ts \
  --exclude bitrix24:src/crm/stage-history.ts --exclude bitrix24:src/crm/writer.ts \
  --exclude bitrix24:src/bitrix/oauth.ts
wc -l "$HOME"/Projects/AI/attio-cli/wirecat.config.ts
```

`8ab8f8b` is the commit `new` made. `count.py` counts `.ts` files under `src/`; `wirecat.config.ts` sits at the
repository root, so it is counted with `wc -l`. The raw numbers are in [result.json](result.json).

## Results

| | attio-cli | hubspot-cli | bitrix24-cli |
|---|---:|---:|---:|
| Config (`wirecat.config.ts`) | **64** | — | — |
| Hooks (`src/hooks.ts`) | **23** | — | — |
| Source written after `new`, hooks included | **42** (23 hook + 19 wiring) | 2,340 | — |
| Source lines, comparable | 402 | 2,636 | 4,148 |
| Tests written after `new` | 98 | 1,403 | 6,958 (all) |
| Test helpers written after `new` | 3 | 598 | 810 (all) |
| From `new` to `cli-dev ready` (all rows but the live check) | 1 h 20 min, with 17 tests failing on the kit's bugs; green after the fixes below (about 1 h 20 min more) and two releases | 50 min; 1 h 38 min with reviews | 11 days |

The 19 lines of wiring are what `new` could not know: hosts, texts, the pace of requests, and the `live` option for the
users list. The 64 config lines map 3 kinds (people, companies, workspace members) with 18 field rules; the 23 hook
lines keep only the current value of each Attio attribute (Attio keeps old values in the same list).

## What it showed

- **87 lines of config and hook and 19 more of wiring, against 2,340 in hubspot-cli.** The scope is smaller
  (see below), so the two totals are not a percentage saving: hubspot-cli also syncs deals, leads, activities,
  owners and pipelines.
- **The config was not the slow part; the kit's bugs were.** The CLI was written in 1 h 20 min (21:58 → 23:18), and
  `cli-dev ready` then showed everything verified but the tests: 17 failed. All 17 were bugs in the shared packages,
  not in attio-cli: the strict fake refused its own sample of a `oneOf`, a sign-in check read the first branch of a
  union (Attio's "token not active" answer), and pattern samples did not match their patterns. Fixing them took
  cli-base [#642](https://github.com/WireCatLabs/cli-base/pull/642) and cli-core
  [#3102](https://github.com/WireCatLabs/cli-core/pull/3102), about 1 h 20 min more with reviews, plus the releases.
- **Attio's API description generated with no patch** once cli-base #642 was in (107 operations; an earlier draft said 108). Before it, the
  builder needed four patches of the description and three command names.
- **15 findings were logged** in the plan: kit bugs, and places where the config cannot say something. The ones that block more of Attio: deals (a status
  attribute with no fixed stage list and no outcome hook), custom attributes (no per-workspace field list), and OAuth
  as a second sign-in.

## Deals and the workspace's own attributes (0.1.0)

The first build left deals out. The owner asked for attio to work like bitrix24-cli: deals and their pipeline in the
local copy, people and companies read live from Attio, and each workspace's own attributes kept. That went into the
first release, `@wirecat/attio-cli` 0.1.0 (`0c33e81`), counted with the same command at `0c33e81`.

| | first build (`003b809`) | 0.1.0 (`0c33e81`) |
|---|---:|---:|
| Config (`wirecat.config.ts`) | 64 | **126** |
| Hooks (`src/hooks.ts`) | 23 | **8** |
| Source written after `new`, hooks included | 42 | **75** |
| Source lines, comparable | 402 | 341 |
| Tests written after `new` | 98 | 391 |

- **Deals cost 62 lines of config and no new hook.** The 23-line hook that kept an attribute's current value became
  one config option in cli-core (`custom.typed`), and Attio's stage outcomes are the one hook left: a stage Attio
  celebrates is won, one titled "Lost" is lost. cli-core [#3114](https://github.com/WireCatLabs/cli-core/pull/3114)
  (0.700.0) added flat stages, typed attribute values and a live list for a searched kind.
- **The comparable source fell by 61 lines** because the template's own seeds took over code attio had written by
  hand. The wiring grew from 19 to 67 lines, among them hosts, texts and the live lists of people and companies.
- **Most new test lines are coverage, not mapping.** CI's test matrix asked for a test of every command and option
  (540 in all); one api test and one CRM test cover them.
- **The live check passed on the owner's workspace**: 12 companies, 6 people, one pipeline with 4 stages, and live
  people and companies answering. It held no deals, so deals were checked against the fake only.

## What was not measured

- The first build's comparison covers people, companies and users only; hubspot-cli's numbers include deals, leads,
  activities, owners and pipelines. 0.1.0 adds deals and custom attributes, but still no custom objects, writes or
  OAuth.
- Deals on real data: the owner's workspace has none, so the deal mapping is checked against the fake only.
- Hours a person spent: the owner answered three questions.
