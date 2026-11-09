# CRM relationships, end to end

The owner asked for one picture of a client and its people that every answer backs with a source: who works where,
who reports to whom, who is on which deal and in what part, the money and the talks around it, and what was not
read. The CRM relationships plan (TASK-925) splits that work over cli-core, bitrix24-cli and cli-memo. Each pull
request tests its own part. This check asks whether the parts make that picture together when the built CLIs run
from the outside, and whether the docs' examples work as written. It runs the plan's acceptance scenario (§8, 13
checks). It feeds the decision to release the stack, and names what must be fixed first.

**This result is a run on the published packages**: `@wirecat/bitrix24-cli` 0.9.0 and `@wirecat/cli-memo`
0.131.72, both on cli-core 0.619.0, installed from npm on 2026-11-09. An earlier run on unreleased builds is
described at the end.

## Results

[The run](result.json), on Node v24.19.0, passed 12 of 13 checks.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Alice's CRM contact and Telegram identity are one person once the owner links them | Pass | One person with the `bitrix24`, `email` and `telegram` identities, and `search people Alice` finds one |
| 2 | Bob is Alice's manager only through the owner's link | Pass | No `reports-to` before the owner's link, `confirmed` after it. The portal's own line (Emma → Grace, from the department head) is `reported` |
| 3 | The deal has Alice `contact`, Bob `decision-maker` and Emma `owner`, each once, with a standing | Pass | `contact:reported`, `decision-maker:confirmed`, `owner:reported` |
| 4 | Acme's context has its people and its deal, each once | Pass | Alice, Bob and Carol once each, and the deal once. Category `client` comes from the company-types setting |
| 5 | `memo context person:` answers for a CRM-only person and a name-only person | Pass | Grace: her name, `employee` of Northstar, Emma under her. Dana: her name and what was not read |
| 6 | The deal's context shows the meeting and the messages, marked `proposed` | Pass | 1 message, 1 mail and 1 meeting, all `proposed` |
| 7 | The invoice shows unpaid, and no payment appears | Pass | `issued`, open 1200.00, 0 payments on the deal and on Acme |
| 8 | Three `b24 sync` runs (one with `--rescan`) leave one link per relationship and no new revisions | Pass | 11 links and 11 revisions before and after, no duplicate key |
| 9 | A wrong identity join, separated by the owner, stays separated after two re-syncs | Pass | The CRM contact and the front-desk mail address stay two persons |
| 10 | A CRM change does not overwrite a role the owner set | Pass | Bob keeps `decision-maker:confirmed`. The owner's change of Alice's role makes one override link, `manager:confirmed`, which hides the CRM's `contact` row, and two syncs change nothing |
| 11 | A group lock never reads the other group's accounts, and `deals: deny` hides deals | **Fail** | The group locks hold in both directions. But with `"deals": "deny"` saved, an unattended `memo search all "Acme renewal"` returns `deal:1` |
| 12 | Every new memo command is found by `memo_tools_search` over a real stdio MCP process | Pass | All 13, each by a short phrase. `memo_read deals context` answers for the same deal |
| 13 | Each docs example that names these commands runs as written | Pass | 50 examples found in the docs of the two released versions, 41 run. Of the other 9, 7 have placeholders and 2 install or remove an OS timer. The 3 bare command names in prose ran and count as mentions |

The strict portal answered 297 requests over 17 methods and refused none.

## What it showed

- **Check 11, in cli-memo.** `search all` gated the CRM lane on the MCP server's levels only. A run that is neither
  MCP nor the owner at a terminal (an agent's shell) therefore listed the title of a deal that memo's saved
  permissions deny, while `memo deals context` refused the same deal. The fix is
  [cli-memo #777](https://github.com/WireCatLabs/cli-memo/pull/777); the owner's own terminal search still finds
  everything. Rerun this check on the memo release that carries it.
- **Check 1 passes now.** On the unreleased builds a merge left the emptied person behind, so `search people`
  found three Alices. On the released packages it finds one.
- **Check 13 needed one change in the runner.** The docs' engagement examples
  (`memo relationships update 4 --engagement low`) name a relationship by number; the runner now gives them the
  person's place on a project that an earlier example of the same page adds.
- **The rest holds.**
  - The CRM's relationships are `reported`, and the owner's are `confirmed`.
  - Re-syncs are idempotent, and a separation survives them.
  - The money says what is stored, and no more.
- **Gaps an agent will hit.**
  - `memo_tools_search` needs every word of the query to appear (cli-core `src/mcp/surface.ts`, `search`). The
    recorded task phrases found 6 of 13 commands.

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
