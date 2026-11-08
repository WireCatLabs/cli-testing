# LifeBench: does memo find the right phone records?

Measured 2026-11-08 on one LifeBench persona. No answer model, no paid API call: only search, and how many of the
records LifeBench marks as the evidence for a question come back in the first 1, 5 and 10 hits.

## Why this was run

The owner wants a public benchmark that is close to how WireCat is used (one person's messages, notes, calendar and
chats over a year) before paying for agent runs on it. [LifeBench 2.0](https://github.com/1754955896/LifeBench)
([paper](https://arxiv.org/abs/2603.03781), Apache-2.0) is such a set: 10 synthetic people, all of 2025, nine phone
sources, 3,380 questions in nine categories, and for each question the exact phone records that answer it.

The question here: if an agent asks memo the LifeBench question as written, does memo return those records? An answer
model cannot answer from records it never sees, so this sets the ceiling for the paid run, and it costs nothing.

## Setup

- Data: `life_bench_data/version2/data_en/<persona>/phone_data/*.json` and `QA_all/QA.json` from LifeBench branch
  `lifebench2.0` at `b4adbe3`. Only the English text files were downloaded (69 MB for all 10 people, no images
  exist in the set: photos are text metadata). The generator's own files (`daily_event`, `event_tree`,
  `daily_draft`) are not read: they are not something a phone holds.
- Persona: `fenghaoran` (Feng Haoran), 4,986 records, 348 questions. All 10 were converted; only this one was run
  (see "What was not measured").
- memo 0.131.50, mail CLI 0.18.0, e5-small in memo; fastembed 0.9.1, onnxruntime 1.31.1 for vectors alone.
  memo ships e5-small in 8 bits; the vectors-alone run loads the full-precision ONNX, so the two e5-small columns
  do not use the same weights.
  Python 3.14.4, AMD Ryzen AI 9 HX 470 (24 threads), 30 GB, Linux 7.0. One worker.
- Store runs use moved folders and `DBUS_SESSION_BUS_ADDRESS=disabled:`, so nothing reaches the owner's store or
  keyring.

Commands (`MEMO_BASELINE` is `performance/agents/knowledge-graph-memory/memo_baseline.py` from branch
`perf/kg-memory-10k-prep` at `c5eac56`; the copy on main cannot load mail on memo 0.131.50):

```sh
python3 -I adapter.py --data ~/.cache/wirecat-bench/lifebench/src/life_bench_data/version2/data_en \
  --persona fenghaoran --output ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran
NOISY=1 MEMO_BASELINE=… ./run-persona.sh fenghaoran
python3 -I score.py --fixtures ~/.cache/wirecat-bench/lifebench/fixtures \
  --run memo=~/.cache/wirecat-bench/lifebench-memo-fenghaoran/per-query.json \
  --run memo-rnnnn=~/.cache/wirecat-bench/lifebench-memo-fenghaoran-rnnnn/per-query.json \
  --run vectors=~/.cache/wirecat-bench/lifebench/vectors/fenghaoran-multilingual-e5-small.json \
  --run vectors=~/.cache/wirecat-bench/lifebench/vectors/fenghaoran-embeddinggemma-300m.json \
  --output results-fenghaoran.json
```

| File | What it does |
| --- | --- |
| [adapter.py](adapter.py) | one persona into `corpus.jsonl`, `queries.json`, `oracle.json` (gold evidence as corpus ids) |
| [memo_clean.py](memo_clean.py) | `memo_baseline.py` with each record's own sender, subject and note title |
| [eval_embeddings.py](eval_embeddings.py) | one vector per record, no store; a copy of the knowledge-graph one with @1 and saved rankings |
| [score.py](score.py) | recall, hit rate and ceiling per LifeBench category |
| [run-persona.sh](run-persona.sh) | the store runs and both vector runs for one persona (its steps were run one by one, not the script as a whole) |
| [results-fenghaoran.json](results-fenghaoran.json) | every number below |

### How LifeBench records became memo sources

memo has no SMS, call, contact or health importer, and its calendar search reads only what `gcal` stored. So:

| LifeBench source | Records (all 10) | Into memo as | What is lost |
| --- | ---: | --- | --- |
| `sms` | 5,923 | mail (mbox), one thread per contact; sender and recipient are the person and the contact | it is mail, not a messenger chat; the phone number is only in the text |
| `agent_chat` | 8,177 | a note per conversation, turns as `Name:` / `Assistant:` lines | the turn's `action` labels; a vector model reads only its first 512 (e5) or 2,048 (Gemma) tokens |
| `calendar` | 6,011 | a note: title, start, end, created, description | it is not an event: no date filter on start time |
| `note` | 7,836 | a note: title, time, content | nothing |
| `push` | 6,026 | a note: app, title, time, read state, target, content | nothing |
| `photo` | 5,604 | a note: file name, time, place, caption, faces, tags, text in the photo | shoot mode and image size |
| `call` | 3,947 | a note: contact, number, start, end, result, direction code | LifeBench does not say what direction 0/1/2 means |
| `fitness_health` | 3,641 | a note: every non-zero value of the day, as `key: value` lines | zero values |
| `contact` | 244 | a note: every field | no person record in memo; never cited as evidence |

Each record keeps its time: the note file's modification time and the mail `Date`. LifeBench times have no zone and
are read as UTC so a date never moves. Chats and health days have only a date and sit at 12:00. Contacts have no date
and sit at 2025-01-01. The generator's own links (`daily_event_id`, `event_id`, `phone_id`) are dropped from the text:
they would hand the search the answer key.

### The gold evidence

Each question's `evidence` is a list of full copies of phone records. Every copy matches exactly one record by
source and `phone_id` (30,075 of 30,075 items across the 10 people; nine of them drop an empty `summarized_info`
field). LifeBench_eval's own recall scripts also compare evidence by content: `recall_text_match.py` looks for the
evidence text in the top K, `recall_evaluator.py` asks an LLM.

- 585 of 3,380 questions (17%) have no evidence. All 585 are Unanswerable, and every Unanswerable question has none.
  They are left out of recall. For fenghaoran: 60 of 348, so 288 are scored.
- A question cites 1 to 232 records, median 5, mean 10.8. 692 of the 2,795 answerable questions cite more than 10,
  so no search can reach recall@10 = 1 on them. The tables show that ceiling.
- No cited record is dated after the question's `ask_time`.
- A question has one to four categories (1,539 one, 1,366 two, 475 three or four) and counts in each, so category
  rows add up to more than the total.

## Results (fenghaoran, 288 answerable questions)

recall@k: the share of a question's evidence records in the first k hits, averaged over questions (as
`memo_baseline.py` scores it). hit@k: the share of questions with at least one evidence record in the first k.
Ceiling: the best recall@10 any search could reach.

| Search | R@1 | R@5 | R@10 | Hit@1 | Hit@5 | Hit@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| memo words only, question as typed (no model) | 0.03 | 0.19 | 0.26 | 0.13 | 0.50 | 0.56 |
| memo words only, content words joined by OR (`--exact`) | 0.04 | 0.23 | 0.32 | 0.16 | 0.59 | 0.69 |
| memo hybrid e5-small, question as typed | 0.10 | 0.23 | 0.32 | 0.35 | 0.60 | 0.70 |
| memo hybrid e5-small, content words joined by OR | 0.11 | 0.24 | 0.31 | 0.38 | 0.58 | 0.68 |
| vectors only, e5-small | 0.10 | 0.22 | 0.26 | 0.31 | 0.51 | 0.59 |
| vectors only, EmbeddingGemma 300m | 0.14 | 0.32 | 0.38 | 0.47 | 0.70 | 0.76 |
| ceiling | 0.30 | 0.77 | 0.87 | 1.00 | 1.00 | 1.00 |

The question as typed with `--exact` (every word must match) returns nothing for 345 of 348 questions; it is in
the JSON and left out here.

### By category, recall@10 (hit@10 in brackets)

| Category | Questions | memo words | memo hybrid | e5-small alone | Gemma alone | Ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Single-hop | 175 | 0.34 (0.55) | 0.43 (0.71) | 0.35 (0.63) | 0.51 (0.81) | 0.98 |
| Multi-hop | 104 | 0.16 (0.59) | 0.17 (0.68) | 0.13 (0.51) | 0.18 (0.69) | 0.73 |
| Temporal | 46 | 0.18 (0.70) | 0.15 (0.76) | 0.09 (0.37) | 0.16 (0.80) | 0.72 |
| Pattern recognition | 49 | 0.08 (0.35) | 0.14 (0.59) | 0.14 (0.45) | 0.18 (0.61) | 0.58 |
| Knowledge update | 48 | 0.06 (0.21) | 0.23 (0.44) | 0.23 (0.48) | 0.33 (0.54) | 0.99 |
| Causal | 39 | 0.05 (0.38) | 0.11 (0.59) | 0.12 (0.49) | 0.18 (0.64) | 0.67 |
| Conflict | 49 | 0.55 (0.90) | 0.58 (0.94) | 0.49 (0.94) | 0.55 (0.96) | 0.99 |
| Hidden information | 12 | 0.03 (0.25) | 0.03 (0.25) | 0.03 (0.25) | 0.02 (0.17) | 0.60 |
| All answerable | 288 | 0.26 (0.56) | 0.32 (0.70) | 0.26 (0.59) | 0.38 (0.76) | 0.87 |

"memo words" and "memo hybrid" are the question as typed. Recall@1 and @5 per category are in
[results-fenghaoran.json](results-fenghaoran.json).

### Titles "rNNNN" and "Synthetic Sender"

`memo_baseline.py` names every note and mail `rNNNN` and signs every mail "Synthetic Sender", so it can map a hit
back by its title. memo embeds the title and sender with the text, so every chunk carries the same noise; on the
knowledge-graph v3 reworded set that alone took vector recall from 0.765 to 0.559. The main rows above use
[memo_clean.py](memo_clean.py): each SMS is signed by its real sender, its subject is its first eight words, and a
note's file name is its source, date and title. The unchanged baseline on the same persona:

| Search | Titles | R@1 | R@5 | R@10 | Hit@1 | Hit@5 | Hit@10 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| memo words, question as typed | real | 0.03 | 0.19 | 0.26 | 0.13 | 0.50 | 0.56 |
| memo words, question as typed | rNNNN | 0.03 | 0.18 | 0.26 | 0.13 | 0.48 | 0.56 |
| memo hybrid e5-small, question as typed | real | 0.10 | 0.23 | 0.32 | 0.35 | 0.60 | 0.70 |
| memo hybrid e5-small, question as typed | rNNNN | 0.11 | 0.23 | 0.30 | 0.35 | 0.56 | 0.68 |

Here the difference is small: 0.02 recall@10 and 0.02 to 0.04 hit rate for hybrid, nothing for words. It is not a
pure noise test: the real titles also add words (source, date, title) that the rNNNN run does not have. Probably
because each LifeBench record is long and starts with its own source, people and time, so the shared title is a
small part of each chunk; the v3 records are one sentence. Not tested further.

## What it showed

1. **Most questions get at least one right record; few get all of them.** memo hybrid puts an evidence record in the
   first 10 for 70% of questions, but on average a question gets only 32% of its evidence records (ceiling 0.87).
   The answer model will usually see part of what it needs. Multi-hop, temporal, causal and pattern questions cite
   many records (the ceiling there is 0.58 to 0.73), and memo hybrid reaches recall@10 0.11 to 0.17 on them.
2. **EmbeddingGemma alone beats memo's hybrid search with e5-small** on every category except Conflict and Hidden
   information: 0.38 against 0.32 recall@10, 0.76 against 0.70 hit@10. It took 51 minutes to embed 4,986
   records on this machine, against 8 minutes for e5-small.
3. **Hybrid helps most where words fail.** Knowledge update goes from 0.06 (words) to 0.23 (hybrid). Probably
   because the question names the topic, not the words of the latest record.
4. **Conflict questions are the easy ones** (hit@10 0.90 to 0.96). Probably because the conflicting records share
   the question's words.
5. **Hidden information is nearly unreachable** (hit@10 0.17 to 0.25, 12 questions). Probably because the evidence does
   not use the question's words or meaning; 12 questions are too few to say more.
6. **The question as typed works without `--exact`.** With `--exact` every word must match and 345 of 348 searches
   come back empty; the default words search returns hits for 299.
7. **Real titles and senders help a little here.** Hybrid recall@10 0.32 with them, 0.30 with `rNNNN` and
   "Synthetic Sender"; much less than the 0.21 drop on the knowledge-graph set
   (and not a pure noise test, see above).

## What was not measured

- **Nine of the ten people.** They are converted and checked (every evidence item resolves, every question without
  evidence is Unanswerable) but not searched. One memo run takes 32 minutes and one Gemma run 51; all ten is about
  14 hours on this machine. One person's 348 questions give the shape, not a tight number per category: Hidden
  information has 12 questions.
- **Search as of the question's date.** LifeBench_eval adds records and asks questions day by day, so a system never
  holds a record dated after the question. Here the store holds the whole year, so later records compete with the
  evidence. That probably makes this harder than the official setup, most of all for Knowledge update (not
  measured).
- **The question's date.** Questions say "last week" or "today" relative to `ask_time`; nothing here tells memo
  that date.
- **LifeBench_eval's own recall.** Its `recall_evaluator.py` asks an LLM which hits cover which evidence (union over
  all hits, no ranking). Its zero-model `recall_text_match.py` matches evidence text in the top K. This page counts
  exact records instead; a chunk of the right record counts, a different record with the same fact does not.
