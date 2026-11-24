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

HubSpot test account 149800303 (a free developer test account, one deal pipeline, one user). Before the seed it held
WireCat live-check records, HubSpot's samples, and 24 companies and 30 contacts from an earlier mail import, with
real public sender addresses. No question or key uses those, and nothing here names them. [seed.mjs](seed.mjs) added an invented sales account
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
by one. No run failed on the setup: transcripts were read in full before scoring (A Q1, Q2, W1; B Q2, Q14, W3).

### Rerun of 2026-11-24: A with its local copy, hubspot-cli 0.6.0

The owner turned activities on with [a-setup.sh](a-setup.sh); the sync stored 51 notes, tasks, calls and meetings.
A was hubspot-cli 0.6.0, which adds `activities create comment|task` and `activities close`. B is its baseline sheet,
scored again beside A's new one, blind (`score.sh key.md "$RUN/runs/score-store" a=… b=…`).

| | A, local copy, 0.6.0 | B (baseline sheet) |
| --- | --- | --- |
| 20 read questions, scored blind | **19.5** | **18.5** |
| confidently wrong | 1 (Q18) | 0 |
| variants V3, V6, of 2 | 2 | 1.5 |
| write tasks passed, of 5 | 5 | 5 |
| time, 22 read questions (median a question) | 481 s (20.5 s) | 486 s (20 s) |
| cost, 22 read questions (median a question) | $1.82 ($0.083) | $2.42 ($0.10) |
| tool calls, 22 read questions (median) | 86 (3.5) | 176 (7) |
| time, cost and tool calls, 5 write tasks | 113 s, $0.36, 21 | 82 s, $0.50, 39 |
| refused shell commands, reads | 5 | 26 |

A's half point: Q18 says the SolarPack deal closed on 23.11, with no hedge; the key says 2026-11-10. `deals show`
gives both `close_date` (2026-11-10, HubSpot's `closedate`) and `closed_date` (2026-11-23, when the seed moved the
deal to won), and the agent took the second. Two fields one letter apart is a naming problem for hubspot-cli.

W1 and W2 now take one command each: `activities create comment --subject deal:16 --text …` and
`activities create task --subject person:… --subject organization:… --title … --due …`, with no HTTP 400 on the way.

### C, HubSpot's remote MCP, 2026-11-24

C ran on the same questions after the owner's sign-in, through the MCP tools only (`mcp__hubspot`, with `Read` and
`Skill`). All three read sheets were then scored together, blind, by a fresh scorer per sheet
(`score.sh key.md "$RUN/runs/score-three" a=… b=… c=…`): A's 0.6.0 sheet with its local copy, B's baseline sheet, C's.

| | A: WireCat `hubspot` 0.6.0 | B: HubSpot Agent CLI | C: HubSpot remote MCP |
| --- | --- | --- | --- |
| 20 read questions, scored blind | **19.5** | **18.5** | **18** |
| confidently wrong | 0 | 0 | 1 (Q15) |
| variants V3, V6, of 2 | 2 | 1.5 | 2 |
| write tasks passed, of 5 | 5 | 5 | 5 |
| time, 22 read questions (median a question) | 481 s (20.5 s) | 486 s (20 s) | 317 s (14.5 s) |
| cost, 22 read questions (median a question) | $1.82 ($0.083) | $2.42 ($0.10) | $1.86 ($0.084) |
| tool calls, 22 read questions (median) | 86 (3.5) | 176 (7) | 117 (5) |
| time, cost and tool calls, 5 write tasks | 113 s, $0.36, 21 | 82 s, $0.50, 39 | 67 s, $0.44, 26 |

C's lost points: Q3 0 (said there was nothing about Sergey's partner offer; the 20% quarterly note exists, and C's
own Q19 and V3 answers cite it), Q12 and Q20 half each (as A and B on Q12; Q20 without the demo task and with the
stage as an id), Q15 confidently wrong (an open total of 481,000 for 480,900). A's Q18 is the same half point as in
the rerun (`closed_date` for the close date): this scorer did not mark it confidently wrong, the earlier one did, so
one CW either way is within the scorer's own noise.

