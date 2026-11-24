# Attio: WireCat `attio` against Attio's own MCP and kesslerio's MCP server

**Status: all three run and scored blind (2026-11-24). With notes in its copy (attio-cli 0.4.0), `attio` answers as
well as Attio's own MCP, as fast and for the same cost.**

## Why it was run

The owner asked (2026-11-22) whether attio-cli had been compared with the other ways an agent reaches Attio. It had
not. The question this test answers: **does an agent that answers a salesperson's questions about Attio deals and
clients answer more correctly, faster or cheaper through WireCat `attio` than through Attio's own MCP server or the
community MCP server by kesslerio?** The result feeds two decisions: what the attio page on wirecat.dev may claim,
and what attio-cli fixes first.

The test follows [AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md) and mirrors
[hubspot-agents](../hubspot-agents/README.md): questions in the owner's style, every contestant at its best, blind
scoring, thresholds written before the run.

## Contestants

| Id | Contestant | How the agent reaches Attio | Setup |
| --- | --- | --- | --- |
| A | WireCat `attio` 0.3.0, then 0.3.1 and 0.4.0 (npm `@wirecat/attio-cli`) | its local copy of deals, people and companies after a full `sync`, and Attio live for notes, tasks and `api`, with its shipped skill | [a-setup.sh](a-setup.sh) |
| B | kesslerio `attio-mcp` 1.7.0 (npm, [GitHub](https://github.com/kesslerio/attio-mcp-server)) | Attio live, 44 MCP tools, with its `attio-mcp-usage` skill and the workspace-schema skill its own `attio-discover` writes | [b-setup.sh](b-setup.sh) |
| C | Attio's remote MCP (`https://mcp.attio.com/mcp`) | Attio live, as the Attio user who signs in, 30 MCP tools | the owner's sign-in, see [C: the owner's steps](#c-the-owners-steps) |

Every contestant answers through the same agent and settings ([run.mjs](run.mjs)): Claude Code 2.1.330 (2.1.331 in the second run) in print mode,
Claude Sonnet 5.5, one fresh session per question, the same instructions, project settings only, the owner's own
CLAUDE.md off (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`). A gets its `attio`, `jq`, `head`, `sort`, `wc`, `Read` and `Skill`.
B and C get their MCP server's tools, `Read` and `Skill`. The instructions tell the agent not to change anything. A
runs with every write off (`WCATTIO_READ_ONLY=1`).

A and B use the same workspace access token. It is read from the system keyring inside a script's own process
([with-token.mjs](with-token.mjs)) and handed to A's sign-in on stdin and to B's server in its environment only: it
never reaches a file, an argument, a log or the agent.

## Data

The owner's Attio workspace "WireCat" (one member, Attio's default deal stages Lead, In Progress, Won 🎉 and Lost).
It held no real clients. [seed.mjs](seed.mjs) added an invented sales account ([seed-data.mjs](seed-data.mjs)): an
agency selling AI automation in Russia, Spain and other European countries.

| | Seeded | Story records the questions are about | Already there |
| --- | --- | --- | --- |
| Companies | 150 | 14 | 2 from an earlier live check, about a dozen Attio made by itself |
| People | 373 | 27 | 3 from the live check, a few Attio made by itself |
| Deals | 120 across all 4 stages | 23 | 3 from the live check |
| Notes | 42 on 41 deals (a third) | 18 | none |
| Tasks | 12, 4 overdue, 2 done | 12 | none |

The story carries the hard cases. Two Сергей have close surnames (Ершов and Ершин), and a Sergei sits in Valencia.
Northwind Logistics Iberia, Northwinds Retail Group and the live check's Northwind Traders share a name. A person
changed company. Dmitry Orlov works in Spain and Дмитрий «Дима» Орлов in Novosibirsk. One client has no payment
recorded. A seeded
generator adds the rest of a small team's CRM, with no other Sergey, Dmitry or Northwind.

Attio's deals have no close date or lost reason of their own, so the seed added two deal attributes, `close_date` and
`lost_reason`. Every seeded company, person, deal and note title ends in "(WC seed)". The seed keeps a status CSV, one
row per record, and `node seed.mjs --delete` removes what it lists. It writes through Attio's REST API directly, 5
requests at a time, under Attio's limit of 25 writes a second
([Attio](https://docs.attio.com/rest-api/guides/rate-limiting)). Attio refused 16 of the generated phone numbers, so
16 filler people have none. No question asks for them. [facts.mjs](facts.mjs) computes the key's totals from the seed.

The scope favours a tool that reads Attio live less than HubSpot's did: 123 deals and about 380 people, not 32 deals.

## Questions

[questions.md](questions.md): 30 read questions and 6 variants. [key.md](key.md) holds the answers. Written by three
agents. One picked the records and wrote the key. A second, which saw only the records and 40 of the owner's real
prompts as style samples, wrote the questions. A third added speech-to-text and typing errors to 8 more. The owner's
prompts are not in this repository.

| Hard case | Questions |
| --- | --- |
| no client named | Q1, Q2, Q6, Q8, Q19, Q23, Q26 |
| a name mangled by a typo or dictation | Q3, Q4, Q7, Q9, Q12, Q13, Q14, Q15, Q20, Q22, Q24, Q25, Q27 |
| a name close to another one | Q3, Q5, Q11, Q15, Q20, Q30 |
| a name two or more records share | Q10, Q22, Q28, Q29 |
| the owner misremembers a detail | Q5 (person), Q7 (company), Q13 (month), Q21 (city) |
| needs many records | Q1, Q2, Q16, Q17, Q18, Q19, Q26 |
| no answer in the data, fully or in part | Q3, Q14, Q21, Q25, Q27 |
| two asks in one | Q4, Q11, Q19, Q21 |
| the answer is only in a note | Q3, Q4, Q9, Q11, Q12, Q13, Q15, Q20, Q24, Q25, Q30 |

Variants V3a and V3b, V9a and V9b, V12a and V12b ask Q3's, Q9's and Q12's facts again, in English and as keywords, and
are scored apart. All three facts sit in notes.

No write tasks: the plan measures reads only. Writes through B and C ask the client first, and through A they ask at
a terminal, so a write test is a separate one.

## Thresholds and decisions, written before the run

From the plan of 2026-11-23 (`plans/2026-11-17-attio-cli/comparison-plan.md` in the private cli-private repository).
One run on one workspace: a difference of 1 or 2 of 30 is noise.

| Outcome | Decision |
| --- | --- |
| A is 4 or more of 30 behind the best rival on questions that do not need a note | fix attio-cli's search before the comparison is published |
| A is behind only on note questions | backlog "notes in the store" (cli-core CRM), and the attio page says honestly that Attio's MCP searches notes better |
| A and the best rival within 2 | "equal on this synthetic data", and the page speaks of time and cost, not accuracy |
| A has more confidently wrong answers than a rival | each one is examined before anything is published |

## Run

```sh
cd performance/crm/attio-agents
node seed.mjs                       # once, reruns skip what is done
./a-setup.sh && ./b-setup.sh        # once, a-setup.sh again syncs again
node run.mjs a questions.md         # one contestant, one fresh session per question
node run.mjs b questions.md
node run.mjs c questions.md         # after the sign-in in "C: the owner's steps"
../../agents/source-coverage/score.sh key.md "$RUN/score" a=… b=…   # blind, SCORE_RULES=score-rules.md
node seed.mjs --delete              # when every contestant has run
```

The run folder (`RUN`, default `~/.cache/wirecat-attio-agents`) holds the installs, A's sign-in and store, the
transcripts and the answer sheets.

## Results

### attio 0.4.0 with notes in its copy, 2026-11-24

The run below showed A reading notes through raw `api` calls, a different path each time. attio-cli 0.4.0 copies
Attio's notes and tasks into the store with the `activities` setting on, so `search all` finds a deal by a note's
words and `deals show` lists its notes. [a-setup.sh](a-setup.sh) turns the setting on. A ran again on 0.4.0, and one
more blind pass scored it beside the four earlier sheets.

| | A: `attio` 0.4.0 | A: `attio` 0.3.1 | A: `attio` 0.3.0 | B: kesslerio 1.7.0 | C: Attio's MCP |
| --- | --- | --- | --- | --- | --- |
| 30 read questions, scored blind | 27.5 | 25 | 27 | 23.5 | **28** |
| of them, the 11 that need a note | **11** | 8.5 | **11** | 9 | 10 |
| of them, the 19 that do not | 16.5 | 16.5 | 16 | 14.5 | **18** |
| confidently wrong | 2 (Q14, Q18) | 0 | 1 (Q23) | 1 (Q17) | 1 (Q17), and 1 variant |
| variants, of 6 | **6** | 4 | 3 | 4 | 5.5 |
| time, 30 questions (median a question) | 588 s (15.5 s) | 1,078 s (36.5 s) | 1,072 s (35 s) | 1,267 s (28.5 s) | **477 s (15 s)** |
| cost, 30 questions (median a question) | **$2.74 ($0.077)** | $3.18 ($0.106) | $3.07 ($0.093) | $5.38 ($0.117) | **$2.74** ($0.093) |
| tool calls, 30 questions (median) | **161 (4)** | 207 (7) | 231 (7.5) | 405 (12) | 220 (7) |

The scores are per question as the scorer gave them. The scorer's own total for C said 28.5, and its rows add up to 28.
Between the two passes the same sheets moved by up to 1 point (B 22.5 and 23.5) and the scorer's CW marks changed
(A 0.3.1 had 1, now 0).

- **Notes in the copy halved A's time and cut its cost by a seventh.** The median question took 15.5 s and 4 tool
  calls, against 36.5 s and 7 on 0.3.1. A answered every keyword variant (6 of 6), where 0.3.x answered 3 or 4.
- **A's two confidently wrong answers are not about notes.** Q14: the agent searched "Finpoint" in Latin letters and
  found nothing, as `search all` does not match ФинПоинт. Q18 (won since September): every won deal had
  `closed_date` 2026-11-23, the day of the first sync, because Attio keeps no closed day. attio-cli takes the day the
  deal entered its stage from the next release on. In this seeded workspace that is the seed's day too, so Q18's
  answer still needs the seeded `close_date` attribute in `provider_metadata`.

### All three, 2026-11-24

C ran on 2026-11-24, and A ran again on attio-cli 0.3.1, which fixed the two A faults the first run found (the
`organizations show` ref and company descriptions). One blind pass scored four sheets: A on 0.3.1, A on 0.3.0 from
the first run, B from the first run and C. The scorer knew neither sheet's author.

| | A: `attio` 0.3.1 | A: `attio` 0.3.0 | B: kesslerio 1.7.0 | C: Attio's MCP |
| --- | --- | --- | --- | --- |
| 30 read questions, scored blind | 25 | 27 | 22.5 | **28** |
| of them, the 11 that need a note | 8.5 | **11** | 9 | 10 |
| of them, the 19 that do not | 16.5 | 16 | 13.5 | **18** |
| confidently wrong | 1 (Q18) | 1 (Q23) | 1 (Q17) | 1 (Q17), and 1 variant (V9b) |
| variants, of 6 | 4 | 3 | 4 | **5.5** |
| time, 30 questions (median a question) | 1,078 s (36.5 s) | 1,072 s (35 s) | 1,267 s (28.5 s) | **477 s (15 s)** |
| cost, 30 questions (median a question) | $3.18 ($0.106) | $3.07 ($0.093) | $5.38 ($0.117) | **$2.74 ($0.093)** |
| tool calls, 30 questions (median) | 207 (7) | 231 (7.5) | 405 (12) | 220 (7) |
| refused calls, all 36 | 24 | 34 | 7 | 0 |

A on 0.3.0 and B scored the same as in the first pass (27 and 22.5), so the scorer is steady. C called only tools
that read: its most used were `search-records` (70), `get-note-body` (32), `semantic-search-notes` (28) and
`list-tasks` (21).

Where they lost points:

- A 0.3.1: Q18 (CW: "20 won deals, $574,600" counts every won deal, not those since September), Q20 and Q24 (0: the
  note was not found), Q13 (the "Pilot scope" note missed), Q10, Q17 and Q23 (half, as 0.3.0).
- C: Q13 (0: "Brightline" not linked to Brightlane, as B), Q5 (the demo time missing), Q17 (CW: a total of 480,700,
  not 481,700). V9b (CW: "the conversion rise is not recorded", but it is in a note).

What the transcripts showed:

- **A's two runs differ by 2 points, and not from the code.** On Q18, Q20 and Q24 both versions made the same first
  calls. Then 0.3.0 filtered the won deals by close date and read every note with `api notes-list --all`, and 0.3.1
  stopped after the list and read notes by deal id, which found none. A reaches a note through raw `api` calls, and
  the agent finds a different path each time.
- **C searches notes by meaning and A by words.** C answered 5.5 of the 6 variants, the keyword forms too. A's
  `search all` found nothing for "discount" or "payment terms", and the agent then went to `api notes-list`.
- **A is the only one that found "Brightline".** B and C both missed the name with one wrong letter on Q13.
- **C is fast because it never retries.** A's agent wrote compound shell lines that its tool rules refused 24 times,
  then ran the parts one by one. C's MCP calls were never refused.

### A and B, 2026-11-23

Run of 2026-11-23, one run per question, scored in one blind pass by
[score.sh](../../agents/source-coverage/score.sh) with [score-rules.md](score-rules.md): a scorer agent per sheet,
which knew neither sheet's author. A also ran on attio-cli 0.2.2, published until that afternoon. Its sheet was
scored in the same pass.

| | A: `attio` 0.3.0 | B: kesslerio 1.7.0 | A on `attio` 0.2.2 |
| --- | --- | --- | --- |
| 30 read questions, scored blind | **27** | **22.5** | 27 |
| of them, the 11 that need a note | 11 | 9 | 11 |
| of them, the 19 that do not | 16 | 13.5 | 16 |
| confidently wrong | 1 (Q23) | 1 (Q17) | 1 (Q1) |
| variants, of 6 | 3 | 4 | 5 |
| time, 30 questions (median a question) | 1,072 s (35 s) | 1,267 s (28.5 s) | 1,213 s (38.5 s) |
| cost, 30 questions (median a question) | $3.07 ($0.093) | $5.38 ($0.117) | $3.39 ($0.110) |
| tool calls, 30 questions (median) | 231 (7.5) | 405 (12) | 243 (7.5) |
| refused calls, all 36 | 34 | 7 | 46 |

Every refused call was a compound shell line (a `for` loop, two commands in one line, a pipe into `python3`) or
B's agent trying the shell, which neither may use. The agent then ran the parts one by one. No run failed on the setup: transcripts were
read before scoring (A Q1, Q2, Q23, B Q1, Q2, Q5, Q30). B called no tool that writes: its 27 `batch_records` calls
were all `get`.

Where they lost points:

- A 0.3.0: Q5 (did not find the demo task), Q26 (the week's tasks without their deals), Q10 (only the Cyrillic
  Дмитрий Орлов), Q21 (Valencia not said), Q17 (no total), Q23 (CW: found the lost deal and its
  reason, then said there was no task to come back in March, but the task exists). Variants: all three keyword
  forms (V3b, V9b, V12b) failed.
- B: Q2 and Q26 (0 each: "tasks have no due date"), Q5 and Q19 (half, same reason), Q13 ("Brightline" not found),
  Q24 ("Datakraft" not found), Q23, Q10 (as A), Q14 (no record named), Q17 (CW: a total of 381,700, not 481,700).
- A 0.2.2: Q1 (CW: said no deal had a close date), Q23 (the bakery not found), Q10 and Q17 (as A 0.3.0).

### What the transcripts showed

- **B never sees a task's due date.** kesslerio's `get_record_details` for a task returns its text, status and
  linked records, but not `deadline_at`. Every question about overdue or this week's tasks failed on that.
- **B misses a name with one wrong letter.** "Brightline" and "Datakraft" found nothing, and the agent gave up.
  A answered both.
- **kesslerio 1.7.0 needs two fixes to run at its best.** Its `attio-discover generate-skill` fails with
  `ERR_MODULE_NOT_FOUND: fflate` until `fflate` is installed beside it, and its bundled `attio-mcp-usage` skill is not
  in the npm package. [b-setup.sh](b-setup.sh) does both.
- **A cannot read a company's description.** "пекарни в Казани" lives only there. `organizations list` returns no
  description, and `organizations show organization:19`, the ref `deals show` gives, answers `not_found`.
- **A's store holds only the companies and people on deals**: 113 companies and 180 people of the workspace's 166
  and 382. The first sync also left 3 people whose company was not stored yet (`crm.reference-unknown`).
- **attio-cli 0.2.2 counted "Won 🎉" as an open stage**, so won deals showed as open. 0.3.0 reads it as won by its
  title.
- **A's keyword questions failed** where its full sentences on the same facts passed: V3b "реселлер Валенсия
  условия", V9b and V12b. A searched the local store for the words, found no deal with them, and stopped before
  reading notes.

## What it showed

On this scope (an invented sales account of 123 deals and about 380 people in Attio, questions in the owner's
style, Claude Sonnet 5.5), an agent answered as many questions right through WireCat `attio` 0.4.0 as through Attio's
own MCP: 27.5 and 28 of 30, within the noise of one run. It took about as long (588 s and 477 s for 30 questions,
15.5 s and 15 s at the median) and cost the same ($2.74). It answered all 6 keyword variants. Before notes reached
its copy, `attio` took twice as long. Both beat kesslerio's server (23.5).

The decisions written before the run, against the best rival, C:

- **A is not 4 or more behind C on questions without a note** (16 and 16.5 against 18), so the comparison does not
  wait for a search fix.
- **A is not behind only on note questions.** A on 0.3.0 answered all 11, and A on 0.3.1 lost 2.5 of them. The
  notes went through raw `api` reads, which is why A's runs differed. "Notes in the store" was the first fix: 0.4.0
  answered all 11 and every keyword variant.
- **A and C are within 2** (27.5 and 28 on 0.4.0). So the page claims no accuracy lead over Attio's MCP. On 0.4.0
  time and cost are equal too. The attio page may say an agent answers as well, as fast and for the same cost
  through `attio` as through Attio's MCP on this data, finds a name with a typo that both MCP servers missed, and
  works on a local copy. It must not say better, faster or cheaper than Attio's MCP.
- **Confidently wrong: A 2 on 0.4.0, C 1 and 1 on a variant.** A's two are examined above: a Latin spelling of a
  Cyrillic name, and a closed day Attio does not keep. Neither is about notes.

### The first run, against B only

On this scope (an invented sales account of 123 deals and about 380 people in Attio, questions in the owner's
style, Claude Sonnet 5.5), an agent answered more questions right through WireCat `attio` than through kesslerio's
MCP server: 27 against 22.5 of 30. A difference of 4.5 is above the noise of one run, but most of it comes from one
gap in B (task due dates) and two typos. A was also cheaper: $3.07 against $5.38 for 30 questions, with about half
the tool calls. B's median answer was faster. Each had one confidently wrong answer.

The decisions written before the run, against B only. C's run above replaced them where they differ.

- **A is not behind B**, so neither the "fix search first" nor the "notes in the store" decision is triggered by B.
  A answered all 11 note questions, reading notes through `api`, live.
- **The difference is 4.5, not within 2**, so "equal on this synthetic data" does not hold against B. With this scope,
  the attio page may say an agent answered more sales questions right through `attio` than through kesslerio's MCP
  server, at about 60% of the cost.
- **Confidently wrong: 1 against 1.** A's Q23 is examined above (a task it did not look for).
- **For attio-cli, before C's run:** company descriptions (Q23), the `organizations show` ref that `deals show` gives,
  and a keyword question that should reach notes (V3b, V9b, V12b).

## C: the owner's steps

Attio's remote MCP signs in as an Attio user, through OAuth in the browser. Attio registers the client by itself
(its server lists a dynamic registration endpoint), so there is no client ID or secret to make. Only a person can
sign in. One sitting, about two minutes:

1. Run [bin/attio-mcp-connect](../../../bin/attio-mcp-connect) in a terminal (Ruby 3, and with rbenv and no global
   version, `RBENV_VERSION=3.4.8 bin/attio-mcp-connect`). It registers the server for the test's agent folder only
   (`~/.cache/wirecat-attio-agents/c/agent/.mcp.json`).
2. In that folder, start `claude`, type `/mcp`, pick `attio`, Authenticate, sign in to Attio, pick the workspace
   "WireCat" and allow. `/exit`.
3. `bin/attio-mcp-connect --check` says `Connected`. It may still say "Pending approval" after a good sign-in, when
   the folder's server was not approved at the start of `claude`. `run.mjs` passes `--mcp-config` and needs no approval,
   so a one-question `claude -p` with `--mcp-config` in that folder is the real check.

Then the run, by an agent or by hand: `node run.mjs c questions.md`, and the scoring with C's sheet beside A's and
B's.

## What was not measured

- Writes: the plan measures reads only.
- Search by meaning for A: `attio` builds no vectors of its own, so A searched words only, as it ships.
- A sign-in as an Attio user (OAuth) for B: A and B used the same workspace access token.
- Several owners and pipelines: the workspace has one member and Attio's one deal pipeline with four stages.
- A large workspace: about 120 deals favour live reads less than a few dozen but more than thousands.
- Run-to-run spread: one run per question and contestant.
- The owner's own reading of the questions: they were written in his style by agents and not yet approved by him.