- **Answer accuracy.** No answer model and no judge ran.
- The Chinese data, other memo options (`--project`, other models in memo), and memo's chunking against one vector
  per record.

## Before the paid agent run

From LifeBench_eval `master` at `7f16350` (files read, not run):

- **The judge is an LLM, prompted in Chinese.** `src/evaluators/llm_judge.py` tells the judge "被评内容为中文" (the content
  is Chinese). `config/datasets/lifebench.yaml` takes the model from `${LLM_MODEL}` (the code falls back to
  `deepseek-chat`), sends it through OpenRouter by default, three votes per question, majority wins. An English run
  needs either that prompt as is (the judge is told the content is Chinese) or an English copy. Which language the
  leaderboard ran on is not stated next to it; the default config is Chinese, so an English score may not be
  comparable.
- **The dataset config is Chinese.** `lifebench.yaml` sets `memory_language: zh` and points at the Chinese LoCoMo
  file; the English one is `locomo_format/lifebench_locomo_conversation_format_v2.0_3380QA_en.json`.
- **The judge reads the score points and `ask_time`.** Knowledge update is judged "as of the question's time", so
  the agent must get `ask_time` with the question (`build_question_evidence_mapping.py` strips an ask-time prefix
  from the Chinese LoCoMo questions; the English file was not checked).
