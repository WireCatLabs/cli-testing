<!-- cspell:words attio bitrix hubspot -->

# Attio CLI from a config file: hand-written code and time

Measured 2026-11-18 on the first build of `attio` (`@wirecat/attio-cli`).

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
  108 operations generated from Attio's OpenAPI description. It has no deals, no custom attributes, no writes and no
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
- **Attio's API description generated with no patch** once cli-base #642 was in (108 operations). Before it, the
  builder needed four patches of the description and three command names.
- **15 findings were logged** in the plan: kit bugs, and places where the config cannot say something. The ones that block more of Attio: deals (a status
  attribute with no fixed stage list and no outcome hook), custom attributes (no per-workspace field list), and OAuth
  as a second sign-in.

## What was not measured

- Deals, custom attributes and custom objects, writes, OAuth: attio-cli does not have them yet, so the comparison
  covers people, companies and users only. hubspot-cli's numbers include deals, leads, activities, owners and
  pipelines.
- The live check against a real Attio workspace: it is the owner's and had not run when this was written.
- Hours a person spent: the owner answered three questions.
