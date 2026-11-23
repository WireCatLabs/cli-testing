# Experiment B, rounds 12–14: search quality in `tg`, then agents again

Runs from 2026-11-19 to 2026-11-24 on a copy of one person's real Telegram store. This page has totals only. The
questions, the answer keys and the rows per question stay in the private `cli-private` repository.

## Why it was run

Experiment B asks one question. Can an agent that answers the owner's questions from Telegram with WireCat `tg` do no
worse than an agent that has a Telegram export and `grep`? The first rounds are in
[source-coverage](../../agents/source-coverage/README.md).

- In round 10, with agents on 10 questions, `tg` scored 5.33 of 10 and grep scored 6.5.
- Round 11 changed what one call returns. Each hit now shows its matching lines, and `--like` adds a made-up reply to
  the same search. `tg` then scored 7.17 against grep's 6.5, and 6.67 against 3.5 on 12 held-out questions.
- Some answers were still not shown at all, mostly in big groups.

Rounds 12 and 13 measured search alone, and round 14 put agents back. Each step answered one question and fed one
decision:

| Step | Question | Decision it fed |
| --- | --- | --- |
| Search ideas on the old set | Which change shows more answers, with no answer that search finds today getting worse? | What goes into cli-core #3153 |
| Fresh set | Do the gains hold on questions the changes were not tuned on? | Whether the changes are real or tuned to the test |
| Ideas from the fresh misses | What makes search lose the fresh answers, and can a small change fix it? | What goes into the next cli-core PR |
| Held-out set from a separate writer | Do those ideas hold on questions written by someone who never saw the search? | Best chunk goes to a PR, Latin variants are held |
| Round 14 with agents | Does the released search make the agent's answers better than grep's? | Where the next work goes: the agent's path, not ranking |

## Setup

- **Machine:** a laptop with an AMD Ryzen AI 9 HX 370 (24 threads) and 59 GB of RAM, Linux, Node 24.19, Python 3.14.
  `tg` ran one call at a time under a file lock, and a run paused when free memory fell under 8 GB.
- **Store:** one copy, read-only for the whole run. It has 10 chats (5 private dialogs and 5 groups, 4 of them big),
  954,027 messages and 220,180 conversation chunks. The SQLite file is 4.2 GB, with OpenAI `text-embedding-3-small`
  vectors at 768 dims.
- **Search builds:**
  - The idea tests used an experiment branch of cli-core (`exp/search-output`, never pushed). Each idea sat behind its
    own `WIRECAT_EXP_*` switch. The commits are `9863f346e` (rarity), `ff57bae77` (reply lines), `e84dc0bea` (generated
    questions), `15fd8cb63` (owner cap, best chunk, Latin variants), `80c18e9ff` (Latin variants for rare stems) and
    `6673cf7f2` (a second pass inside the leading chats).
  - A winner was then ported to a real PR with no switch. The PR build was checked on the store copy against the
    switch build, and the ranks matched.
  - The agent round used the released `@wirecat/tg-cli` 0.135.0, which ships `@wirecat/cli-core` 0.718.0.
- **Made-up replies** (the text that goes into `--like`): `gpt-5-nano` with minimal reasoning. It saw only the question,
  never a message ([hyde.py](hyde.py)). Each set cost under $0.001.
- **Pins:** every run sets the embedding model explicitly (see "Two incidents" below), runs `tg` with `--offline` and
  sets `DBUS_SESSION_BUS_ADDRESS=disabled:` on the `tg` call only.

### Three question sets

| Set | Size | Who wrote it | What it covers |
| --- | --- | --- | --- |
| Old | 30 | Earlier rounds | 17 older questions, mostly private dialogs, plus 13 newer ones from big groups where someone other than the owner wrote the answer. Every verdict since round 11 was made on this set. |
| Fresh | 15 | One agent wrote both the key and the questions, from random messages, without seeing the search | 8 big group, 5 private, 2 small group. The owner wrote 7 of the answers, and only 5 of the 15 questions reuse the answer's rare words. |
| Held-out | 20 | Answers drawn by [sample.py](sample.py) with a fixed seed. A separate writer agent saw only the message text and wrote the questions. | 8 big group, 6 private dialog, 6 in huge conversations (more than 50 chunks). The owner wrote 7. The forms follow [AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md): sentences, keywords, dictation, mixed language, misspelt names. |