- **Answers are free text**, judged CORRECT or WRONG on "the core of the question"; an Unanswerable question is
  correct only when the answer declines. No fixed format.
- **The leaderboard feeds records day by day** (ADD and SEARCH interleaved by date). A fair comparison builds the
  store the same way, or says it does not.
- Gold evidence given straight to the answer model scores 97.3% (DeepSeek-V4-Flash, LifeBench README), so the gap
  between that and an agent run is retrieval plus reasoning.

## Agent pilot, 50 questions

Run 2026-11-08. The first paid run on LifeBench: OpenClaw answering with Claude Sonnet 5.5, once with WireCat Memo and
once with the records as plain files, judged by LifeBench_eval's own judge.

### Why this was run

The search numbers above say what memo finds, not whether an agent answers right. Before a run on all 348 questions
(or all ten people), the owner wanted a small paid run to see how an agent with memo does, what it costs and what
breaks. Budget: $10 in total for answers and judge.

### Setup

- **Questions**: 50 of fenghaoran's 348 (seed 20261108, [pilot-subset-fenghaoran-50.json](pilot-subset-fenghaoran-50.json)).
  Each question sits in the stratum of its rarest category, and the strata get seats in proportion to their size,
  at least two each. Unanswerable gets a fixed 5 seats, not its share of 9, so the declines do not carry the score.
  **46 were answered**: the memo run hit its spending cap 4 questions early (q317, q331, q334, q339), and the files
  run was then given the same 46, so both setups answer the same questions.
