# CRM relationships, end to end

The owner asked for one picture of a client and its people that every answer backs with a source: who works where,
who reports to whom, who is on which deal and in what part, the money and the talks around it, and what was not
read. The CRM relationships plan (TASK-925) splits that work over cli-core, bitrix24-cli and cli-memo. Each pull
request tests its own part. This check asks whether the parts make that picture together when the built CLIs run
from the outside, and whether the docs' examples work as written. It runs the plan's acceptance scenario (§8, 13
checks). It feeds the decision to release the stack, and names what must be fixed first.

**This first result is a pre-release run on unreleased builds** (below). Rerun it on the released versions before
anyone relies on it.

## The scenario

Everything is synthetic, with `example` domains.

- **Companies.** Northstar Consulting is the portal's own company (`crm.mycompany.basic.list`). Acme Ltd is a client
  company of type `CUSTOMER`. The owner maps that type to `customer-of` with
  `b24 work config set crm.bitrix24:<portal>.company-types CUSTOMER=customer-of`.
- **People.**
  - Alice (Acme, procurement manager), Bob (Acme, CEO) and Carol (Acme, office manager) are CRM contacts of Acme.
  - Emma (sales owner) and Grace (head of the Sales department) are portal users.
  - Dana is a person the owner added by name only.
- **The deal.** "Acme renewal" lists Alice as its contact, and Emma is assigned to it. The owner adds Bob as
  `decision-maker` and sets the deal's project to Atlas (`memo deals update … --project ATL`).
- **The talks and the money.**
  - Alice writes in a work Telegram chat.
  - Bob's mail, and a front-desk mail from Carol's address, are in the owner's mailbox.
  - A calendar event (a Zoom call) has Alice, Bob and Emma.
  - There is an invoice to Acme with no payment, and an open follow-up task.
- **Groups.** The owner saves the groups explicitly: `work` is the Bitrix24 account and the work Telegram account.
  `personal` is a second Telegram account (a chat with a friend, Rita) and the mailbox.

## Reproduce

