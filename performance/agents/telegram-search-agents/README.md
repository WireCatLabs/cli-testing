# Telegram search: can an agent find the owner's own messages?

## Why it was run

The first post of the series, [memory for agents](https://wirecat.dev/ru/blog/memory-for-agents-benchmark), compared
memory engines on synthetic English data, and plain files did as well as any engine. Its list of what was not measured
named real data and the Russian language. This round measures both, on one question: **on a real Telegram archive,
with questions asked the way the owner really asks them, does WireCat `tg` let an agent find the right message better
than the tools people really use for Telegram?**

The answer decides what post 2 of the series may claim for `tg`: that it is the best of these tools for an agent, that
it ties, or that it is behind.

It runs in two layers:

1. **Search alone.** The question as typed, one search call, no agent. Where is the answer message in the results?
2. **An agent with each tool.** Claude Haiku and Claude Sonnet get one tool each and answer the question. Two blind
   judges score the answers.

## Scope: real data, totals only

- **The data is the owner's own Telegram archive**: 954,242 messages in 376 chats. The answers are in the 10 largest
  chats, which hold 96% of the text (188 of 195 MB).
- **Only Anthropic models saw the data** (agents and judges), because it is private. The OpenAI embedding API saw the
  question text, for `tg`'s search by meaning; the messages stayed on the machine.
- **This page holds totals only.** The questions, the key, the answers, the messages, chat names and every per-question
  row stay in the owner's private run folder. Others cannot rerun this on the same data: the scripts are here, the data
  is not. They can run the same scripts on their own archive.
- **The scope favours grep and plain files**: one account, 10 answer chats, one messenger.

## Short answer

- **Against the tools people use for Telegram, `tg` is far ahead.** jackwener/tg-cli found 0 of 65 answers with the
  question as typed and Telegram's own search 1 of 65. With an agent, jackwener is 6 to 8 questions of 20 behind `tg`.
- **qmd with its skill ties with `tg` with its skill.** Over 3 runs: Sonnet 16.4 against 15.7, Haiku 14.5 against 13.25
  of 20. Both gaps are inside the run-to-run spread.
- **The pre-registered threshold:** with Sonnet `tg` is "no worse" (0.75 behind the best). With Haiku it is 1.25 behind
  qmd with its skill, 0.25 over the 1-question bar, so formally not "no worse", but inside the spread of the runs.
  "Better" (2 or more ahead) was not reached with either model.
- **grep over a Markdown export is the ceiling, not a rival.** Nobody keeps Telegram as one Markdown file per chat and
  day. Over 3 runs `tg` with its skill reaches it: Sonnet 15.7 against 15.8, Haiku 13.25 against 12.25.
- **The skill matters.** In the first run no agent opened the `tg` or qmd skill (0 of 40 sessions each). With the skill
  installed in the agent's project, Sonnet with `tg` gained about 2 questions and Sonnet with qmd about 4.

## Questions

- **65 questions**, each with one answer message (plus messages that also count) written down before any run.
- **Written the way the owner asks** when he searches: no chat named, often fragments or a long unsure sentence, the
  style taken from his real prompts, as [AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md) asks.
- **3 groups:**
  - **30 old questions.** `tg` was tuned on them in earlier rounds, so they favour `tg`.
  - **15 fresh questions**, written after that tuning.
  - **20 held-out questions**, kept away from the tuning. Layer 2 uses only these 20.
- **The owner read the questions** before the runs.
- **Departures from AGENT-TESTS.md** (as in round 14, which first used the held-out set): no third agent added typos,
  and the 20 held-out questions were used twice before (a held-out check of round 13 and round 14 of [Experiment B](../../search/experiment-b-rounds-12-14/README.md)).

## Setup

### Machine

AMD Ryzen AI 9 HX 370 (24 threads), 59 GB RAM, no GPU used. The machine was shared with other agents during every
stage (load average 12 to 45), so the seconds are rough and compare only loosely.

### Contestants

| Contestant | Version | What it searches |
| --- | --- | --- |
| WireCat `tg` | `@wirecat/tg-cli` 0.135.0 (cli-core 0.718.0), as released | a throwaway copy of the store; words and meaning (OpenAI `text-embedding-3-small`, 768 dims); returns a conversation chunk, median 1 message |
| [jackwener/tg-cli](https://github.com/jackwener/tg-cli) | `kabi-tg-cli` 0.6.0 (source read at `b54a14d`) | its own SQLite, filled from the same store with its own schema; `LIKE '%text%'`, newest first; returns messages |
| [qmd](https://github.com/tobi/qmd) | `@tobilu/qmd` 2.9.0, CPU only, default models (EmbeddingGemma 300M, Qwen3 reranker 0.6B, its 1.7B query expansion) | one Markdown file per chat and UTC day: 13,859 files, 908,521 non-empty messages, 220 MB; returns files |
| Telegram's own search | `messages.searchGlobal` through `tg` 0.135.0 `--backend server` | the live account; layer 1 only, at most 130 calls, 2 s apart |
| SQLite FTS5 | SQLite 3.46.1, `unicode61 remove_diacritics 2`, ranked by `bm25` | the message text; layer 1 only, as a plain baseline |
| grep + Read (ceiling) | GNU grep and Claude Code's Read | the same Markdown files as qmd; layer 2 only |

Every contestant was fed from the same store copy. qmd indexed the whole archive, not a subset: the answer chats hold
188 of 195 MB, so a subset would not save anything. Its index took about 10 hours on this loaded machine.

### Layer 1: search alone

- The question as typed, one call, no agent. Node 24.19.0, Python 3.14.2 (runners), 3.13.5 (jackwener).
- **Top 5 / top 20** = the answer is at that rank or better. **Shown** = the answer is anywhere in the default list
  (jackwener and FTS5: 50; qmd: its 20; `tg`: any returned item holds the answer's text).
- A qmd hit is weaker than a message hit: it is a whole chat-day file, a median of 52 messages for the files that hold
  an answer, and the reader still has to find the message in it.
- jackwener cannot match a whole question (a sentence is never a substring of one message), so it also ran with one
  word: the question's rarest word (fewest matches), and the best word over all of them. The best word looks at the
  answer, so it is an upper bound, not a user. Each form also ran with words cut to their first 5 letters, because
  Russian endings change. Its `--regex` reads only the newest 500 messages and its `filter` only recent ones, so
  neither reaches an archive.

### Layer 2: an agent with each tool

- **Agent:** Claude Code 2.1.331, headless, models `claude-haiku-5-5` and `claude-sonnet-5-5`, one question per session.
- **Budget, the same for every arm:** 10 tool calls and 600 s a session. One `qmd query` call takes 90 to 175 s on this
  CPU, so the 60 s of earlier rounds was too short.
- **Prompt:** one access line per arm, then the same rules for all
  ([run.py](scripts/p2/layer2/run.py), `RULES` and `ARMS`): give the chat and date of the answer message, say "not
  found" rather than guess, one command per call, no scripts.
- **Tools:** `Bash` and `Read` only, `--permission-mode dontAsk`, only the arm's own command approved. A wrapper per arm
  allows only read commands: [bin-tg/tg](scripts/p2/layer2/bin-tg/tg) (always `--offline`, refuses `--backend server`,
  `--sync-first` and `--yes`), [bin-jw/tg](scripts/p2/layer2/bin-jw/tg) (no command that connects to Telegram),
  [bin-qmd/qmd](scripts/p2/layer2/bin-qmd/qmd). The grep arm has no wrapper; `Read` is limited to the Markdown folder.
- **Arms:** `tg`, jackwener, qmd and grep. After the first run, `tg` and qmd also ran **with their own skill** (the one
  each release ships) copied into the agent's project, because no agent had opened the skill through `skill show`.
  The skill arms load project settings instead of `--safe-mode`, which hides project skills.
- **qmd's skill teaches multi-line queries** (`$'intent: …\nlex: …'`), which `dontAsk` denies even under `Bash(qmd:*)`.
  A hook ([allow_one_command.py](scripts/p2/layer2/hooks/allow_one_command.py)) allows one plain call of the arm's
  command with no pipe, separator or substitution outside quotes. The first qmd-with-skill run, before the hook, is
  not scored: Sonnet's skill-style queries were denied and it fell back to word search.
- **Repeats:** `tg` with its skill, qmd with its skill and grep ran 3 times with both models
  ([repeat.sh](scripts/p2/layer2/repeat.sh)). The other arms ran once.
- **Checked on the first run's 160 sessions and the `tg` + skill arm:** every init event lists the same tools, no MCP
  server, no extra skill (except the skill arm) and the same plugin entries. Every `tg`, jackwener and qmd call went
  through its wrapper (a call log per session). No session read a path outside its arm's data, apart from Claude Code's
  own files for a long tool output. No tool result held a key or answer marker. The qmd + skill arm and the repeats
  were not audited the same way.

### Judges

- Claude Sonnet 5.5, one session per answer sheet, in a folder that holds only the key and that sheet
  ([score.py](scripts/p2/layer2/score.py)). Each sheet gets a random letter; the letter key stays outside every judge
  folder.
- Rubric: [score-rules.txt](../../search/experiment-b-rounds-12-14/score-rules.txt) of round 14, byte for byte. 1 point
  for the right fact with its source, 0.5 for part of it, 0 otherwise.
- **Two judges per run** (two separate scorings of the same sheets). A question's score is the mean of the two, then
  the mean over runs ([stats.py](scripts/p2/layer2/stats.py)).
- The 95% intervals resample the 20 questions (bootstrap, 10,000 draws, seed 20261126, the same draws for every arm).
  The paired difference compares an arm with `tg` + skill on the same draws.

### Pre-registered threshold

Written before layer 2 ran: `tg` is **"no worse"** if, with each model, it is at most 1 question of 20 behind the best
contestant, and **"better"** if it leads by 2 or more. grep is a reference point, not a contestant. The skill arms were
added after the first run, under AGENT-TESTS.md's rule "every contestant at its best"; the threshold was applied to them
unchanged.

## Results

### Layer 1: one search, no agent (65 questions)

| Contestant / mode | Top 5 | Top 20 | Shown | Median s |
| --- | ---: | ---: | ---: | ---: |
| WireCat `tg` search conversations | 24 | 42 | 46 | 5.8 |
| qmd query (expansion, words + vectors, rerank) | 29 | 33 | 33 | 122 |
| SQLite FTS5 bm25, any word | 16 | 18 | 19 | 0.4 |
| SQLite FTS5, all words | 0 | 0 | 0 | 0.0 |
| qmd search (BM25, every word) | 2 | 2 | 2 | 0.4 |
| Telegram search, question words | 1 | 1 | 1 | 3.5 |
| Telegram search, rarest word (63 questions, call cap) | 1 | 1 | 1 | 21.0 |
| jackwener, question as typed | 0 | 0 | 0 | 1.9 |
| jackwener, rarest whole word | 4 | 5 | 6 | 1.9 |
| jackwener, rarest 5-letter stem | 4 | 5 | 6 | 2.1 |
| jackwener, best whole word (looks at the answer) | 6 | 9 | 17 | — |
| jackwener, best 5-letter stem (looks at the answer) | 4 | 9 | 12 | — |

By group, top 5 / top 20:

| Contestant | Old 30 | Fresh 15 | Held-out 20 |
| --- | --- | --- | --- |
| `tg` | 12 / 20 | 4 / 8 | 8 / 14 |
| qmd query | 11 / 14 | 10 / 11 | 8 / 8 |
| FTS5, any word | 2 / 2 | 4 / 4 | 10 / 12 |

Telegram's search rows are `tg`'s order of what Telegram returned, after `tg`'s own strict local filter, not
Telegram's raw order. Telegram returned hits for only 2 questions with the question's words: it wants every word in one
message.

### Layer 2, first run: every arm (20 held-out questions)

Score of 20, mean of two judges, with the 95% interval over questions. One run per arm.

| Arm | Haiku | Sonnet |
| --- | --- | --- |
| WireCat `tg` | 12.75 (8.50–16.75) | 14.00 (10.00–17.75) |
| WireCat `tg` + its skill | 13.75 (9.75–17.25) | 16.00 (12.00–19.00) |
| qmd | 14.00 (10.00–18.00) | 12.75 (8.75–16.75) |
| qmd + its skill | 16.25 (12.50–19.25) | 16.50 (13.25–19.25) |
| jackwener/tg-cli * | 5.0 | 8.25 |
| grep + Read over Markdown (ceiling) | 14.00 (10.00–18.00) | 17.75 (14.75–20.00) |

\* jackwener was scored in the first judge pass only, before the skill arms existed; the other rows come from a later
pass that rescored all 10 sheets together. In that first pass the four first arms scored: Haiku `tg` 12.75, qmd 13.5,
grep 13.5; Sonnet `tg` 14.75, qmd 13.0, grep 17.75.

Session totals of the first run (from the runs, not from the judges):

| Arm | Model | Out of budget | Median s | Median tokens | Median tool calls |
| --- | --- | ---: | ---: | ---: | ---: |
| `tg` | Haiku | 0 | 49 | 68,527 | 4 |
| `tg` + skill | Haiku | 0 | 42 | 96,610 | 3 |
| qmd | Haiku | 1 | 60 | 60,479 | 4.5 |
| qmd + skill | Haiku | 2 | 100 | 93,955 | 4 |
| jackwener | Haiku | 7 | 33 | 120,469 | 10 |
| grep | Haiku | 4 | 17 | 92,041 | 5 |
| `tg` | Sonnet | 1 | 39 | 78,399 | 4.5 |
| `tg` + skill | Sonnet | 0 | 27 | 91,108 | 3.5 |
| qmd | Sonnet | 3 | 16 | 38,559 | 3.5 |
| qmd + skill | Sonnet | 1 | 22 | 79,189 | 3 |
| jackwener | Sonnet | 6 | 33 | 109,622 | 10 |
| grep | Sonnet | 1 | 12 | 54,487 | 4 |

The arms ran at different hours under different load, so the seconds compare loosely. A `qmd query` call that runs over
2 minutes goes to the background in Claude Code, and the agent waits for it.

### Layer 2, 3 runs: the main arms

| Model | Arm | Mean of 3 runs | Worst – best run | 95% interval | vs `tg` + skill (paired) |
| --- | --- | ---: | --- | --- | --- |
| Haiku | `tg` + skill | 13.25 | 12.50 – 13.75 | 9.92–16.33 | |
| Haiku | qmd + skill | 14.50 | 12.00 – 16.25 | 11.42–17.17 | +1.25 (−1.42…+3.75) |
| Haiku | grep (ceiling) | 12.25 | 9.00 – 14.00 | 9.17–15.33 | −1.00 (−4.42…+2.33) |
| Sonnet | `tg` + skill | 15.67 | 15.00 – 16.00 | 12.33–18.67 | |
| Sonnet | qmd + skill | 16.42 | 15.75 – 17.00 | 13.42–19.00 | +0.75 (−1.50…+2.75) |
| Sonnet | grep (ceiling) | 15.83 | 14.75 – 17.75 | 13.75–17.75 | +0.17 (−3.33…+3.83) |

Every paired interval crosses 0.

### Verdict against the threshold

| Model | Best contestant | `tg` + skill | Gap | Reading |
| --- | --- | ---: | ---: | --- |
| Sonnet | qmd + skill, 16.42 | 15.67 | −0.75 | "no worse" |
| Haiku | qmd + skill, 14.50 | 13.25 | −1.25 | not "no worse" by 0.25; inside the run spread |

"Better" was not reached with either model. In the first run, `tg` without its skill against qmd without its skill
reads two ways. By the first judge pass it was "no worse" with both models (Haiku 0.75 behind qmd, Sonnet 1.75
ahead). By the later rescoring of all sheets it was 1.25 behind qmd with Haiku (not "no worse" by 0.25) and 1.25 ahead
with Sonnet.

### Judge agreement

| Run | Sheets | Same score per question | Mean / max difference of a sheet's total |
| --- | ---: | --- | --- |
| 1 | 10 | 190 of 200 (95.0%) | 0.45 / 1 |
| 2 | 6 | 116 of 120 (96.7%) | 0.42 / 2 |
| 3 | 6 | 116 of 120 (96.7%) | 0.42 / 1.5 |

Both judges are the same model (Sonnet 5.5) with the same rubric, so this measures how stable a rescoring is, not how
far independent raters agree. In 3 of the 44 scored sheets a judge's own `TOTAL` line did not match the sum of its
per-question scores (off by 1 each); `stats.py` uses the per-question scores.

## What it showed

- **The tools people use for Telegram do not find these messages.** jackwener's substring search never matches a
  sentence, and one word returns its newest 50 matches while the answers are older. Telegram's own search wants every
  word in one message. With an agent, jackwener ran out of its 10 calls in 6 to 7 of 20 sessions, trying word after
  word.
- **On search alone, `tg` leads on the whole set** (42 of 65 in the top 20), and qmd puts more answers in the top 5 (29
  against 24). On the fairer sets `tg` is less far ahead: on the 20 held-out questions `tg` and qmd both have 8 in the
  top 5 and plain FTS5 has 10. On the 15 fresh questions qmd is clearly better (10 against 4 in the top 5); the reason
  is not known yet. The old 30 favour `tg`, which was tuned on them.
- **"All words" search fails on real questions.** FTS5 with every word found 0 of 65, qmd's BM25 (also every word) 2.
  Any word: FTS5 found 16 in the top 5.
- **The skill is the difference that matters most.** With the skill in the project, Sonnet opened it in every `tg`
  session (60 of 60 over 3 runs) and Haiku in 33 of 60. `--like` (search by a likely answer) was used in exactly the sessions that
  opened the skill. With Sonnet, all 3 skill runs scored above the run without the skill (+1.7 on average). qmd's skill
  gave Sonnet about 4 questions: it then writes qmd's structured queries (intent, words, meaning) instead of plain
  words. Haiku almost never opened qmd's skill (3 of 60 sessions), so for Haiku that arm is in effect qmd without a
  skill.
- **Runs spread by 1 to 5 questions.** Haiku with qmd + skill scored 16.25, 12 and 15.25 on the same setup; Haiku with
  grep 9 to 14. `tg` + skill is the steadiest, about 1 question between runs. A gap of 1 or 2 questions of 20 between
  arms is a tie.
- **grep as the ceiling.** In the first run Sonnet with grep scored 17.75, 1.25 above the best other arm (qmd + skill,
  16.50) and 3 or more above the arms without a skill. Its two repeats gave 14.75 and 15, so the first run was lucky. Over 3 runs `tg` + skill is within 0.2 of it with Sonnet and 1 ahead with Haiku.
- **Where `tg` + skill lost to grep** (first run, Sonnet: 4 questions; it won 3 others), three causes, from reading
  the transcripts (interpretation):
  1. The message uses a word with the same root, a compound or a synonym. grep matches part of a word with a pattern;
     the agent with `tg` tries whole word forms.
  2. The agent puts words from the question into the query that are not in the message, and "all words" returns
     nothing.
  3. Search by meaning finds a similar, newer discussion, and the agent stops there without checking the details.
  The first two are fixes for `tg` (relax an empty all-words query on its own, and say so). The third is for the skill
  (tell the agent to check the hit against the question). None of these is measured yet.
- **qmd's cost of entry.** qmd needs the chats exported to files and indexed, about 10 hours here. A query by meaning
  takes about 1.5 to 2 minutes on CPU, because each CLI call loads three models again, and it returns a whole chat-day.

## Costs

The agents and judges ran on a subscription; the figures are list prices. The first run: 172 agent sessions $5.39
and 24 judge sessions about $1.6. The `tg` + skill arm: $2.76 and $1.15 for its judges. The whole round, both layers,
first run, skill arms and repeats: about $27, mostly agents. `tg`'s question embeddings cost under $0.01.

## Not measured

- **Repeats of the other arms.** `tg` and qmd without a skill and jackwener ran once.
- **Other models.** The data is private, so only Anthropic models ran. GPT could be given the data under the owner's
  rules; no other model can. Other models will be measured on public data.
- **qmd through its long-running server.** It would be faster; the effect on answers is expected to be none, not
  checked.
- **Telegram's own search with an agent.** Only in layer 1.
- **`tg` changes after 0.135.0.** The release was measured as shipped.
- **A larger scope.** 10 answer chats in one messenger, 195 MB of text. A bigger archive or several messengers would
  likely make grep worse; not measured.
- **Fully blind judging.** The answers carry each tool's link format (`tg` message refs, `qmd://` paths, file paths),
  so a judge could guess the tool family. The judges never saw the letter key.
- **Speed on a quiet machine.** Load average 12 to 45; `tg`'s own 2 s word-search limit tripped 12 times in the first
  run.
- **The JSON export with grep.** The grep ceiling read the per-day Markdown that qmd indexes, not Telegram Desktop's
  JSON.

## Files

The scripts in [scripts/p2/](scripts/p2/) are the run's own copies, with these changes, and were not rerun after them:

- The private run folder is `EXP` (environment variable, default `~/.cache/wirecat-experiment-b`), set at the top of each
  file instead of an absolute path.
- [layer2/run.py](scripts/p2/layer2/run.py) finds `budget.py` next to itself. The run used the copy in round 14's
  harness; [layer2/budget.py](scripts/p2/layer2/budget.py) is that file with one docstring line changed.
- Comments that named private journal entries or question ids are reworded.

Layer 1, search alone:

| Script | What it does |
| --- | --- |
| [common.py](scripts/p2/common.py) | loads the questions and the key by running the private loader of round 13 (not published: it reads the question files) |
| [tgrun/run.py](scripts/p2/tgrun/run.py) | `tg` 0.135.0 `search conversations`, the question as typed, offline |
| [jw/import_r9.py](scripts/p2/jw/import_r9.py) | fills jackwener's own database (its schema) from the store, no Telegram sign-in |
| [qmd/export_md.py](scripts/p2/qmd/export_md.py) | the Markdown for qmd and grep: one file per chat and UTC day |
| [qmd/run.py](scripts/p2/qmd/run.py), [qmd/env.sh](scripts/p2/qmd/env.sh) | `qmd query` and `qmd search`, the question as typed |
| [fts/run.py](scripts/p2/fts/run.py) | builds the FTS5 table and ranks by `bm25`, any word and all words |
| [report.py](scripts/p2/report.py) | the layer 1 totals; it also writes per-question ranks, which stay private |

Layer 2, agents:

| Script | What it does |
| --- | --- |
| [layer2/run.py](scripts/p2/layer2/run.py) | one session per question, arm and model; status CSV, resumable |
| [layer2/claude-clean](scripts/p2/layer2/claude-clean) | the `claude -p` call with clean settings, repeatable `--allow`, `dontAsk` |
| [layer2/budget.py](scripts/p2/layer2/budget.py) | stops a session at 10 tool calls or 600 s |
| [layer2/bin-tg/tg](scripts/p2/layer2/bin-tg/tg), [bin-jw/tg](scripts/p2/layer2/bin-jw/tg), [bin-qmd/qmd](scripts/p2/layer2/bin-qmd/qmd) | the read-only wrappers |
| [layer2/hooks/allow_one_command.py](scripts/p2/layer2/hooks/allow_one_command.py) | lets qmd's multi-line skill queries through as one plain call |
| [layer2/make_copy.py](scripts/p2/layer2/make_copy.py) | the throwaway store copy for the `tg` arm |
| [layer2/stage.sh](scripts/p2/layer2/stage.sh), [layer2/repeat.sh](scripts/p2/layer2/repeat.sh) | staged runs and the 2 repeats |
| [layer2/score.py](scripts/p2/layer2/score.py) | blind scoring, one judge session per sheet |
| [layer2/stats.py](scripts/p2/layer2/stats.py) | totals, bootstrap intervals, paired differences and judge agreement |
| [layer2/report.py](scripts/p2/layer2/report.py) | per-arm session totals; it also writes per-question scores, which stay private |

Not published: jackwener's word-by-word runner and the Telegram search runner (they hold a Russian stop-word list), the
audit script (it names the owner's local paths), and everything that holds data: questions, key, answers,
transcripts, status files and per-question rows.

## Rerun on your own archive

You need your own Telegram store made by `tg` (synced), your own questions with an answer message each, and a loader
for `common.py` to run in place of the private one. It must define `tests`, `answers`, `db`, `in_chunk`, `in_range`
and `bound`. `report.py` also reads jackwener's and Telegram search's rows; without their runners, drop those modes.

1. Set `EXP` to your run folder and lay it out as the scripts expect: the store under `r9/state`, `tg` 0.135.0 under
   `p2/tg`, qmd 2.9.0 under `p2/qmd/pkg`, jackwener's venv under `p2/jw/venv`.
2. Layer 1: `python3 -I p2/qmd/export_md.py`, index with qmd (`qmd collection add`, `qmd embed`), then
   `p2/tgrun/run.py full`, `p2/jw/import_r9.py`, `p2/qmd/run.py full-search search`,
   `p2/qmd/run.py full-query query`, `p2/fts/run.py full`, and `p2/report.py`.
3. Layer 2: `python3 -I p2/layer2/make_copy.py`, then `p2/layer2/stage.sh "<arms>" <question ids>` for each stage, and
   `p2/layer2/repeat.sh` for repeats.
4. Score: `python3 -I p2/layer2/score.py <name> <question ids>` twice per run (two judges), then
   `python3 -I p2/layer2/stats.py <judge-a>,<judge-b> [<run-2 judges> …]`.

Every API key comes from the environment of the run. Never pass one on the command line.
