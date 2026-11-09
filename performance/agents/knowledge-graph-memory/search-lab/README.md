# Search lab: what else lifts memo's search, tested offline

Measured 2026-11-08. Scripts over the fixtures, no change to memo. Every hypothesis ranks the same records and is
scored the same way.

## Why this was run

The owner wants WireCat Memo's search at the level of the best memory engines. On the 17 v3 questions that were
reworded so they share no word with their record, memo 0.131.50 finds 0.53 of the records in its first ten
(0.62 with cli-core #2665). EmbeddingGemma alone finds 0.94, Supermemory 0.88 and Honcho 0.76. On LifeBench (one
persona, 288 questions over a year of phone data), memo reaches recall@10 0.32 and Gemma alone 0.38. Multi-hop,
temporal, pattern and causal questions sit at 0.11 to 0.18.

The question: which change to search, on top of Gemma vectors, gains the most, at what cost and delay? Candidates
were a local reranker, query rewriting by a cheap model, word and vector fusion, date-aware ranking and a few smaller
ideas. The answer picks what memo builds next. Two things were left out because other agents own them: Gemma inside
memo, and rewriting records when they are written.

## Setup

- Data, all synthetic or public:
  - v3: `~/.cache/wirecat-bench/kg-fixture-v3` (10,444 records). 46 questions have a source record ("v3 all", the
    record's words). 17 of them are reworded in `kg-fixture-v3-paraphrased` ("v3 reworded"). Both share one corpus
    (same md5).
  - LifeBench: persona `fenghaoran`, 4,986 records, 288 answerable questions, from the
    [LifeBench page](../../lifebench/README.md) on branch `perf/lifebench-agents`.
  - LifeBench sample: a fixed 20% of the 288 (59 questions), stratified by first category, seed 20261108. Paid
    hypotheses ran on it first.
- Vectors: EmbeddingGemma 300M and multilingual-e5-small, through fastembed 0.9.1 and onnxruntime 1.31.1, with the
  prompts memo uses. One vector per record, brute-force cosine, 8 threads.
  - Indexing took 234 s for v3 (Gemma), 1,852 s for LifeBench (Gemma) and 47 s for v3 (e5-small).
  - Query vectors took 36 ms per question for Gemma and 11 ms for e5-small, in batch.
- Words: SQLite 3.46.1 FTS5 (`porter unicode61`). BM25 over the question's content words joined by OR. This is not
  memo's own words search.
- Rewriting and LLM rerank: Claude Haiku 5.5 (`claude-haiku-5-5`), thinking off, effort low, at $0.10 / $0.50 per
  million tokens. It is the only model used for rewriting in this lab.
- Rerankers: fastembed `TextCrossEncoder` over the top 50, each record cut to 2,000 characters.
- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB, Linux 7.0, Python 3.14.4. Other agents' jobs ran at the same
  time, with load average 16 to 35 and swap full. Every millisecond figure here is from a loaded machine.

recall@10: the share of a question's gold records in the first ten, averaged over questions. hit@10: the share of
questions with at least one gold record in the first ten. Both are as `eval_embeddings.py` and LifeBench's
`score.py` count them. "+a/-b" is the number of questions whose recall rose or fell against Gemma alone.

```sh
B=~/.cache/wirecat-bench; U="uv run -q --with fastembed==0.9.1 python3 -I"
$U embed.py --cache cache --fixture $B/kg-fixture-v3 --model google/embeddinggemma-300m --name v3
$U embed.py --cache cache --fixture $B/lifebench/fixtures/fenghaoran --model google/embeddinggemma-300m --name lb
$U embed.py --cache cache --fixture $B/kg-fixture-v3 --model intfloat/multilingual-e5-small --name v3
uv run -q --with anthropic==2.6.0 python3 -I rewrite.py --v3 $B/kg-fixture-v3 \
  --v3-reworded $B/kg-fixture-v3-paraphrased --lifebench $B/lifebench/fixtures/fenghaoran --cache cache/rewrites.json
$U lab.py queries --cache cache
$U lab.py rerank --cache cache --models-dir models --model BAAI/bge-reranker-base --set v3-all,v3-rew --base hybrid
uv run -q --with fastembed==0.9.1 --with anthropic==2.6.0 python3 -I lab.py llmrerank --cache cache --base stackC \
  --set v3-all,v3-rew,lb-s20
$U lab.py eval --cache cache --output results.json
```

Each embedding, query and rerank step ran alone under one machine-wide `flock`.

| File | What it does |
| --- | --- |
| [embed.py](embed.py) | one vector per record (or per chunk of a long record), saved once per model |
| [rewrite.py](rewrite.py) | Haiku paraphrases, HyDE record, dated paraphrases, date range; cached, cost logged |
| [periods.ts](periods.ts) | the period cli-core's local parser reads from each question, for the date-boost rows |
| [lab.py](lab.py) | every hypothesis, the cross-encoder and Haiku rerank runs, and the scoring |

## Results

The baseline is Gemma alone. It reproduces the numbers from the earlier pages: reworded 0.94, LifeBench
0.38 / 0.76, e5-small 0.71.

Added delay is per question, on top of Gemma alone (query vector plus brute-force cosine, about 6 ms here after
the query vector). Haiku delays are the median of single calls. When a row has two calls (rewrites and date range),
they can run in parallel. That combined delay is inferred, not timed end to end.

### Ranked: what to build

**Fair LifeBench baseline: 0.41 / 0.79.** That is Gemma alone with the records dated after the question dropped
(the "date cut"). A real store holds nothing from the future, and LifeBench's own harness adds data day by day, so
a gain counts only against this row. The "Cut" column says whether a row uses the cut. Rows without it are compared
with Gemma alone at 0.38 / 0.76. The +a/-b counts are always against Gemma alone without the cut.

Gemma alone already reaches 0.94 on the reworded set, above Supermemory's 0.88. That gap is Gemma's, not the
work of anything below.

| # | Hypothesis | Cut | v3 reworded @10 | v3 all @10 | LifeBench R@10 / hit@10 | Gain over the fair baseline | Added delay | Added cost / question | Verdict |
| ---: | --- | :-: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| - | memo 0.131.50 (earlier page, not rerun) | no | 0.53 | | 0.32 / 0.70 | | | | reference |
| - | Gemma alone | no | 0.94 | 0.94 | 0.38 / 0.76 | | | | |
| - | **Gemma alone, date cut (fair baseline)** | yes | 0.94 | 0.94 | **0.41 / 0.79** (+16/-0) | | 0 | 0 | use in every LifeBench run |
| 1 | **Haiku listwise rerank** over the top 30 of stack C | yes | **1.00** | 0.94 | **0.55 / 0.93** (+158/-9) | +0.14 / +0.14 | stack C + 0.9 s | ~$0.0007 | biggest gain; opt-in "search harder" |
| 2 | **Stack C**: words + vectors weighted 0.7, Haiku date-range boost, Haiku dated rewrites | yes | 0.94 | 0.94 | 0.49 / 0.90 (+135/-18) | +0.08 / +0.11 | ~1.3 s (2 calls in parallel) | ~$0.00013 | best without a rerank |
| 3 | Date-range boost: Haiku names the period, records inside it move up (+0.5) | yes | 0.94 | 0.94 | 0.44 / 0.84 (+69/-2) | +0.03 / +0.05 | 0.8 s | ~$0.00003 | cheap; try a local date parser |
| 4 | Dated rewrites + words with Haiku's keywords, RRF | no | 1.00 | 0.91 | 0.45 / 0.87 | (+0.07 / +0.11 over Gemma alone) | 1.3 s | ~$0.0001 | good; part of stack C |
| 5 | Words + vectors, weighted 0.7 (min-max) | no | 0.56 | 0.94 | 0.45 / 0.84 | (+0.07 / +0.08 over Gemma alone) | ~5 ms | 0 | helps LifeBench, **breaks reworded** |
| 6 | Words + vectors, RRF k=60 | no | 0.41 | 0.94 | 0.42 / 0.82 | (+0.04 / +0.06 over Gemma alone) | ~3 ms | 0 | **breaks reworded** |
| 7 | Haiku 3 rewrites, mean vector | no | 0.94 | 0.91 | 0.40 / 0.81 | (+0.02 / +0.05 over Gemma alone) | 1.4 s | ~$0.0001 | small gain alone |
| 8 | e5-small + Haiku 3 rewrites, RRF | no | 0.96 | 0.93 | not run | | 1.4 s | ~$0.0001 | lifts e5-small from 0.71 to Gemma's level |
| 9 | Recency boost (newer records up among the top 10 or 30) | yes | 0.92–0.94 | 0.94 | 0.40–0.41 / 0.79–0.80 | 0 | 0 | 0 | no gain |
| 10 | Local cross-encoders over the top 50 of words + vectors RRF k=60 (best: jina-reranker-v2 0.82, bge-reranker-base 0.79) | no | 0.68–0.82 | 0.87–0.94 | not run | | 0.4–1.9 s | 0 | **open**: tested only over a first stage already broken at 0.41 |
| 11 | Gemma query prefix variants | no | 0.71–0.94 | 0.91–0.94 | 0.35–0.38 / 0.68–0.73 | (worse) | 0 | 0 | worse; keep `task: search result` |
| 12 | HyDE (Haiku writes a record, embedded as a passage) | no | 0.65–0.88 | 0.78–0.91 | 0.27–0.36 / 0.66–0.76 | (worse) | 1.3 s | ~$0.00007 | worse everywhere; drop |

### The date-range boost without Haiku (cli-core `search all`)

Row 3 was built into `search all` with a local parser instead of Haiku (`questionPeriod` in cli-core, the PR that
links here). [periods.ts](periods.ts) runs that parser over every lab question with "now" set to the question's own
date and writes [ts-periods.json](ts-periods.json); `lab.py` reads it from `cache/`. Of the 288 LifeBench questions the
parser names a period for 208, Haiku for 203, both for 193; no v3 question names one.

`search all` merges sources whose scores do not compare (a hit found only by words has no cosine), so it boosts by
rank: each of the top 100 keeps `1 - rank/100` and gains 0.5 inside the period. Row 3 boosted min-max cosines instead.

| Base | Period | Boost | v3 reworded @10 | v3 all @10 | LifeBench R@10 / hit@10 |
| --- | --- | --- | ---: | ---: | ---: |
| Gemma, date cut | none | none | 0.94 | 0.94 | 0.41 / 0.79 |
| Gemma, date cut | Haiku | min-max score + 0.5 (row 3) | 0.94 | 0.94 | 0.44 / 0.84 |
| Gemma, date cut | Haiku | rank + 0.5 | 0.94 | 0.94 | 0.42 / 0.82 |
| Gemma, date cut | **parser** | rank + 0.5 | 0.94 | 0.94 | 0.42 / 0.82 |
| words + Gemma RRF k=60, date cut | none | none | 0.41 | 0.94 | 0.44 / 0.84 |
| words + Gemma RRF k=60, date cut | **parser** | rank + 0.5 | 0.41 | 0.94 | **0.47 / 0.88** |

- **The parser is as good as Haiku here**: the same 0.42 / 0.82 with the same boost, for free and with no delay.
- **The rank boost gives less than the score boost over Gemma alone** (+0.01 / +0.03 against +0.03 / +0.05). That is the
  formula, not the parser. Over words and meaning merged, closer to what `search all` does, it gives +0.03 / +0.04.
- **v3 does not move**: its questions name no period. The words + Gemma base breaks the reworded set (0.41) with or
  without the boost; that is row 6, not the boost.

### Every row

| Hypothesis | v3 reworded | v3 all | LifeBench R@10 / hit@10 | LifeBench sample R@10 |
| --- | ---: | ---: | ---: | ---: |
| words only (FTS5 BM25) | 0.20 | 0.85 | 0.40 / 0.76 | 0.39 |
| e5-small alone | 0.71 | 0.91 | | |
| Gemma alone | 0.94 | 0.94 | 0.38 / 0.76 | 0.29 |
| **(c) words + Gemma** | | | | |
| RRF k=10 | 0.78 | 0.94 | 0.44 / 0.82 | 0.41 |
| RRF k=30 | 0.53 | 0.94 | 0.43 / 0.83 | 0.41 |
| RRF k=60 | 0.41 | 0.94 | 0.42 / 0.82 | 0.38 |
| RRF k=100 | 0.41 | 0.94 | 0.42 / 0.82 | 0.38 |
| RRF k=60, words weight 0.3 | 0.65 | 0.94 | 0.42 / 0.82 | 0.34 |
| RRF k=60, words weight 0.5 | 0.59 | 0.94 | 0.42 / 0.82 | 0.36 |
| weighted, alpha 0.5 on vectors (min-max) | 0.41 | 0.94 | 0.45 / 0.82 | 0.42 |
| weighted, alpha 0.7 | 0.56 | 0.94 | 0.45 / 0.84 | 0.41 |
| weighted, alpha 0.8 | 0.71 | 0.94 | 0.44 / 0.84 | 0.38 |
| weighted, alpha 0.9 | 0.85 | 0.94 | 0.41 / 0.82 | 0.33 |
| weighted 0.5, BM25 scaled s/(s+5) | 0.47 | 0.94 | 0.42 / 0.82 | 0.39 |
| weighted 0.7, BM25 s/(s+5) | 0.59 | 0.94 | 0.42 / 0.83 | 0.37 |
| weighted 0.5, BM25 s/(s+10) | 0.47 | 0.94 | 0.44 / 0.83 | 0.41 |
| weighted 0.7, BM25 s/(s+10) | 0.65 | 0.94 | 0.42 / 0.84 | 0.37 |
| weighted 0.5, BM25 s/(s+20) | 0.56 | 0.94 | 0.44 / 0.84 | 0.42 |
| weighted 0.7, BM25 s/(s+20) | 0.66 | 0.94 | 0.43 / 0.85 | 0.37 |
| e5-small + words, RRF k=60 | 0.47 | 0.94 | | |
| **(e) Gemma query prefix** | | | | |
| `task: question answering \| query: ` | 0.92 | 0.94 | 0.35 / 0.68 | 0.27 |
| `task: fact checking \| query: ` | 0.94 | 0.94 | 0.35 / 0.71 | 0.29 |
| no prefix | 0.71 | 0.91 | 0.38 / 0.73 | 0.28 |
| **(b) rewriting at search time (Haiku)** | | | | |
| question + 3 rewrites, RRF | 0.94 | 0.91 | 0.39 / 0.80 | 0.32 |
| question + 3 rewrites, mean vector | 0.94 | 0.91 | 0.40 / 0.81 | 0.33 |
| question + 3 dated rewrites, RRF | 0.82 | 0.87 | 0.40 / 0.82 | 0.32 |
| HyDE alone | 0.65 | 0.78 | 0.27 / 0.66 | 0.22 |
| question + HyDE, RRF | 0.82 | 0.85 | 0.34 / 0.74 | 0.28 |
| question + HyDE, mean vector | 0.88 | 0.91 | 0.36 / 0.76 | 0.29 |
| rewrites + words with Haiku keywords, RRF | 0.94 | 0.91 | 0.43 / 0.83 | 0.38 |
| dated rewrites + words with dated keywords, RRF | 1.00 | 0.91 | 0.45 / 0.87 | 0.41 |
| e5-small + 3 rewrites, RRF | 0.96 | 0.93 | | |
| e5-small + HyDE, RRF | 0.64 | 0.89 | | |
| **(d) dates** | | | | |
| records after the question's date dropped | 0.94 | 0.94 | 0.41 / 0.79 | 0.31 |
| words + Gemma RRF k=60, date cut | 0.41 | 0.94 | 0.44 / 0.84 | 0.39 |
| date cut + recency boost 0.1, top 10 | 0.94 | 0.94 | 0.41 / 0.79 | 0.31 |
| date cut + recency boost 0.1, top 30 | 0.94 | 0.94 | 0.41 / 0.79 | 0.31 |
| date cut + recency boost 0.3, top 10 | 0.94 | 0.94 | 0.41 / 0.79 | 0.31 |
| date cut + recency boost 0.3, top 30 | 0.92 | 0.94 | 0.40 / 0.80 | 0.32 |
| date cut + recency boost only when the question says now/current/latest | 0.94 | 0.94 | 0.41 / 0.80 | 0.31 |
| date cut + Haiku date-range boost 0.2 | 0.94 | 0.94 | 0.42 / 0.82 | 0.33 |
| date cut + Haiku date-range boost 0.5 | 0.94 | 0.94 | 0.44 / 0.84 | 0.35 |
| keep only records inside Haiku's date range | 0.94 | 0.94 | 0.44 / 0.81 | 0.34 |
| **stacks** | | | | |
| A: date cut + weighted 0.7, BM25 s/(s+10) | 0.65 | 0.94 | 0.45 / 0.86 | 0.39 |
| B: A + date-range boost 0.5 | 0.65 | 0.94 | 0.48 / 0.89 | 0.45 |
| C: B + dated rewrites (mean vector) and their keywords | 0.94 | 0.94 | 0.49 / 0.90 | 0.46 |
| C with plain rewrites | 0.94 | 0.94 | 0.49 / 0.90 | 0.45 |
| C with RRF k=60 instead of weighted | 1.00 | 0.91 | 0.49 / 0.90 | 0.47 |
| C with alpha 0.8 | 0.94 | 0.94 | 0.48 / 0.89 | 0.43 |
| C with boost 0.3 | 0.94 | 0.94 | 0.49 / 0.90 | 0.47 |
| C without the date cut | 0.94 | 0.94 | 0.47 / 0.88 | 0.43 |
| C without words | 0.82 | 0.91 | 0.44 / 0.86 | 0.38 |
| free stack: date cut + weighted 0.9 | 0.79 | 0.94 | 0.43 / 0.83 | 0.35 |
| free stack: date cut + weighted 0.85 | 0.73 | 0.94 | 0.44 / 0.85 | 0.36 |
| **(a) cross-encoder over the top 50 of words + Gemma RRF k=60** (v3 only) | | | | |
| ms-marco-MiniLM-L-6-v2 (1,937 ms per question) | 0.77 | 0.94 | | |
| ms-marco-MiniLM-L-12-v2 (462 ms) | 0.77 | 0.94 | | |
| jina-reranker-v1-turbo-en (412 ms) | 0.68 | 0.94 | | |
| bge-reranker-base (1,252 ms) | 0.79 | 0.94 | | |
| jina-reranker-v2-base-multilingual (1,623 ms) | 0.82 | 0.87 | | |
| the same five, rank-fused back with the first stage | 0.53–0.65 | 0.94 | | |
| **LLM rerank (Haiku, top 30 of stack C)** | 1.00 | 0.94 | 0.55 / 0.93 | 0.53 |

The MiniLM-L-6 time is a load spike: the larger L-12 ran in a quarter of it. The other millisecond numbers are
medians over 46 or 17 questions.

### LifeBench by category, recall@10 (hit@10)

| Category (questions) | Gemma alone | words + Gemma 0.7 | date cut | date cut + range boost | stack C | Haiku rerank of C |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Single-hop (175) | 0.51 (0.81) | 0.58 (0.86) | 0.55 (0.85) | 0.58 (0.89) | 0.63 (0.91) | 0.69 (0.96) |
| Multi-hop (104) | 0.18 (0.69) | 0.26 (0.83) | 0.18 (0.69) | 0.21 (0.76) | 0.29 (0.86) | 0.33 (0.89) |
| Temporal (46) | 0.16 (0.80) | 0.24 (0.94) | 0.16 (0.80) | 0.18 (0.85) | 0.26 (0.96) | 0.29 (0.94) |
| Pattern (49) | 0.18 (0.61) | 0.22 (0.69) | 0.23 (0.67) | 0.25 (0.73) | 0.27 (0.84) | 0.30 (0.88) |
| Knowledge update (48) | 0.33 (0.54) | 0.36 (0.60) | 0.44 (0.69) | 0.43 (0.69) | 0.48 (0.75) | 0.57 (0.90) |
| Causal (39) | 0.18 (0.64) | 0.25 (0.77) | 0.18 (0.64) | 0.23 (0.77) | 0.31 (0.82) | 0.35 (0.87) |
| Conflict (49) | 0.55 (0.96) | 0.65 (0.98) | 0.55 (0.96) | 0.59 (0.96) | 0.65 (0.96) | 0.72 (0.98) |
| Hidden information (12) | 0.02 (0.17) | 0.04 (0.25) | 0.02 (0.17) | 0.04 (0.42) | 0.05 (0.42) | 0.09 (0.58) |

### Paid calls (real cost, from the API's token counts)

| Step | Calls | Cost |
| --- | ---: | ---: |
| Paraphrases, HyDE, dated paraphrases (v3 46 + 17, LifeBench 288) | 1,027 | $0.092 |
| Date range, first run (keyed without the ask date, thrown away) and second run | 338 + 351 | $0.018 |
| Haiku rerank, free-text answer (thrown away, see below) | 351 | $0.163 |
| Haiku rerank, JSON answer: v3 + sample first, then the rest of LifeBench | 122 + 229 | $0.167 |
| **Total** | | **$0.44** |

The rewrites ran on all 288 LifeBench questions before the owner's rule "sample first" reached this lab. The
Haiku rerank followed the rule: first v3 plus the 59-question sample (0.46 to 0.53 against stack C), then the rest,
because it was clearly ahead. The first rerank asked for "numbers separated by commas". Haiku often explained its
choice, and the explanation's dates and amounts were read as record numbers. The JSON-schema run replaced it. On
the sample, both scored 0.53.

## What it showed

1. **Rewriting the question with Haiku, then a Haiku rerank, gives the largest gain.** Against the fair baseline,
   LifeBench goes from 0.41 / 0.79 to 0.55 / 0.93 (+0.14 / +0.14), and every category rises. Knowledge update goes
   from 0.44 to 0.57. The reworded v3 set goes from 0.94 to 1.00 (one question). Cost is about $0.0007 and 2 to
   2.5 s per question (inferred from single-call medians). It suits an agent's "search harder" call, not search as
   you type.
2. **Stack C is the best ranking without a rerank** (0.49 / 0.90 on LifeBench, +0.08 / +0.11 over the fair
   baseline, 0.94 reworded). It needs two small Haiku calls that can run in parallel (~1.3 s, ~$0.00013).
3. **The date cut is a test fix, not a feature.** It drops records dated after the question: +0.03 recall@10,
   +16/-0 questions, and Knowledge update 0.33 → 0.44. LifeBench's own harness never holds those records, because
   it adds data day by day. A real store holds nothing from the future either. Any LifeBench run of memo should
   use the cut to be comparable. It will not lift search in daily use.
4. **Mixing words into the ranking helps LifeBench and breaks reworded questions.** RRF k=60 takes reworded from
   0.94 to 0.41. Weighted 0.7 takes it to 0.56, a small k (10) to 0.78. LifeBench gains 0.04 to 0.07. A question
   in other words still matches common words ("agreement", "yearly", "price") in records of other projects. Those
   records then appear in both lists and outrank the right record, which only the vectors found. Words mixed in
   safely only together with Haiku's keywords (stack C keeps 0.94). This matters for memo's rank fusion of
   words and vectors: test it on the reworded set, not only on questions that reuse the record's words.
5. **The question's date range is the cheapest strong signal.** Haiku names the period (0.8 s, $0.00003). Moving
   records inside it up adds +0.03 recall@10 and +0.05 hit@10 over the date cut, with 69 questions up and 2 down.
   It does no harm on v3. A local date parser could probably do the same for free (not tested).
6. **Local cross-encoders are still an open question.** They ran only over the top 50 of words + vectors with RRF
   k=60. That list is already at 0.41 on the reworded set, so the rerankers repaired damage (up to 0.82) instead of
   competing with Gemma's 0.94. The intended test, over the top 50 of Gemma alone (`--base gemma`), was queued and
   lost (see below). So were LifeBench and stack C. Their speed here was 0.4 to 1.6 s per question on a loaded CPU.
7. **HyDE and other Gemma prompts make it worse.** HyDE alone drops LifeBench to 0.27. The QA and fact-checking
   prompts drop hit@10 by 0.05 to 0.08. Keep `task: search result`.
8. **A recency boost adds nothing** beyond the date cut, on Knowledge update or overall.
9. **Haiku rewrites lift e5-small to Gemma's level on reworded questions** (0.71 → 0.96). Not measured on
   LifeBench.

## What was not measured

- **The local rerankers over Gemma alone (the actual question (a)), over stack C, on LifeBench, bge-reranker-v2-m3-int8, chunked LifeBench records and the
  title slot.** Their runs were queued. Then a cleanup batch at 23:20 removed the scratch folder (3.2 GB of vectors,
  caches and `results.json`), treating the job as finished. The scripts here were rebuilt from the session. The
  rebuilt `lab.py` reproduces the words-only row exactly (0.20 / 0.85 / 0.40 / 0.76 / 0.39). The other rows come
  from the run before the removal. Running them again needs about 40 minutes of embedding, and $0.44 for the Haiku
  rows (their cached answers were removed too).
- **A held-out set.** The stack's settings (weight 0.7, BM25 s/(s+10), boost 0.5) were chosen while looking at both
  v3 and LifeBench, so the stack rows are probably a little optimistic. With 17 reworded questions, one question
  moves recall by about 0.06.
- **End-to-end delay.** Haiku delays are medians of single calls, and the stack's two calls are assumed to run in
  parallel. Local delays are from a machine at load 16 to 35.
- **memo itself.** These are scripts over vectors, not memo's store, chunking or words search. memo's rows are
  from the earlier pages.
- **The other nine LifeBench personas, answer accuracy, and Supermemory or Honcho on LifeBench.**