### Measures and the guard bar

- **Two modes per question:** "as asked" is the question alone. "With a reply" adds a made-up reply.
- **Shown:** the answer message is among the lines that `tg` prints. **Main rank:** the place of the hit that holds the
  answer. **Median time** per search.
- **Guards:** a question that search already finds is a guard. A guard must not leave the top 5 or the top 20, or lose
  more than 2 places. One loss over that bar rejects the idea.
- **Stages:** each idea first ran on the 2 questions it should help most. If it helped, it ran on 5 more, at least 3
  of them guards. Only then did it run on all the questions in both modes. Agents tested different idea families in
  parallel. Each had a cost cap of $1.

### Commands

The scripts read the store copy, never a live account. Every path is a parameter, and the questions file stays private.

```sh
# one batch: rep "s1", the shipped build against best chunk, every question in both modes
python3 -I batch.py --store "$STORE" --tg "$TG_EXP/dist/bin/tg.js" --config "$TG_CONFIG" --profile "$PROFILE" \
  --questions held.json --out "$RUN/held" --flag reply s1 H1:RL1:asked H1:BC2:asked H1:RL1:reply H1:BC2:reply
python3 -I compare.py "$RUN/held/rows.jsonl" s1:RL1 s1:BC2

# a new set: walk one stratum's random order, then have a separate writer turn the kept messages into questions
python3 -I sample.py --db "$STORE/wirecat.db" --big "$BIG_IDS" --private "$DIALOG_IDS" --seed 20261124 \
  --exclude fresh.json huge-other 0 20
OPENAI_API_KEY=... python3 -I hyde.py held.json "$RUN/held/hyde-cost.json"

# the agent round: tg, then grep, per question
python3 -I run.py --harness "$CLI_TESTING_PR378/performance/agents/source-coverage" --skill "$TG_0135/skills/tg-cli" \
  --wrapper-dir "$RUN/bin" --store "$STORE" --export "$EXPORT" --questions held.json --out "$RUN/agents" H1 H2 H3
python3 -I sheets.py "$RUN/agents/run" "$RUN/agents" 20
```

| Script | What it does |
| --- | --- |
| [batch.py](batch.py) | One `tg search conversations --json` per question, arm and mode. It records the main rank, the owner-block rank, the rank of the first hit whose lines show the answer, the time and the output size. Each round ran its own copy, and the copies differed only in arms, question files and the reply flag. This one holds every arm. |
| [compare.py](compare.py) | Totals per arm and mode, and every row where an arm moves 2 or more places from the baseline |
| [sample.py](sample.py) | Random messages per stratum with a fixed seed, for a new set |
| [hyde.py](hyde.py) | The made-up replies |
| [run.py](run.py) | The agent round: one question per session, tg first, then grep. It records time, calls, budget, cost, skill use and `--like` use. |
| [tg-wrapper.py](tg-wrapper.py) | The `tg` the agent sees: the released build on the store copy, `--offline`, the model pinned, every call logged |
| [sheets.py](sheets.py) | Answer sheets from the transcripts, for blind scoring |
| [score-rules.txt](score-rules.txt) | The one scoring rule for both contestants |

