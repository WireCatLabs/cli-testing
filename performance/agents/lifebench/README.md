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
| [run-persona.sh](run-persona.sh) | the store runs and both vector runs for one persona |
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
field). LifeBench_eval matches its evidence the same way, by content
(`datasets/lifebench_raw/build_question_evidence_mapping.py`).

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

Here the noise costs little: 0.02 recall@10 and 0.02 to 0.04 hit rate for hybrid, nothing for words. Probably
because each LifeBench record is long and starts with its own source, people and time, so the shared title is a
small part of each chunk; the v3 records are one sentence. Not tested further.

## What it showed

1. **Most questions get at least one right record; few get all of them.** memo hybrid puts an evidence record in
   the first 10 for 70% of questions, but only 32% of all evidence records. The answer model will usually see part
   of what it needs. Multi-hop, temporal, causal and pattern questions cite many records (the ceiling there is
   0.58 to 0.73), and memo finds about a fifth of them.
2. **EmbeddingGemma alone beats memo's hybrid search with e5-small** on every category except Conflict and Hidden
   information: 0.38 against 0.32 recall@10, 0.76 against 0.70 hit@10. It took 51 minutes to embed 4,986
   records on this machine, against 8 minutes for e5-small.
3. **Hybrid helps most where words fail.** Knowledge update goes from 0.06 (words) to 0.23 (hybrid); the question
   names the topic, not the words of the latest record.
4. **Conflict questions are the easy ones** (hit@10 0.90 to 0.96): the conflicting records share the question's
   words.
5. **Hidden information is nearly unreachable** (hit@10 0.17 to 0.25, 12 questions): the evidence does not use the
   question's words or meaning.
6. **The question as typed works without `--exact`.** With `--exact` every word must match and 345 of 348 searches
   come back empty; the default words search returns hits for 299.

7. **Real titles and senders help a little here.** Hybrid recall@10 0.32 with them, 0.30 with `rNNNN` and
   "Synthetic Sender"; much less than the 0.21 drop on the knowledge-graph set.

## What was not measured

- **Nine of the ten people.** They are converted and checked (every evidence item resolves, every question without
  evidence is Unanswerable) but not searched. One memo run takes 32 minutes and one Gemma run 51; all ten is about
  14 hours on this machine. One person's 348 questions give the shape, not a tight number per category: Hidden
  information has 12 questions.
- **Search as of the question's date.** LifeBench_eval adds records and asks questions day by day, so a system
  never holds a record dated after the question. Here the store holds the whole year, so later records compete with
  the evidence. That makes this harder than the official setup, mostly for Knowledge update.
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

- **The judge is an LLM, prompted in Chinese.** `src/evaluators/llm_judge.py` tells the judge "被评内容为中文" (the
  content is Chinese). The default model is `deepseek-chat`; `config/datasets/lifebench.yaml` sends it through
  OpenRouter, three votes per question, majority wins. An English run needs either that prompt as is (the judge is
  told the content is Chinese) or an English copy, and then scores are not comparable with the leaderboard.
- **The dataset config is Chinese.** `lifebench.yaml` sets `memory_language: zh` and points at the Chinese LoCoMo
  file; the English one is `locomo_format/lifebench_locomo_conversation_format_v2.0_3380QA_en.json`.
- **The judge reads the score points and `ask_time`.** Knowledge update is judged "as of the question's time", so
  the agent must get `ask_time` with the question (the LoCoMo file prefixes it to the question text).
- **Answers are free text**, judged CORRECT or WRONG on "the core of the question"; an Unanswerable question is
  correct only when the answer declines. No fixed format.
- **The leaderboard feeds records day by day** (ADD and SEARCH interleaved by date). A fair comparison builds the
  store the same way, or says it does not.
- Gold evidence given straight to the answer model scores 97.3% (DeepSeek-V4-Flash, LifeBench README), so the gap
  between that and an agent run is retrieval plus reasoning.