- **Agents**: OpenClaw 2026.10.9, `anthropic/claude-sonnet-5-5`, default thinking, one fresh session per question,
  600 s limit. The prompt gives the owner's name, "Today is <ask_time>", says records dated later did not exist yet,
  and asks for `{"answer": "..."}` in plain English, or a refusal if the records do not hold the answer
  ([openclaw_lifebench.py](openclaw_lifebench.py)).
  - **memo**: memo 0.131.50, the store built as above with [memo_clean.py](memo_clean.py) (real senders and titles,
    e5-small vectors), reached through the `memo` command and its cli-memo skill.
  - **files**: the 4,986 records as Markdown files (`date:` line, then the record) in OpenClaw's memory folder,
    indexed by OpenClaw's own memory search.
  - Both hold the whole year, not a store that grows day by day.
- **Runner**: `openclaw_runner.py` from `perf/kg-memory-10k-prep` at `2a59831` (unchanged since `676e46a`), wrapped by
  [openclaw_lifebench.py](openclaw_lifebench.py) for the prompt, the record names and a spending cap. Its OpenClaw
  root is a copy of `openclaw-10k` (Node, OpenClaw, llama.cpp and its model; no sign-in, no transcripts), so the
  files workspace and memory index of the 10k runs were not touched. D-Bus is off for OpenClaw and memo.