C's writes: W1 a note and W2 a task through `manage_crm_objects`, W3 to W5 the same way. The first `writes.mjs
verify`, run seconds after the writes, failed W1 and W2: HubSpot's association read returned nothing yet for the new
note and task. Read back a few minutes later both were there and linked right, and verify passed them; it now waits a
minute when it runs within 15 minutes of the writes.

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
Both are near the top of the scale, so this question set barely separates them on a small account: a harder set, or
a large account, is needed to tell them apart.

The A against B decisions are **final** after the rerun of 2026-11-24 with A at its best (its local copy on): 19.5
against 18.5 is still within 2, so no claim either way on answers. With the local copy, A used half B's tool calls
and three quarters of its cost for the same time. C scored 18, within 2 of both: no claim on answers against
HubSpot's MCP either. C was the fastest (median 14.5 s a question); A used the fewest tool calls. The decisions written
before the run:

- **Read score within 2: no claim either way.** compare.md keeps its feature marks only.
- **A did W3 and W4 in one command each**: compare.md's ✅ for "move by stage name" and "close lost with a reason"
  holds.
- **B did not**: each took a stage id and a dry run, digest and confirm round. compare.md's 🟡 for B on those rows
  holds.
- **A passed W1 and W2** through `api`. Two frictions on the way, for hubspot-cli: the skill names
  `hubspot skill show api-<group>`, but `api-notes` does not exist (the groups are `api-basic`, `api-search`,
  `api-batch`, `api-advanced`), and a deal's `deal:16` ref is not the id a note's association needs.
- **Time and cost**: A's median cost a question was 1.3 times B's, under the threshold of 2.

## Round 2: a large account

### Why

Round 1 scored A 19.5 and B 18.5 of 20: equal. On 40 contacts the agent with the plain CLI tries a few filters, then
lists every record and finds the name by eye (B's Q12: seven filter guesses, then a search by city). WireCat's local
store has typo-tolerant search and search by meaning; HubSpot's search API matches tokens of its default searchable
properties (for a note, `hs_note_body`), with `*` wildcards in `CONTAINS_TOKEN`, at most 200 a page, 10,000 results a
query and five requests a second ([HubSpot](https://developers.hubspot.com/docs/api-reference/search/guide)). The
owner ruled (NEED-2903 A, 2026-11-24): fill the test account with invented data, about 5,000 contacts, 2,000 deals and
3,000 notes, and ask about 10 questions with typos and by the meaning of notes. Round 2 makes the conditions where the
difference can show. It does not tune the questions to WireCat: every answer is reachable through HubSpot's own API
with enough effort ([key-large.md](key-large.md), "Reachable through HubSpot's own API").

### Data

[large-data.mjs](large-data.mjs) builds the account from a fixed seed (no clock, no network, no model), from the pools
of [large-pools.mjs](large-pools.mjs) and the planted records of [large-needles.mjs](large-needles.mjs):
`node large-data.mjs` prints the counts and a checksum. Russian, Spanish, German, English and a few Italian companies;
Russian people in Latin script too; notes of two to nine sentences from a pool of about 130, with bullet lists,
"Sent from my phone" tails and swapped letters. The needles sit among near misses planted on purpose: twelve
Hoffmann, Hofmann and Hoffman; five Schmid, Schmidt and Schmitt companies; Giménez and Jiménez; seven Петров; notes
where the client moved its own start, where "их конкуренты" are the client's rivals, where a payment ahead carries no
discount. [seed-large.mjs](seed-large.mjs) seeds it through HubSpot's batch API (100 a call, four calls a second, so
contestants sharing the key keep their share), with a status CSV per batch in `RUN/large/`.

**What the account's limit forced.** The owner asked for about 5,000 contacts, 2,000 deals and 3,000 notes. The test
account refuses every create, of any type, with HTTP 402 `Portal 149800303 cannot create another BUCKETED_OBJECTS. It
has exceeded the limit of 3000`. HubSpot's pages on account types and record limits do not name this limit for a
developer test account, and the limits API (`/crm/limits/2026-09/records`) answers `limit: 0`. What the seed showed
(inferred from two trips, not documented):

- Each type seems capped at about 3,000, and once one type is over, every create of every type is refused. It
  tripped at 3,375 contacts (with 859 companies), then again at 3,021 notes (with 2,840 companies, contacts and deals
  together, 317 tasks).
- Archived records count. Creates stayed refused with 2,794 live contacts and 651 archived; they came back only after
  the contacts were deleted for good (`POST /crm/v3/objects/contacts/gdpr-delete`). HubSpot deletes only contacts
  that way; a deleted note stays in the recycle bin for 90 days
  ([HubSpot](https://knowledge.hubspot.com/records/restore-deleted-activity-in-a-record)).
- The limit is checked late: with three batches of 100 in flight, 3 to 5 more batches go through. A refused batch keeps
  what it made before the refusal. Reseeding near the limit needs at least 500 headroom per type, or one batch at a
  time.

**Seed status (2026-11-24).** In the account from round 2: 820 companies, 1,300 contacts, 580 deals, 2,830 notes and
300 tasks (`SIZE` in large-pools.mjs). 2,075 contacts made beyond the plan were deleted for good. The notes passed
the limit before the plan was shrunk: 170 notes beyond it and three probe records (a note, a task, a deal) are
archived and, by the finding above, hold the account over the limit until about 2027-02-22, when HubSpot empties the
recycle bin. Until then the account refuses every create, by any contestant, round 1's W1 and W2 too; updates still
work. So no call or meeting of round 2 exists, and the needles of L8 (a meeting) and L10 (a call) are missing: those
two questions wait, and this round runs L1 to L7 and L9. `node seed-large.mjs seed` makes them when creates come
back. Every other needle reads back from HubSpot as the key says (`node seed-large.mjs verify`).

The scope of round 2's conclusion is this size: about 1,370 contacts, 860 companies, 610 deals and 2,850 notes. That
is too many to list and read by eye (HubSpot's list endpoints give 100 a page), but well under the owner's 5,000
contacts.

Everything round 2 made is tagged: companies and contacts by the domain `l2.seed.wirecat.dev` (round 1 is
`seed.wirecat.dev`), every record by its id in `RUN/large/seed-status.csv`. Removal: archive those ids with HubSpot's batch archive endpoints, activities first; the owner's local `CLEANUP.md` lists it.

### Questions and key

[questions-large.md](questions-large.md): L1 to L10. [key-large.md](key-large.md) holds the answers, written from the
generator before the questions; [score-rules-large.md](score-rules-large.md) the scorer's rules (`SCORE_RULES=… score.sh
key-large.md …`). A fresh agent wrote the questions. It saw round 1's questions as style samples and, per question, the needle records,
what the user wants and knows ("heard the surname as …", "names no client"), the hard case to keep, and for L1 the
near-duplicate people. It did not see the key. The owner has not yet approved the questions.

| Hard case | Questions |
| --- | --- |
| a name misspelt or transliterated, with near-duplicates in the account | L1, L2, L3, L6, L8 |
| found only by the meaning of a note or call, in another language or other words | L4, L5, L7, L10 |
| a list spread over several records | L4, L7 |
| a fact spread over a note and a task | L6 |
| no answer in the data | L9 |

Run, after the seed:

```sh
node large-data.mjs                     # counts and checksum
node seed-large.mjs seed                # restartable; planted records first; stops at a 402
node seed-large.mjs verify && node seed-large.mjs probe
node run.mjs a questions-large.md --label large --only L1,L2,L3,L4,L5,L6,L7,L9   # and b, c; L8, L10 once seeded
SCORE_RULES=score-rules-large.md ../../agents/source-coverage/score.sh key-large.md "$RUN/runs/score-large" a=… b=…
```

Round 1's key was written for the small account. Round 1 is not rerun on the large one: its counts and sums (Q2, Q7,
Q8, Q15) would no longer hold.

### Round 2: thresholds and decisions, written before the run

Eight questions while L8 and L10 wait (ten when they run), one run each: a difference of 1 or 2 is noise.

| Outcome | Decision |
| --- | --- |
| A scores 3 or more above B (of 8, or of 10) | wirecat.dev and compare.md may say, with this scope (about 1,370 contacts and 2,850 notes, misspelt names and questions by meaning, Claude Sonnet 5.5), that an agent finds records HubSpot's search misses through `hubspot` |
| A and B within 2 | no claim either way on answers |
| B scores 3 or more above A | a hubspot-cli issue for each question A lost, before its next release |
| A loses 2 or more of L1, L2, L3, L6 (and L8) | a hubspot-cli issue: typo-tolerant search does not reach contacts and companies the way the skill uses it |
| A loses 2 or more of L4, L5, L7 (and L10) | a hubspot-cli issue: search by meaning over notes and calls (vectors built? used by the skill?) |
| A confidently wrong more than once | a hubspot-cli issue on the skill's rules for near-duplicate names |
| A's median time or cost is twice B's or more, at a score within 2 | a hubspot-cli issue on the store-first path's cost |
| B's median tool calls or cost is twice A's or more, at a score within 2 | the claim may be about effort only: "the same answers with half the calls", with the scope |

### Round 2: results, 2026-11-24

Eight questions (L1 to L7 and L9; L8 and L10 wait for the account's create limit), one run each, all three sheets
scored together, blind (`score.sh key-large.md "$RUN/runs/score-large" a=… b=… c=…` with
[score-rules-large.md](score-rules-large.md)). A had no vectors: cli-core's search by meaning reads message vectors
only, not CRM notes, so there was nothing to build for this account and A ran as it ships.

| | A: WireCat `hubspot` 0.6.0 | B: HubSpot Agent CLI | C: HubSpot remote MCP |
| --- | --- | --- | --- |
| 8 questions, scored blind | **6.5** | **7** | **5.5** |
| confidently wrong | 1 (L6) | 1 (L6) | 0 |
| time, 8 questions | 398 s | 407 s | 174 s |
| cost, 8 questions | $1.54 | $1.75 | $1.09 |
| tool calls, 8 questions | 127 | 150 | 72 |
| refused shell commands | 16 | 17 | 3 |

| Question | A | B | C |
| --- | --- | --- | --- |
| L1 Hoffmann among Hofmann and others | 1 | 1 | 1 |
| L2 Schmid & Söhne's open deals | 1 | 1 | 1 |
| L3 Giménez, written Gimenez | 1 | 1 | 1 |
| L4 who complained the launch slipped again (4 clients) | 0.5 (3 of 4) | 1 | 0 (1 of 4) |
| L5 the Kazakh-language deal | 1 | 1 | 1 |
| L6 "ферраре", Ferraro beside the decoy Ferrara Design | 0, CW | 0, CW | 0.5 |
| L7 competitors offered cheaper (3 clients) | 1 | 1 | 0 |
| L9 nobody asked for a prepay discount | 1 | 1 | 1 |

What it showed, on this scope (about 1,370 contacts, 860 companies, 610 deals and 2,850 notes, Claude Sonnet 5.5):

- **No claim on answers.** A and B are within 2, and B's half point more is noise. C answered fastest and cheapest
  but missed the questions by meaning (L4, L7): its search did not reach them and it did not read the notes in bulk.
- **A did not use what WireCat is believed to have.** On L4 and L7 A listed every note into a file and searched it
  with regular expressions, as B did through the API (38 to 48 tool calls each). On L6 A searched `Ferrara` and took
  the decoy. Read back by hand on A's store: `search all Ferrara` finds Ferrara Design and not Ferraro Arredamenti,
  `search all Ferarro` (a word no record holds) is corrected to Ferraro, `search all феррара` and `people list Хофман`
  find nothing, and `search all "мебель итальян"` finds nothing. So on CRM records a misspelt word is corrected only
  when it matches no record at all (a near-duplicate that does match hides the right one), Cyrillic is not matched to
  Latin, and there is no search by meaning.
- **Thresholds written before the run:** none of the hubspot-cli issues triggered (A lost one name question and half
  a meaning question; one CW; cost under B's). The gap above is filed as [cli-core #3285](https://github.com/WireCatLabs/cli-core/issues/3285) on its own evidence, since a
  claim of typo-tolerant and meaning search on CRM data is not true today.

### Round 2 rerun: A with search by meaning, 2026-11-24

The gaps round 2 found were fixed in cli-core 0.743.0: near-duplicate names after the exact hits (#3290), a Latin name
typed in Cyrillic (#3291), and `search all` by the meaning of CRM activities after `sync --embed` (#3296), with a
skill line in hubspot-cli ([#29](https://github.com/WireCatLabs/hubspot-cli/pull/29)) that says to ask by meaning
before reading every note. **A ran a build of hubspot-cli's #29 branch (0.6.0 + cli-core 0.743.0), not a release**:
HubSpot's release needs a live check that creates records, and the account refuses creates. A's store was embedded
first (`sync --embed` five times, 3,145 chunks, EmbeddingGemma, about a minute a run). B and C are their round-2
sheets; all three were scored again together, blind.

| | A, meaning search | A in round 2 | B: HubSpot Agent CLI | C: HubSpot remote MCP |
| --- | --- | --- | --- | --- |
| 8 questions, scored blind | **8** | 6.5 | **7** | **5.5** |
| confidently wrong | 0 | 1 | 1 | 0 |
| time, 8 questions (median) | 223 s (26.5 s) | 398 s (41 s) | 407 s (34 s) | 174 s (19 s) |
| cost, 8 questions (median) | $0.92 ($0.109) | $1.54 ($0.124) | $1.75 ($0.134) | $1.09 ($0.114) |
| tool calls, 8 questions (median) | 45 (4) | 127 (8.5) | 150 (11) | 72 (6.5) |

A's L4 and L7 took 4 tool calls each, against 48 and 38 in round 2: one `search all` by meaning instead of every note
in a file. L6 found Ferraro beside the decoy. By the thresholds written before the run: 8 against 7 is within 2, so
**no claim on answers**; B's median tool calls are 2.75 times A's at a score within 2, so the claim may be about
effort: on this scope, an agent gives the same answers through `hubspot` with about a third of the tool calls and
half the cost of HubSpot's Agent CLI. One run per question: the effort gap is large, the score gap is noise.

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

The sign-in lands in the Claude Code config folder of the `claude` you signed in with (`~/.claude` by default). Run C
with that folder: `CLAUDE_CONFIG_DIR=~/.claude node run.mjs c questions.md`; another folder has no sign-in and C
answers that HubSpot is not connected. `--check` makes one MCP call with that folder (`CLAUDE_CONFIG_DIR`, default
`~/.claude`) and says `Connected` or why not.

Then the run, by an agent or by hand: `node run.mjs c questions.md`, the write tasks with `writes.mjs verify` and
`reset`, and the scoring with C's sheet beside A's and B's.

## What was not measured

- Run-to-run noise: one run per question and contestant. A large account, where an agent cannot list every record
  and look by eye, is round 2.
- A with its local copy in the baseline: cli-core refuses `crm.hubspot:<account>.activities on` to a command run
  by an agent ("the owner's to set, in a terminal"). The owner ran [a-setup.sh](a-setup.sh) and the rerun measured
  it. B was not rerun: its sheet is the baseline's, so run-to-run noise is not measured for either.
- A sign-in as a HubSpot user (OAuth) for B: both A and B used the account's service key.
- Tickets, e-mails and several pipelines: the key has no scope for them.
- A large account: 32 deals favour live reads.
- Run-to-run spread: one run per question and contestant.
- The owner's own reading of the questions: they were written in his style by agents and not yet approved by him.