Use Node 24 and util-linux `script`. Make an npm install prefix that holds `@wirecat/bitrix24-cli` and
`@wirecat/cli-memo` with one shared `@wirecat/cli-core`, and keep its `package-lock.json`. After the release:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix $T/packages --ignore-scripts --no-audit --no-fund @wirecat/bitrix24-cli@VERSION @wirecat/cli-memo@VERSION
```

Check out the two repositories at the same versions for their docs, then run from this repository's root:

```sh
node performance/crm/relationships/run.mjs /abs/prefix /abs/result.json --memo-docs /abs/cli-memo --b24-docs /abs/bitrix24-cli
```

`--build FILE` adds a JSON description of a local build to the report. The script edits nothing about the packages.
Paths are its only inputs, so a rerun on other builds needs no change to it.

How the runner reaches each CLI:

- **b24.** The runner starts b24's real binary under the shared
  [external-I/O guard](../../documents/drive-shared-store/guard.mjs), with [`portal.mjs`](portal.mjs) preloaded.
  `portal.mjs` answers the invented webhook host `example.bitrix24.test` from a JSON file that the runner edits
  between syncs. It knows only the methods, parameters and fields of the
  [Bitrix24 REST reference](https://apidocs.bitrix24.com/api-reference/), and it refuses anything else: an unknown
  method or field, the wrong REST version, or a `companiesId` filter. b24 publishes no testing entry, and its own
  fake portal is not in the package. It reads the webhook from `B24_TOKEN`, here an invented address.
- **The non-CRM rows.** Telegram, mail and calendar rows go in through the same cli-core store calls an import makes
  (`saveMessages`, `saveThread`, `saveEntries`). These are cli-core's calls, the version memo runs on. No CLI in this
  set imports them without a real account. The owner's identity link and separation are also store calls
  (`people.linkIdentities`, `people.unlinkIdentity`), because memo has no command for them. tg and max make the same
  calls.
- **memo.** Every memo command runs memo's real binary. The owner's writes go through a pseudo-terminal
  (`script -qec`). memo counts a write as the owner's only when stdin and stdout are a terminal (`whoRuns`,
  `src/author.ts`). Any other run counts as an unattended agent, whose relationships wait as proposals. At a terminal,
  `--json` must name its fields, so the owner writes in text and the runner reads the result back with `--json`.
  The shared setup answers are written first, as an owner who already ran `setup` would have them. Without them, the
  first run at a terminal stops on the language question.
- **MCP.** Check 12 talks to a real `memo mcp serve` over stdio.
- **Isolation.**
  - Each run gets a new temporary HOME, XDG folders, store, state and configuration.
  - Every process gets `DBUS_SESSION_BUS_ADDRESS=disabled:`, so no keyring is reached.
  - Children get an allowlist of variables, so no agent variable reaches memo.
  - The temporary folder is left behind for inspection.

## Results

[The pre-release run](result.json), on Node v24.19.0, passed 11 of 13 checks.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Alice's CRM contact and Telegram identity are one person once the owner links them | **Fail** | They join, and `search people` finds one Alice. But `people list` shows three: the persons the two merges emptied stay listed |
| 2 | Bob is Alice's manager only through the owner's link | Pass | No `reports-to` before the owner's link, `confirmed` after it. The portal's own line (Emma → Grace, from the department head) is `reported` |
| 3 | The deal has Alice `contact`, Bob `decision-maker` and Emma `owner`, each once, with a standing | Pass | `contact:reported`, `decision-maker:confirmed`, `owner:reported` |
| 4 | Acme's context has its people and its deal, each once | Pass | Alice, Bob and Carol once each, and the deal once. Category `client` comes from the company-types setting |
| 5 | `memo context person:` answers for a CRM-only person and a name-only person | Pass | Grace: her name, `employee` of Northstar, Emma under her. Dana: her name and what was not read |
| 6 | The deal's context shows the meeting and the messages, marked `proposed` | Pass | Counts are 1 message, 1 mail and 1 meeting, all `proposed` |
| 7 | The invoice shows unpaid, and no payment appears | Pass | `issued`, open 1200.00, 0 payments on the deal and on Acme |
| 8 | Three `b24 sync` runs (one with `--rescan`) leave one link per relationship and no new revisions | Pass | 11 links and 11 revisions before and after, no duplicate key |
| 9 | A wrong identity join, separated by the owner, stays separated after two re-syncs | Pass | The CRM contact and the front-desk mail address stay two persons |
| 10 | A CRM change does not overwrite a role the owner set | **Fail** | Bob keeps `decision-maker:confirmed` when the CRM also lists him. But the owner's change of Alice's role to `manager` reads as `reported` |
| 11 | A group lock never reads the other group's accounts, and `deals: deny` hides deals | Pass | Under the `personal` lock: no deal, no work chat, no CRM-only person. Alice's context is refused, and Bob's shows only his mail. Under the `work` lock: no personal chat and no mail. Each item is found without a lock |
| 12 | Every new memo command is found by `memo_tools_search` over a real stdio MCP process | Pass | All 13, each by a short phrase. `memo_read deals context` answers for the same deal |
| 13 | Each docs example that names these commands runs as written | Pass | 45 examples found, 38 run. Of the other 7, 5 have placeholders and 2 install or remove an OS timer. The 3 bare command names in prose ran and count as mentions |

The strict portal answered 297 requests over 17 methods and refused none.

## What it showed

- **Check 1, in cli-core.** A merge leaves the emptied person behind. `mergePerson` and `move`
  (`src/store/sqlite/person-links.ts:165`) move the identities and never retire the person they leave. Both the
  owner's link and the CRM sync's same-email join (`joinByAddress`, `:203`) therefore leave one. `memo people list`
  shows each of them with its old name. The store had 3 Alices, 2 Bobs, 2 Emmas and 2 Graces. The code is the same
  on cli-core `main`, so this is older than these pull requests. But the plan's CRM sync (BUG-585: a CRM person
  takes the contact's name) is what gives the empty persons names, so they now look like duplicates.
- **Check 10, in cli-core.** `memo relationships update <id> --role manager` on a CRM-reported link rewrites that
  same row (`applyUpdate`, `src/store/sqlite/relation-proposals.ts:131`). The row keeps the CRM's `account_id` and
  `confirmed = 0`. So the owner's choice reads as "the CRM says Alice is a manager". The next sync then adds the
  CRM's `contact` back beside it. The confirm path at `:398` sets `confirmed = 1` and `source = 'owner'`. An owner's
  edit should take the link over the same way, and leave the CRM's claim to the diff's owner-wins rule (plan §4.1,
  rule 4).
- **The rest holds.**
  - The CRM's relationships are `reported`, and the owner's are `confirmed`.
  - Re-syncs are idempotent, and a separation survives them.
  - The money says what is stored, and no more.
  - The group locks hold in both directions.
- **Gaps an agent will hit.**
  - `memo search people Dana` finds nobody for a person the owner added by name. memo's skill (plan §6, step 1) says
    to resolve a person with `search people`.
  - `memo_tools_search` needs every word of the query to appear (cli-core `src/mcp/surface.ts`, `search`). So
    "who reports to whom", "remove account from group" or "one person's companies and deals" find nothing. The
    recorded task phrases found 6 of 13 commands.
  - In memo's `docs/usage.md`, "Groups of accounts" still describes `personal` as every account in no other group.
    The owner has since made the default group `all` and every group explicit.

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

## Pre-release builds

None of these were published. The commit shas are in [`result.json`](result.json) under `build`.

| Package | Built from |
| --- | --- |
| cli-core 0.604.0 | a local merge of [#2642](https://github.com/WireCatLabs/cli-core/pull/2642) `a00c5a641` (stacked on #2641 and #2629) and [#2632](https://github.com/WireCatLabs/cli-core/pull/2632) `3158ad664`. Conflicts were in imports and the CHANGELOG only. Never pushed |
| bitrix24-cli 0.5.0 | [#39](https://github.com/WireCatLabs/bitrix24-cli/pull/39) `919e9563d`, with that cli-core tarball added locally and not committed |
| cli-memo 0.131.48 | [#699](https://github.com/WireCatLabs/cli-memo/pull/699) `002773d09` on [#698](https://github.com/WireCatLabs/cli-memo/pull/698) `923f20ea4`, the same way |

The three tarballs were installed with npm into one prefix, with an `overrides` entry for cli-core. The lockfile
integrities, the versions and the SHA-256 of each executable are in the report.