- **Judge**: LifeBench_eval's own (`master` at `7f16350`): `deepseek/deepseek-chat` on OpenRouter (DeepSeek V3, the
  OpenRouter name of `deepseek-chat`), temperature 0, three votes, majority wins, its system and user prompt word for
  word ([judge-prompt-zh.txt](judge-prompt-zh.txt), read out of `llm_judge.py` with `ast`). One change:
  "被评内容为中文" (the content is Chinese) became "被评内容为英文" (the content is English). LifeBench_eval has no English
  prompt. The prompt asks for reasoning in Chinese; it was left so. [judge.py](judge.py).
- **Cost**: from each answer's token counts at Anthropic's list price for Sonnet 5.5 ($2 in, $10 out, $0.20 cache
  read, $2.50 cache write per million tokens). OpenClaw's own estimate is shown beside it; it is about 20% lower,
  for a reason not checked. Cache writes are the 5-minute kind: the stored usage shows no 1-hour write in 701 answer
  messages, and OpenClaw's `resolveCacheRetention` falls back to "short" for Anthropic when nothing is configured.
  The judge at OpenRouter's list price ($0.32 in, $0.89 out). All are list prices, not the billed amounts.
- **The `computer` tool**: OpenClaw offers its agents a desktop tool. Sonnet called it 3 times (once for memo, twice
  for files: a screenshot and a wait); each call failed because the throwaway root has no gateway credentials, so
  nothing reached a desktop. A full run should deny the tool.

```sh
python3 -I pilot.py --fixture ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran \
  --qa ~/.cache/wirecat-bench/lifebench/src/life_bench_data/version2/data_en/fenghaoran/QA_all/QA.json \
  --size 50 --seed 20261108 --output ~/.cache/wirecat-bench/lifebench/pilots/fenghaoran-50u5
./run-pilot.sh --agents memo,files --only <ids> --label <batch> --max-usd <cap> --no-judge --yes
python3 -I judge.py validate --items judge-validation.json --output judge-validation-deepseek.json
python3 -I judge.py judge --fixture <pilot> --run memo=<answers> --run files=<answers> --output pilot-judge-deepseek.json
python3 -I pilot_report.py --judged pilot-judge-deepseek.json --run memo=<answers> --run files=<answers> \
  --extra-usd 0.071 --output pilot-results.json
```