`run.py` drives `ask.sh`, `budget.py` and `score.sh` from
[cli-testing PR #378](https://github.com/WireCatLabs/cli-testing/pull/378) (commit `25cc846`), which is not merged yet.
Only the `NEW` and `PR` arms of `batch.py` run on a public build. The other arms need the experiment branch.

### Two incidents changed how we test

- **A disk cleanup wiped the run folder.** The owner restored it from a backup. Some files were rebuilt from session
  logs.
- **One baseline used the wrong model.** The embedding model was not set explicitly, so `tg` fell back to a local model
  that has no vectors for the big groups. "Shown" fell from 20 to 11. Every run now pins the model. After the fix, the
  new baseline matched the numbers from before the wipe on all 60 runs.

## Results

### Search changes on the old set (30 questions × 2 modes)

Each line adds to the line before. One run per build. Repeat runs of the same build gave the same ranks.

| Build | Shown, as asked | Shown, with reply | Main top 20, as asked / with reply | Median time, as asked / with reply |
| --- | --- | --- | --- | --- |
| After round 11's batch | 19 of 30 | 19 of 30 | not measured on this base | — |
| + batch 2: big groups, next line, owner refill, question words | 20 | 22 | 17 / 20 | 5.1 s / 6.8 s |
| + words ranked by rarity inside each chat | 23 | 23 | 20 / 21 | 2.4 s / 4.25 s |
| + a reply from outside the chunk as one more line | 24 | 24 | 20 / 21 | 2.8 s / 4.4 s |

No guard lost more than 2 places at any step.

### What shipped

These changes are in `@wirecat/cli-core` 0.718.0 ([#3153](https://github.com/WireCatLabs/cli-core/pull/3153) and
[#3194](https://github.com/WireCatLabs/cli-core/pull/3194)). `tg-cli` takes them in
[#915](https://github.com/WireCatLabs/tg-cli/pull/915), released as 0.135.0.

1. **Big groups get more places.** A big group can now give up to 100 conversations to a search across chats. Its
   places after the 20th go to the end of the list, so private dialogs keep their places in the top 20.
2. **The line after the question.** When a hit's best line matches the question's words, the next message is shown
   too. The answer is often in it.
3. **The owner block refills.** When the question names a chat, the owner's messages from the other chats used to be
   lost. They come back now.
4. **Question words weigh more in hit lines.** The lines shown for a hit are picked mainly by the question's words.
5. **Rare words rank first.** Inside each chat, a word hit is scored by how rare its query words are in the store,
   plus a little of the old bm25 score. Before, a frequent word with many word forms let short, empty messages win.
   This was the biggest gain: +3 shown and +3 in the top 20. On the old set it also halved the search time.
6. **A reply from outside the chunk.** When someone replied to a hit's message outside the chunk, that reply is shown
   as one more line, at most 1 per hit. It found one more answer and moved nothing else.
7. **Cold searches are faster** (#3194). A meaning search on a store that is not in memory took 33 s, now 15 s. No
   answer moved on 44 checks.

### Still in review

- **The best chunk of a huge conversation**, with a made-up reply only:
  [cli-core #3213](https://github.com/WireCatLabs/cli-core/pull/3213), open.
- **Usage errors that name the right command:** [cli-core #3222](https://github.com/WireCatLabs/cli-core/pull/3222),
  open.
- **A skill that says where `from:me` and the chat go:** [tg-cli #920](https://github.com/WireCatLabs/tg-cli/pull/920),
  open.

The agent round below ran on 0.135.0, before all three of these.

### What we dropped

| Idea | Why it was dropped |
| --- | --- |
| A cap on how far the made-up reply pushes the question's own hits | two questions lost 6–8 places |
| A big group's full 100 places, with no tail | private dialogs fell out of the top 20 |
| Pure rarity, or rarity and bm25 fused | a guard lost 3 places |
| Rarity across chats instead of inside each chat | private dialogs were pushed out of the list |
| Rarity alternating with today's order | found the target in one mode only, two guards lost 1 place, 30–90 % slower |
| A per-chat word cap of 100 instead of 20 | no gain |
| A boost for a person or a chat named in the question | reached no miss, or lifted one question and dropped another |
| A boost by forum topic or for conversations with replies | no gain |
| Fields that search does not read (attachments, links, mentions) | mostly empty, reached no miss |
| Markup before search: chunk context, keywords in two languages | the target questions did not move |
| Markup: generated questions per chunk, over the full store ($7.76) | see the next section |
| Owner block with at most 1–2 places per chat | the answer is in the same big dialog that fills the block |
| Latin spelling of Cyrillic word stems | two guards broke |
| Latin spelling for rare stems only (500 messages or fewer) | no loss, but it gained only on the set the cutoff was chosen on |
| A second search inside the 3 leading chats | +2 answers, both past the top 20, and the median time doubled (7.5 s → 14.3 s) |
| A chat's share set by its score gap | no target moved. Even a search inside the answer's own chat missed them. |

### The $7.76 markup lesson

A cheap model wrote the questions that each chunk answers. On a sample of 1,000–2,000 chunks, this lifted one missed
question to about 17th in its chat, and no guard broke. The owner approved the full store. The run took 5.1 hours
and $7.76, and it wrote 610 thousand questions for 93 % of the chunks.

On the full store, the missed question stayed missed. Its conversation ranks 194th inside its chat, and the per-chat
share keeps 20. One guard fell from 3rd to 20th. At half the weight, it still fell to 13th.

**Interpretation:** part of the sample's win came from one lucky round of question writing. Before you pay for a
change on the full store, draw a second sample.

### Fresh set (15 questions × 2 modes)

The build from before rounds 12–13 against the shipped build. Each row counts questions out of 15.

| Mode | Shown, before → now | Shown in top 5 | Median time, interleaved |
| --- | --- | --- | --- |
| As asked | 6 → 8 | 3 → 4 | 3.4 s → 3.3 s |
| With a reply | 8 → 10 | 3 → 4 | 8.8 s → 9.0 s |

- **The gains hold, but they are smaller.** 9 question-mode pairs moved up by more than 2 places. 2 moved down by 4–5
  places, and the old bar would count those as losses.
- **The fresh set is much harder.** 10 of 15 shown, against 24 of 30 on the old set. Neither build finds 5 of the 15.
- **The owner block showed none of the 5 answers the owner wrote in private dialogs.** Its 5 places mostly go to the
  largest dialog.
- **Time did not change on this set.** The first run made the new build look slower (12.3 s → 17.9 s with a reply).
  But that run tested one build after the other, so the machine drifted between them. In an interleaved rerun, the
  ranks did not change and the time was flat. The 2× speed-up holds on the old set only.
- **Where the misses are lost:** the owner block has too few places. In a conversation of 373 chunks, the right
  conversation is found but another chunk is shown. A place name is written in Latin letters in the message and in
  Cyrillic in the question. Two answers are far from the question in meaning and share no words with it.

### Held-out set (20 questions × 2 modes)

Three ideas came from the fresh misses. The owner-block cap stopped at the first stage. The other two went through
2 → 5 → all 45 questions of the old and fresh sets, and then through this set. Four builds ran interleaved, 160 calls.

| Build | Shown, as asked | Shown, with reply | Top 5, with reply | Median time, as asked / with reply |
| --- | --- | --- | --- | --- |
| Shipped (0.718.0 behaviour) | 14 of 20 | 9 of 20 | 7 | 3.9 s / 8.1 s |
| + best chunk of a huge conversation | 14 | 10 | 8 | 3.4 s / 8.2 s |
| + Latin variants of rare stems | 14 | 9 | 7 | 3.8 s / 9.0 s |

- **Best chunk** found one more answer here, and none was lost. Across the three sets, it found 3 answers that were
  missing and lost none. Without a reply it changes nothing. A form that also ran without a reply broke a guard at
  stage 2.
- **Latin variants** neither gained nor lost here. They gained only on the set where the cutoff was chosen, so they
  are on hold.
- **Observed:** on this set, the made-up reply hurt. The shipped build shows 14 of 20 as asked, but only 9 of 20 with a
  reply. On the old and fresh sets, the reply helped or tied. The agent round below used `--like` in 12 of 20
  sessions.
- **Lesson:** a set written by someone who never saw the search separated a real gain (best chunk) from a tuned one
  (Latin variants). Every candidate now needs such a set before it ships.

### Round 14: agents on the released search (20 held-out questions)

The thresholds were written before the run. If `tg` led by 2 points or more, the round-11 lead holds. A gap within 2
points is a tie at this size. If grep led by 2 or more, it is a regression.

- **Contestants:** `tg` 0.135.0 on the store copy, with its own skill installed. Grep had a Telegram Desktop export of
  the same 10 chats (324 MB of JSON) and Read, Grep, Glob, `grep`, `jq` and `ls`.
- **Both:** Claude Sonnet 5.5, one question per session, a budget of 60 s and 10 tool calls, one run each. `tg` ran
  first, then grep, for each question.
- **Scoring:** two blind scorers ([score-rules.txt](score-rules.txt)). 1 point = the fact with its chat and date. 0.5 =
  the fact without a source, or with a wrong date. 0 = not found or wrong.

| | `tg` 0.135.0 | grep over the export |
| --- | --- | --- |
| Score of 20 (scorer 1 / scorer 2, mean) | 16 / 16, **16.0** | 15 / 14.5, **14.75** |
| Answers with fact and source | 16 | 14–15 |
| Confidently wrong | 0–1 | 1 |
| Out of budget | 0 of 20 | 3 of 20 |
| Median time a question | 16.7 s | 13.1 s |
| Median tool calls | 3 | 5 |
| Agent cost | $2.59 | $2.21 |

Scoring took 4 sessions, about $1–2, which was estimated, not logged. The whole round cost about $6–7, under its $15
cap.

- **A tie.** `tg` led by 1.25 points of 20, inside the 2-point band.
- **Against round 11, on different sets:** `tg` went from 0.56 of the set to 0.80, and grep from 0.29 to 0.74. This set
  is easier for both, so the rise is not evidence for the search changes. The lead shrank from 0.27 to 0.06.
- **Speed:** in round 11, `tg` had a median of 26 s and 3 of 12 sessions over budget. Now it has 16.7 s and 0 of 20.
  Grep now has the over-budget sessions.
- **`tg` lost 3 questions that grep won.** The answer never appeared in `tg`'s output. In two of them, the search did
  not show the answer, and both questions ask for a judgement on top of the fact. In the third, the agent did not use
  `--like`, and 2 of its 4 calls were usage errors.
- **Grep lost 4 questions that `tg` won:** two in big groups and two in huge conversations. Two of the four ran out of
  calls. Both contestants missed one question.

### The skill finding

We read the `tg` calls of all 20 sessions.

- **11 of 51 `tg` calls were usage errors.** 4 put `from:me` in the wrong place for that search command. 3 passed the
  chat as a flag that does not exist. The rest were single cases.
- **8 of 20 sessions never opened the skill.** Without the skill, the agent sees only the short description. That
  description did not name `--like` or the way to read the messages around a hit. `--like` was used in exactly the
  12 sessions that opened the skill.
- **The fixes:** tg-cli #920 makes the description ask the agent to read the skill, and it names `--like` and
  `messages context`. cli-core #3222 makes a usage error name the command that takes the flag. Neither has been checked
  with agents yet.

### The per-chat share is not the main limit

The answers that are still missed in big groups rank 100th to 200th inside their own chat. The most generous share,
and even a search inside the answer's own chat, did not find two of them. Three share no meaningful word with the
question. **Interpretation:** these answers are far from the question both in meaning and in words. A second search by
the agent, in other words, can reach them. A ranking change cannot.

## What it showed

1. **The word half was the weak part, not the meaning half.** Ranking words by rarity gave more than every tweak to the
   meaning search together, and it made search faster on the old set. **Observed.**
2. **Ideas that only show more lines are safe.** Lines do not change the order of hits, so they cannot hurt a guard.
   Ideas that change the order broke private dialogs most often, because private dialogs hold the most guards.
   **Observed.**
3. **A set you tune on cannot tell you whether the tuning is real.** The fresh set shrank the gains. The held-out set,
   written by a separate writer, kept one idea and held the other. **Observed.**
4. **A paid sample result needs a second draw.** The $7.76 markup reversed its sample win. **Observed.**
5. **Pin everything a test depends on.** The wrong-model baseline would have rejected good ideas. **Observed.**
6. **With agents, the gap is now in the agent's path, not in ranking.** `tg` and grep tie. `tg` is inside the budget
   every time, and its losses come from the skill not being read and from usage errors. **Interpretation**, from one
   run.

## What was not measured

- **One store, one owner, one run per build and per contestant.** At 20 questions, 1–2 answers are noise.
- **A 1-place move is noise.** The baseline build itself moved 1 place on 2 rows between runs.
- **The agent round does not isolate the search changes.** Round 11's build was not rerun on this set.
- **The agent round departs from [AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md) in these ways:**
  - no third agent added errors to the questions;
  - the owner did not vet the questions;
  - the held-out set had been used once before, for the check of two search ideas;
  - the scoring was not fully blind, because `tg` answers carry `msg:` references and grep answers carry file paths;
  - the scoring cost was estimated, not logged;
  - one run per contestant.
- **The answer keys know only the answer message and its neighbours.** The same fact elsewhere in the store counts as a
  miss, so the ranks can understate a hit.
- **Time** was measured with the store in memory, except in the cold-start check.
- **The data is 10 chats, not the whole account.** The export had every message of those chats.
- **Not checked with agents:** best chunk, the skill fix and the usage-error hints.
