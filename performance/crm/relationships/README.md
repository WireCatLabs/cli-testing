# CRM relationships, end to end

The owner asked for one picture of a client and its people that every answer backs with a source: who works where,
who reports to whom, who is on which deal and in what part, the money and the talks around it, and what was not
read. The CRM relationships plan (TASK-925) splits that work over cli-core, bitrix24-cli and cli-memo. Each pull
request tests its own part. This check asks whether the parts make that picture together when the built CLIs run
from the outside, and whether the docs' examples work as written. It runs the plan's acceptance scenario (§8, 13
checks). It feeds the decision to release the stack, and names what must be fixed first.

**This result is a rerun on the published packages of 2026-11-11**: `@wirecat/bitrix24-cli` 0.13.0 (on cli-core
0.635.0) and `@wirecat/cli-memo` 0.131.84 (on cli-core 0.640.0), installed from npm. The first run on published
packages (2026-11-09) failed check 11, and its fix,
[cli-memo #777](https://github.com/WireCatLabs/cli-memo/pull/777), shipped since. This rerun asks whether check 11
holds now, and whether anything else broke in the b24 and memo releases between. The 2026-11-09 run and
an earlier one on unreleased builds are described at the end.

## Setup

- Node v24.19.0 on Linux. Both CLIs from the npm registry into one throwaway prefix; versions,
  integrities and the SHA-256 of each entry file are in [result.json](result.json).
- The strict fake portal ([portal.mjs](portal.mjs)) behind b24's real binary; Telegram, mail and calendar rows go in
  through cli-core's store calls; memo's real binary and its stdio MCP server. Temp folders only, no keyring
  (`DBUS_SESSION_BUS_ADDRESS=disabled:`), no real account.
- The docs of check 13 come from the git tags `v0.131.84` (cli-memo) and `v0.13.0` (bitrix24-cli).
- Command: `node run.mjs PREFIX result.json --memo-docs MEMO_DOCS --b24-docs B24_DOCS` ([run.mjs](run.mjs)), where
  `PREFIX` holds the two installed packages and the docs folders are `git archive` of those tags.

## Results

[The run](result.json) passed 13 of 13 checks.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Alice's CRM contact and Telegram identity are one person once the owner links them | Pass | One person with the `bitrix24`, `email` and `telegram` identities, and `search people Alice` finds one |
| 2 | Bob is Alice's manager only through the owner's link | Pass | No `reports-to` before the owner's link, `confirmed` after it. The portal's own line (Emma → Grace) is `reported` |
| 3 | The deal has Alice `contact`, Bob `decision-maker` and Emma `owner`, each once, with a standing | Pass | `contact:reported`, `decision-maker:confirmed`, `owner:reported` |
| 4 | Acme's context has its people and its deal, each once | Pass | Alice, Bob and Carol once each, and the deal once |
| 5 | `memo context person:` answers for a CRM-only person and a name-only person | Pass | Grace and Dana, as before |
| 6 | The deal's context shows the meeting and the messages, marked `proposed` | Pass | 1 message, 1 mail and 1 meeting, all `proposed` |
| 7 | The invoice shows unpaid, and no payment appears | Pass | `issued`, open 1200.00, 0 payments |
| 8 | Three `b24 sync` runs (one with `--rescan`) leave one link per relationship and no new revisions | Pass | No new link, no new revision, no duplicate key |
| 9 | A wrong identity join, separated by the owner, stays separated after two re-syncs | Pass | Two persons after both syncs |
| 10 | A CRM change does not overwrite a role the owner set | Pass | Bob keeps `decision-maker:confirmed`; the owner's override of Alice holds |
| 11 | A group lock never reads the other group's accounts, and `deals: deny` hides deals | **Pass** (failed on 2026-11-09) | Locks hold both ways. With `"deals": "deny"`, `search all "Acme renewal"` returns nothing, Acme's context shows 0 deals, and `deals context` is refused (exit 5) |
| 12 | Every new memo command is found by `memo_tools_search` over a real stdio MCP process | Pass | All 13 by a short phrase. The task phrases still find 6 of 13 (see below) |
| 13 | Each docs example that names these commands runs as written | Pass | 50 examples, 41 run; the other 9 have placeholders or install an OS timer |

The strict portal answered 421 requests over 18 methods and refused none.

## What it showed

- **Check 11 is fixed by cli-memo #777.** An agent's shell no longer sees a deal that the saved permissions deny.
- **The runner needed three changes for the new releases.** None is a product bug:
  - b24 0.13.0 copies only the deals of the CRM users the owner chooses, so the runner chooses the webhook's own
    user (`config set crm.<portal>.unassigned 7`), who owns the deal.
  - b24 now asks the portal `user.admin` to tell an administrator's webhook; the fake portal answers it.
  - Since cli-core #2862, memo hides people whose addresses are all at reserved domains (`.example`) as test data.
    Every address here is one, so check 11's baseline found no Grace. The owner now keeps her as a real contact,
    the way a real owner would answer that question.
- **Still open: task phrases.** `memo_tools_search` needed every word of the query, so a task in an agent's words
  found 6 of 13 commands. The ranking fix and its before-and-after are in
  [../../agents/tools-search](../../agents/tools-search/README.md).

## What was not measured

- A live Bitrix24 portal.
- OAuth and real webhook rights. Missing scopes are b24's own tests.
- A real Zoom recording: the meeting is only a calendar event.
- A real Telegram or mail import: those rows come through the store calls.
- Identity matching beyond exact email.
- Scale: one company, five CRM people and one deal.
- Leads and their context on real data: there is no lead in the scenario.
- `b24 schedule` timers.
- memo's own notes, memories and facts under a group lock. The owner's projects, invoices and tasks are recorded
  under both locks, not asserted: they are visible in both by design.

## The first run on published packages (2026-11-09)

bitrix24-cli 0.9.0 and cli-memo 0.131.72, both on cli-core 0.619.0, passed 12 of 13. Check 11 failed: with
`"deals": "deny"` saved, an unattended `memo search all "Acme renewal"` returned `deal:1`, because `search all` gated
the CRM lane on the MCP server's levels only. Its full report is in this file's history.

## The earlier pre-release run

On 2026-11-08 the same script ran on unreleased builds and passed 12 of 13; check 1 failed (the merge left the
emptied person behind). Its report is in this file's history. None of these builds were published:

| Package | Built from |
| --- | --- |
| cli-core 0.604.0 | a local merge of [#2642](https://github.com/WireCatLabs/cli-core/pull/2642) `977d0ae29` (which contains #2641 `2c946fa2b`) and [#2632](https://github.com/WireCatLabs/cli-core/pull/2632) `37e93c7f2`. Conflicts were in imports and the CHANGELOG only. Never pushed |
| bitrix24-cli 0.5.0 | [#39](https://github.com/WireCatLabs/bitrix24-cli/pull/39) `66137f596`, with that cli-core tarball added locally and not committed |
| cli-memo 0.131.48 | [#699](https://github.com/WireCatLabs/cli-memo/pull/699) `c583358cf` on [#698](https://github.com/WireCatLabs/cli-memo/pull/698) `760d846bd`, the same way |

The three tarballs were installed with npm into one prefix, with an `overrides` entry for cli-core. The lockfile
integrities, the versions and the SHA-256 of each executable were in that report.