The answers ran in three batches per setup (2 smoke questions, then two halves of the rest, taken alternately in id
order so each half covers every category), so spend could be checked between them. The batches were merged before
judging.

| File | What it does |
| --- | --- |
| [pilot.py](pilot.py) | the stratified subset |
| [openclaw_lifebench.py](openclaw_lifebench.py) | the kg runner with the LifeBench prompt, record names and a spending cap |
| [run-pilot.sh](run-pilot.sh) | subset, OpenClaw root, store and index, answers, judge |
| [judge.py](judge.py) | LifeBench_eval's judge (`judge`), its check on hand-labelled answers (`validate`), a cost estimate |
| [judge-prompt-zh.txt](judge-prompt-zh.txt) | the judge prompt in use; [judge-prompt.txt](judge-prompt.txt) is an English translation, not used for scores |
| [judge-validation.json](judge-validation.json) | 22 hand-labelled answers |
| [pilot_report.py](pilot_report.py) | the tables below |
| [pilot-judge-deepseek.json](pilot-judge-deepseek.json), [pilot-results.json](pilot-results.json) | every verdict, answer, vote, cost and time |

### Is the judge right?

22 answers written by hand on 8 subset questions: for 6 answerable ones the gold answer, a paraphrase, and one with a
wrong key value (a date two days off, another pace, a made-up reason); for 2 unanswerable ones a refusal and a
made-up answer. deepseek-chat labelled all 22 as a careful reader would, with no split vote
([judge-validation-deepseek.json](judge-validation-deepseek.json), $0.04). The items are short and clear-cut. The real
answers run to several paragraphs; long answers that mix right and wrong claims were not tested this way. In the run, no answer got a split vote (CORRECT and WRONG on the same answer); 4
votes failed (empty or unparseable reply after three tries) on 4 files answers, and the other two votes decided.

A side note: an earlier draft of this pilot judged with Claude Haiku 5.5 and the English translation. It also agreed
on 22 of 22 ([judge-validation-haiku-en.json](judge-validation-haiku-en.json)) and on both smoke answers. No score
here uses it.

Hand reading of the 5 WRONG verdicts and 6 random CORRECT ones: all 11 match the gold answer. One WRONG is probably the data's fault:
for q294 ("my personal best pace for a 10 km run?") the gold is 5:58/km from 31 August, but a record of 10 August
holds a 10 km at 4:53/km, which the files agent found and gave.

### Results (46 questions)

| Category | Questions | OpenClaw + memo | OpenClaw + files |
| --- | ---: | ---: | ---: |
| All | 46 | 43 (93%) | 44 (96%) |
| Answerable | 41 | 38 (93%) | 39 (95%) |
| Single-hop | 24 | 22 | 23 |
| Multi-hop | 14 | 13 | 13 |
| Temporal | 8 | 8 | 8 |
| Pattern recognition | 7 | 6 | 5 |
| Knowledge update | 6 | 5 | 5 |
| Causal | 4 | 4 | 4 |
| Conflict | 8 | 7 | 8 |
| Hidden information | 1 | 1 | 1 |
| Unanswerable | 5 | 5 | 5 |

A question can have several categories, so the rows add up to more than 46. 95% intervals (Wilson): memo 82–98%,
files 86–99%. One question apart is no difference at this size.

| Setup | Answers, list price | OpenClaw estimate | A question, mean / max | Median seconds (max) | Median tool calls | Failed runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| memo | $5.05 | $3.97 | $0.110 / $0.462 | 50 (243) | 18 | 0 |
| files | $4.23 | $3.37 | $0.092 / $0.201 | 35 (79) | 13 | 0 |

Total spent: answers $9.28, judge $0.19 (both runs), judge checks and drafts $0.07: **$9.54**.

The questions both setups got wrong, or one did:

