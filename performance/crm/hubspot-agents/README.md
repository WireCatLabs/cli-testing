# HubSpot: WireCat `hubspot` against HubSpot's own agent tools

**Status: baseline before WireCat activity writes (notes/tasks), C pending owner sign-in.**

## Why it was run

hubspot-cli's [comparison page](https://github.com/WireCatLabs/hubspot-cli/blob/main/docs/compare.md) marks what
WireCat `hubspot`, HubSpot's remote MCP server and HubSpot's Agent CLI can do, from their documentation only: "Nothing
was signed in to or tested live". The owner asked to back that table with numbers (NEED-2892, answer A, 2026-11-23):
on one HubSpot account, do the tools let an agent answer a salesperson's questions and make the usual changes, and how
fast and at what cost? The result feeds two decisions: which marks of the comparison page hold, and what hubspot-cli
fixes first.

The test follows [AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md): questions in the owner's style, every contestant
at its best, blind scoring, thresholds written before the run.

## Contestants

| Id | Contestant | How the agent reaches HubSpot | Setup |
| --- | --- | --- | --- |
| A | WireCat `hubspot` 0.5.0 (npm `@wirecat/hubspot-cli`) | its local copy after a full `sync`, and HubSpot live for contacts and `api`; its shipped skill | [a-setup.sh](a-setup.sh) |
| B | HubSpot Agent CLI 0.18.0 (beta, build 1705) | HubSpot live; HubSpot's 19 agent skills (`hubspot/agent-cli-skills` at `b310eb5`) | [b-setup.sh](b-setup.sh) |
| C | HubSpot remote MCP (`mcp.hubspot.com`) | HubSpot live, as the HubSpot user who signs in | waits for the owner, see [C: the owner's steps](#c-the-owners-steps) |

Every contestant answers through the same agent and settings ([run.mjs](run.mjs)): Claude Code 2.1.330 in print mode,
Claude Sonnet 5.5, one fresh session per question, the same instructions, project settings only, the owner's own
CLAUDE.md off (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`), and the same shell tools: the contestant's `hubspot`, `jq`, `head`,
`sort`, `wc`, `Read` and `Skill`. A compound shell command (a `for` loop) is refused to both alike.

A and B both sign in with the same service key of the test account. The key has no scope for tickets, e-mails or
pipeline writes, so the data has none and no question needs them.

## Data

HubSpot test account 149800303 (a free developer test account, one deal pipeline, one user). It held a few
WireCat live-check records and HubSpot's samples. [seed.mjs](seed.mjs) added an invented sales account
([seed-data.mjs](seed-data.mjs)): an AI-automation agency selling in Russia and Spain.

| | Seeded | Already there |
| --- | --- | --- |
| Companies | 15 (two "Альфа", two "Nordwind") | 24 |
| Contacts | 40 (three Sergeys: Кузьмин, Кузнецов and Kuznetsov; Степан Морозов and Степан Мороз; Latin and Cyrillic) | 30 |
| Deals | 30 across all 7 stages, 5 lost with a reason | 2 |
| Notes, tasks (5 overdue), calls, meetings | 18, 13, 5, 5 | 2, 3, 3, 3 |

All 32 deals are in the one pipeline: the key may not create pipelines, so the "Партнёрства" and "Renewals"
pipelines of the seed were not made. The seed is idempotent: it keeps a status CSV and reuses records it finds by
domain, e-mail or name. Every name, phone and address is invented; e-mails sit under `seed.wirecat.dev`.

The scope is small (32 deals), which favours a tool that reads HubSpot live; a large account would favour a local
copy. Every question can be answered from HubSpot alone.

## Questions

[questions.md](questions.md): 20 read questions, 2 variants and 5 write tasks. [key.md](key.md) holds the answers.
Written by three agents: one wrote the key and picked the records; a second, which saw only the records and 40 of the
owner's real prompts as style samples, wrote the questions; a third added speech-to-text and typing errors to 7. The
owner's prompts are not in this repository.

| Hard case | Questions |
| --- | --- |
| no client named | Q1, Q2, Q7, Q8, Q15, Q16, Q17, Q20 |
| a name close to another one, or mangled | Q3, Q4, Q5, Q6, Q12, Q14, Q18 |
| a name two companies share | Q9, Q10 |
| the owner misremembers a detail | Q12 (city), Q13 (month), Q20 (kids' clinic) |
| needs many records | Q2, Q7, Q8, Q15 |
| no answer in the data, fully or in part | Q11, Q19 |
| two asks in one | Q6, Q13, Q18, Q19 |

Forms: 6 keyword or fragment lists, 7 full sentences, 2 long dictations, 1 table request, 3 in English, 1 mixed.
Variants V3 (English) and V6 (keywords) ask Q3's and Q6's facts again and are scored apart.

Write tasks: W1 a note on a deal, W2 a task with a due date, W3 move a deal to a stage by its name, W4 close a deal as
lost with a reason, W5 find a contact and change its phone. [writes.mjs](writes.mjs) checks each in the account after
a contestant's run (and that no other deal or contact changed), then puts the records back for the next contestant.

## Thresholds and decisions, written before the run

One run on one account: a difference of 1 or 2 of 20 is noise.

| Outcome | Decision |
| --- | --- |
| A scores 3 or more above B on the 20 read questions | compare.md may say, with this scope, that an agent answers sales questions better through `hubspot` |
| A and B within 2 | no claim either way; compare.md keeps its feature marks only |
| B scores 3 or more above A | a hubspot-cli issue for each question A lost, before its next release |
| A confidently wrong more than once | a hubspot-cli issue on the skill's "missing is not absent" rules |
| A fails W3 or W4 | compare.md's ✅ for "move by stage name" and "close lost with reason" is wrong: fix the command or the mark |
| B does W3 and W4 in one command each | compare.md's 🟡 for B on those rows is rechecked |
| A fails W1 or W2 | evidence for note and task commands of their own in hubspot-cli (today through `api`) |
| A's median time or cost is twice B's or more, at a score within 2 | a hubspot-cli issue on the skill's length or the store-first path |

## Run

```sh
cd performance/crm/hubspot-agents
./a-setup.sh && ./b-setup.sh             # once; a-setup.sh again in a terminal to turn activities on
node seed.mjs                            # once; reruns skip what is done
node run.mjs a questions.md --only Q1,…  # one contestant, one fresh session per question
since=$(date -u +%FT%TZ); node run.mjs a questions.md --only W1,W2,W3,W4,W5 --label writes
node writes.mjs verify --since "$since" && node writes.mjs reset --since "$since"
../../agents/source-coverage/score.sh key.md "$RUN/score" a=… b=…   # blind, with the rules file below
```

The run folder (`RUN`, default `~/.cache/wirecat-hubspot-agents`) holds the installs, the sign-ins, the transcripts
and the answer sheets. The service key stays in the system keyring: every script reads it in its own process and
hands it to the CLI on stdin or in that CLI's environment only.

## Results

Baseline of 2026-11-23, one run per question. A without its local copy of activities (see
[What was not measured](#what-was-not-measured)): it read notes, tasks, calls and meetings through `api`, live.

| | A: WireCat `hubspot` | B: HubSpot Agent CLI |
| --- | --- | --- |
| 20 read questions, scored blind | **19** | **18.5** |
| confidently wrong | 0 | 0 |
| variants V3, V6, of 2 | 2 | 1.5 |
| write tasks passed, of 5 | 5 | 5 |
| time, 22 read questions (median a question) | 509 s (23 s) | 486 s (20 s) |
| cost, 22 read questions (median a question) | $2.61 ($0.12) | $2.42 ($0.10) |
| tool calls, 22 read questions (median) | 164 (7) | 176 (7) |
| time, cost and tool calls, 5 write tasks | 83 s, $0.38, 24 | 82 s, $0.50, 39 |
| refused shell commands (a loop, `python`, `cd …;`), reads | 25 | 26 |

Scored by [score.sh](../../agents/source-coverage/score.sh) with [score-rules.md](score-rules.md): a scorer agent per
sheet, which knew neither sheet's author. The half points:

- A: Q12 (gave the number and Nordwind GmbH, but not that she is in Berlin), Q20 (no demo task).
- B: Q6 and V6 (did not name the deal), Q12 (as A), Q14 (did not look up Orbita's deal).

Every refused command was a compound shell line that neither contestant may run; each agent then ran the parts one
by one. No run failed on the setup: two transcripts of each were read before scoring (A Q1, Q2, Q3, W1; B Q2, Q3, Q17,
W3).

### How the write tasks were done

| Task | A | B |
| --- | --- | --- |
| W3 move to a stage by its name | `deals move deal:31 "Solution Design"`, one command | the stage's id from `pipelines list`, then `objects update --property dealstage=<id>` three times: refused, `--dry-run` for a digest, then `--digest … --confirm` |
| W4 close lost with a reason | `deals close deal:29 lost --reason "…"`, one command | `objects update` with stage `closedlost`, `closed_lost_reason` and close date: dry run, then digest and confirm |
| W1 a note on a deal | `api notes-create` with a JSON body; the first try used the local ref `16` as HubSpot's id and got HTTP 400 | `objects create --type notes`, then `associations create` |
| W2 a task, W5 a phone | `api tasks-create`; `people update` | `objects create --type tasks`; `objects update` |

## What it showed

On this scope (an invented account of 32 deals, questions in the owner's style, Claude Sonnet 5.5), the two command
lines answered about equally well: 19 against 18.5 of 20 is within the noise of one run. Neither invented an answer.
The decisions written before the run:

- **Read score within 2: no claim either way.** compare.md keeps its feature marks only.
- **A did W3 and W4 in one command each**: compare.md's ✅ for "move by stage name" and "close lost with a reason"
  holds.
- **B did not**: each took a stage id and a dry run, digest and confirm round. compare.md's 🟡 for B on those rows
  holds.
- **A passed W1 and W2** through `api`. Two frictions on the way, for hubspot-cli: the skill names
  `hubspot skill show api-<group>`, but `api-notes` does not exist (the groups are `api-basic`, `api-search`,
  `api-batch`, `api-advanced`), and a deal's `deal:16` ref is not the id a note's association needs.
- **Time and cost**: A's median cost a question was 1.3 times B's, under the threshold of 2.

## C: the owner's steps

HubSpot's remote MCP signs in as a HubSpot user, through a connector made in the account's UI and OAuth with PKCE in
the browser ([HubSpot](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server)).
Only a person can do that. One sitting, about five minutes:

1. Run [bin/hubspot-mcp-connect](../../../bin/hubspot-mcp-connect) in a terminal (Ruby 3; with rbenv and no global
   version, `RBENV_VERSION=3.4.8 bin/hubspot-mcp-connect`). It says what to click: in account
   149800303, Development > MCP Connectors > Create MCP connector, redirect URL `http://localhost:33418/callback`.
2. Paste the connector's client ID, then its client secret (hidden). The script registers the server for the test's
   agent folder only (`~/.cache/wirecat-hubspot-agents/c/agent/.mcp.json`).
3. In that folder, start `claude`, type `/mcp`, pick `hubspot`, Authenticate, sign in and allow. `/exit`.
4. `bin/hubspot-mcp-connect --check` says `Connected`.

Then the run, by an agent or by hand: `node run.mjs c questions.md`, the write tasks with `writes.mjs verify` and
`reset`, and the scoring with C's sheet beside A's and B's.

## What was not measured

- C, HubSpot's remote MCP: it waits for the owner's sign-in.
- A with its local copy of notes, tasks, calls and meetings. cli-core refuses `crm.hubspot:<account>.activities on`
  to a command run by an agent ("the owner's to set, in a terminal"), so A answered activity questions through `api`
  reads, live. The owner turns it on by running [a-setup.sh](a-setup.sh) once in a terminal; then A runs again.
- A sign-in as a HubSpot user (OAuth) for B: both A and B used the account's service key.
- Tickets, e-mails and several pipelines: the key has no scope for them.
- A large account: 32 deals favour live reads.
- Run-to-run spread: one run per question and contestant.
- The owner's own reading of the questions: they were written in his style by agents and not yet approved by him.