| Question | memo | files | What went wrong |
| --- | --- | --- | --- |
| q164 April health habits (Multi-hop, Pattern) | WRONG | WRONG | both described the parents' blood-pressure care; the gold is the owner's own five habits |
| q173 date of the Cotti Coffee meeting (Conflict) | WRONG | right | memo saw both dates and chose a note written on 20 March that gives 16 March; files weighed the calendar, photo and chat (15 March) |
| q300 recently completed photo project (Knowledge update) | WRONG | right | memo named another street series and said it could not confirm one was finished |
| q294 best 10 km pace (Knowledge update) | right | WRONG | files gave a faster run from the records; probably a gold flaw, see above |

### What it showed

1. **A strong agent answers almost everything, with or without memo.** 93% and 96% on 46 questions; every
   unanswerable question was declined. The search numbers above (memo hybrid finds an evidence record in the first 10
   for 70% of questions) are not a ceiling for an agent: it makes 13 to 18 tool calls per question (median), reads
   what it finds and searches again.
2. **The plain files did as well for less.** Same accuracy within one question, 16% cheaper, 30% faster at the
   median, 634 tool calls against 1,376. The files agent never called OpenClaw's memory search tool: apart from two
   failed `computer` calls (see below), every tool call was `exec`, shell commands over the 4,986 small dated files. Probably that works because the records fit in one
   folder with a date on each; it would probably not hold for a store of years of real mail.
3. **memo's cost has a long tail.** One unanswerable question (q272) took 176 tool calls, 243 s and $0.46 before the
   agent declined; the files agent's worst was $0.20. Probably a refusal is expensive when every search returns
   something close.
4. **The misses look like reasoning more than retrieval.** On q173 the memo agent quoted the records with the right
   date and still chose the other one; q164 and q300 answered about something next to the gold (the parents' health,
   another photo series); q294's gold is doubtful.

### Against LifeBench's published numbers

LifeBench_eval's leaderboard (its README at `7f16350`) gives, over all 3,380 questions: gold evidence 97.3%, the best
memory system 74.4% (Hindsight, GLM-5.2 answering), Mem0 61.5% (DeepSeek-V4-Flash). Our 93% and 96% are **not
comparable** with those, for these reasons:

- **The answer side differs.** There, a memory system returns context and one model call answers. Here an agent
  with Sonnet 5.5 searches as long as it likes (median 13 to 18 tool calls).
- **The store differs.** There, records are added day by day and each question is asked on its date. Here the
  store holds the whole year and the prompt says "today is …". Probably harder here for Knowledge update, but the
  agent may also see later records.
- **The data and judge differ.** Here the data is English and the judge's language line says English; the
  leaderboard's language is not stated next to it (the default config is Chinese). The judge model is
  `deepseek/deepseek-chat` on OpenRouter; the leaderboard does not say which model judged it.
- **The sample differs.** 46 questions of one person, with Unanswerable fixed at 5 of 50 (it is 17% of the full
  set), not 3,380 questions over ten people.

### Before a full run

- **Deny the `computer` tool** in the agents' config, so a run never depends on its credentials being absent.
- **Cap the spend per question, not only per run.** One memo question cost $0.46. A cap per question (or a
  tool-call limit) would stop runs like q272. The run cap stopped memo 4 questions early; a full run needs the
  budget set from these numbers: about $0.10 a question per setup, so $35 per setup for this person's 348.
- **Cap on the list price, not OpenClaw's estimate.** The estimate runs about 20% under the list price, so the cap
  lets more through than it says.
- **Add a harder setup or a smaller model.** At 93–96% the two setups cannot be told apart. A model that answers in
  one call from what memo returns (as the leaderboard does), or a smaller answer model, would show where memo's
  search matters.
- **Feed the store by date** if the score is to be put next to the leaderboard.
- **Look at the gold.** q294's gold looks wrong; on a full run, a hand check of every WRONG verdict is cheap.
- **Run the judge in parallel.** It calls deepseek-chat one vote at a time, and OpenRouter answers slowly; 3,380
  questions would probably take hours.
