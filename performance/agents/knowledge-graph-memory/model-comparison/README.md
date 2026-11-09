# Larger embedding models against EmbeddingGemma 300M (8–9 November 2026)

## Why

WireCat Memo now lets the owner pick its embedding model, and EmbeddingGemma 300M came out best of four local
models on the v3 records ([section 3 of the November results](../RESULTS-2026-11-07.md)). That comparison left out
the larger multilingual models people usually reach for, and it measured Qwen3-Embedding-0.6B only in its 8-bit
form. The question: **is any larger free local model better than EmbeddingGemma for personal-data search, and at
what cost in time, memory and disk?** The answer decides whether Memo should offer a bigger model than Gemma.

Everything ran on this machine, with vectors only: no word search, no Memo store, no answer model, no paid call.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM shared with other agents' runs, CPU only, 4 threads per run. The runs
  queued behind other agents on one shared lock, but other processes ran beside them, so times carry some noise
  (e5-small took 149 s here against 93 s on 7 November).
- Runtime: fastembed 0.9.1, onnxruntime 1.31.1, Python 3.13.15, full precision (fp32 ONNX) for every model.
- Data:
  - **v3**: the knowledge-graph v3 synthetic set, 10,444 short records (median 94 characters), 46 questions with a
    source record, 17 of them also reworded to share no words with their record (`kg-fixture-v3-paraphrased`).
  - **LifeBench**: persona fenghaoran of [LifeBench](https://github.com/1754955896/LifeBench), a year of synthetic
    phone data: 4,986 records (median 286 characters, longest 3,604), 288 questions with gold evidence. The fixture
    is built by `lifebench/adapter.py` on branch `perf/lifebench-search`.
  - Both are English. **No record or question is Russian**, so this does not measure Russian.
- Scoring: recall@k is the share of a question's source records in the first k, averaged over questions; hit@10
  is the share of questions with at least one source record in the first ten. LifeBench categories come from
  `lifebench/score.py` (branch `perf/lifebench-search`) over the saved top tens.
- Records are embedded shortest first, so a batch pads to similar lengths. This changes the time, not the
  result: EmbeddingGemma re-run this way returns the same top ten for all 348 LifeBench questions as the
  unsorted run of 7 November, in 688 s against 3,061 s. Batch 32 on v3, 16 on LifeBench.
- Each model was first checked against its model card: [eval_models.py](eval_models.py) `--check` embeds the
  card's example sentences and compares the scores the card prints.

| Model | Card check (largest difference from the card's scores) |
|---|---|
| Qwen3-Embedding-0.6B, full precision | 0.0000 |
| Qwen3-Embedding-0.6B-Q (8-bit, the 7 November run) | 0.0032 |
| bge-m3 | 0.0006 (the card used fp16) |
| gte-multilingual-base (onnx-community export) | 0.0000 |
| snowflake-arctic-embed-l-v2.0 | 0.0165, same order; not explained |

Commands, for one model and all of them:

```sh
uv run --with fastembed==0.9.1 python3 -I eval_models.py --model bge-m3 --cache-dir ~/.cache/wirecat-bench/models-compare \
  --fixture ~/.cache/wirecat-bench/kg-fixture-v3 --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased \
  --batch-size 32 --output v3-bge-m3.json
HEAVY_LOCK=<lock file> ./run-all.sh
python3 -I paired.py --fixture ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran \
  --baseline results/lifebench-embeddinggemma-300m.json results/lifebench-*.json
./build-ru.sh            # Russian subset; reads the Anthropic key from the keyring, resumable, stops at $0.90
HEAVY_LOCK=<lock file> ./run-ru.sh
python3 -I paired.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3-ru-build/ru \
  --baseline results/ru-subset-ru-embeddinggemma-300m.json results/ru-subset-ru-bge-m3.json
```

### Models, prefixes and sources

Prefixes are the ones each model card gives. Qwen's instruction is the one the 7 November run used, kept the same
so the full-precision and 8-bit runs compare; its card writes `Query:` with no space and suggests writing your own
task line. A second run used the card's own default line (`Instruct: Given a web search query, retrieve relevant
passages that answer the query\nQuery:`).

| Model | Files | Query prefix | Record prefix | Pooling, dimensions | Truncation |
|---|---|---|---|---|---:|
| [EmbeddingGemma 300M](https://huggingface.co/google/embeddinggemma-300m) | onnx-community/embeddinggemma-300m-ONNX | `task: search result \| query: ` | `title: none \| text: ` | fastembed's, 768 | 2,048 |
| [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) | intfloat, `onnx/model.onnx` | `query: ` | `passage: ` | mean, 384 | 512 |
| [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) | Qdrant/Qwen3-Embedding-0.6B-onnx, `model.onnx` | `Instruct: Given a question, retrieve the record that answers it\nQuery: ` | none | last token, 1,024 | 32,768 |
| [bge-m3](https://huggingface.co/BAAI/bge-m3) (dense only) | BAAI, `onnx/model.onnx` | none (card: not needed) | none | CLS, 1,024 | 8,192 |
| [snowflake-arctic-embed-l-v2.0](https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0) | Snowflake, `onnx/model.onnx` | `query: ` | none | CLS, 1,024 | 512 (its `max_length`) |
| [gte-multilingual-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-base) | [onnx-community export](https://huggingface.co/onnx-community/gte-multilingual-base) | none | none | CLS, 768 | 32,768 |

gte's own repository needs `trust_remote_code` (it runs Python from the repository), so its third-party ONNX
export was used instead; the card check above matched it exactly. Downloaded models live in their own folder
(`~/.cache/wirecat-bench/models-compare`), and every script reading them runs with `python3 -I`.

## Results

| Model | Licence | Languages (card) | On disk | v3 all 46, @5 / @10 | v3 17 reworded, other words, @10 | v3 index time | LifeBench R@10 / hit@10 | LifeBench index time | RAM peak, v3 / LifeBench |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| **EmbeddingGemma 300M** | Gemma Terms of Use | 100+ | 1.2 GB | **0.91** / **0.93** | **0.94** | 420 s | **0.38** / **0.76** | 688 s | 1.0 / 2.3 GB |
| multilingual-e5-small | MIT | ~100 | 0.47 GB | 0.89 / 0.91 | 0.71 | 149 s | 0.26 / 0.59 ¹ | 496 s ¹ | 1.0 GB / not measured |
| bge-m3 | MIT | 100+ | 2.2 GB | 0.89 / **0.93** | **0.94** | 558 s | 0.33 / 0.73 | 1,381 s | 1.9 / 3.2 GB |
| snowflake-arctic-embed-l-v2.0 | Apache-2.0 | 74 | 2.2 GB | **0.93** / **0.93** | 0.82 | 587 s | 0.31 / 0.68 | 1,553 s | 2.1 / 3.0 GB |
| gte-multilingual-base | Apache-2.0 | 70+ | 1.2 GB | 0.80 / 0.83 | 0.71 | 467 s | 0.28 / 0.67 | 526 s | 2.1 / 3.6 GB |
| Qwen3-Embedding-0.6B, full precision | Apache-2.0 | 100+ | 2.3 GB | 0.73 / 0.80 | 0.50 | 1,250 s | 0.25 / 0.60 | 4,304 s | 2.5 / 7.3 GB |
| Qwen3-Embedding-0.6B, full precision, the card's instruction | Apache-2.0 | 100+ | 2.3 GB | 0.84 / 0.85 | 0.53 | 1,186 s | not run | – | 2.5 GB / – |
| Qwen3-Embedding-0.6B-Q, 8-bit (7 Nov) | Apache-2.0 | 100+ | 1.1 GB | 0.71 / 0.80 | 0.50 | 2,694 s | not run | – | not measured |
| multilingual-e5-large (7 Nov) | MIT | ~100 | 2.1 GB | 0.88 / 0.93 | 0.82 | 1,368 s | not run | – | not measured |
| Qwen3-Embedding-4B | Apache-2.0 | 100+ | 8 GB (bf16) | skipped ² | | | | | |

¹ From the 7 November LifeBench run (unsorted batches, so its time is not comparable).
² Skipped without a run. Its full-precision weights are about 16 GB, over the 12 GB limit for this machine. Scaling
the measured 0.6B times by the parameter count (about 6.7 times), it would take about 2.3 h on v3 and about 8 h on
LifeBench. Both figures are estimates, not measurements.

Peak RAM is the process's maximum resident size from `/usr/bin/time -v`. Records and questions both count in the
index and query times; questions take 1 to 75 s.

### Each model against EmbeddingGemma, question by question (hit@10)

"Only model" counts the questions where this model has a source record in its first ten and Gemma does not; "only
Gemma" counts the reverse. p is the exact two-sided sign test on those two counts ([paired.py](paired.py)).

| Model | Set | Questions | Hit@10 | Gemma | Only model | Only Gemma | p |
|---|---|---:|---:|---:|---:|---:|---:|
| bge-m3 | LifeBench | 288 | 0.73 | 0.76 | 15 | 26 | 0.12 |
| arctic-l-v2 | LifeBench | 288 | 0.68 | 0.76 | 10 | 33 | 0.001 |
| gte-multilingual-base | LifeBench | 288 | 0.67 | 0.76 | 19 | 45 | 0.002 |
| qwen3-0.6b | LifeBench | 288 | 0.60 | 0.76 | 13 | 61 | <0.001 |
| e5-small | LifeBench | 288 | 0.59 | 0.76 | 11 | 62 | <0.001 |
| bge-m3 | v3 reworded | 17 | 0.94 | 0.94 | 1 | 1 | 1.0 |
| arctic-l-v2 | v3 reworded | 17 | 0.82 | 0.94 | 1 | 3 | 0.63 |
| gte-multilingual-base | v3 reworded | 17 | 0.71 | 0.94 | 0 | 4 | 0.13 |
| qwen3-0.6b | v3 reworded | 17 | 0.53 | 0.94 | 0 | 7 | 0.016 |

On the 17 reworded v3 questions, one question moves the score by 0.06, so only LifeBench's 288 questions separate
the models with any confidence.

### LifeBench by question category, recall@10 (hit@10)

| Category | Questions | Gemma | bge-m3 | arctic-l-v2 | gte | qwen3-0.6b | e5-small |
|---|---:|---:|---:|---:|---:|---:|---:|
| All answerable | 288 | **0.38 (0.76)** | 0.33 (0.73) | 0.31 (0.68) | 0.28 (0.67) | 0.25 (0.60) | 0.26 (0.59) |
| Single hop | 175 | **0.51 (0.81)** | 0.44 (0.74) | 0.42 (0.72) | 0.38 (0.69) | 0.34 (0.61) | 0.35 (0.63) |
| Multi hop | 104 | **0.18 (0.69)** | 0.16 (0.68) | 0.16 (0.63) | 0.14 (0.63) | 0.11 (0.57) | 0.13 (0.51) |
| Temporal | 46 | **0.16 (0.80)** | 0.15 (0.76) | 0.15 (0.65) | 0.14 (0.78) | 0.13 (0.67) | 0.08 (0.37) |
| Pattern recognition | 49 | **0.18** (0.61) | 0.16 (**0.67**) | 0.13 (0.49) | 0.16 (0.63) | 0.13 (0.59) | 0.14 (0.45) |
| Knowledge update | 48 | **0.33** (0.54) | 0.28 (0.54) | 0.27 (0.50) | 0.31 (**0.58**) | 0.18 (0.38) | 0.23 (0.48) |
| Causal | 39 | **0.18** (0.64) | 0.14 (0.59) | 0.15 (**0.67**) | 0.11 (0.46) | 0.08 (0.49) | 0.12 (0.49) |
| Conflict | 49 | **0.55** (0.96) | 0.44 (0.96) | 0.47 (**0.98**) | 0.29 (0.80) | 0.30 (0.76) | 0.49 (0.94) |
| Hidden information | 12 | 0.02 (0.17) | 0.02 (0.25) | 0.03 (0.25) | 0.03 (0.25) | 0.04 (0.33) | 0.03 (0.25) |

All per-question top tens are in [results/](results/).

## What it showed

1. **No model here beats EmbeddingGemma**, larger or not (gte-multilingual-base is about Gemma's size). On LifeBench, the larger set, Gemma leads every model on recall@10
   overall and in every category but hidden information (12 questions, all near zero). On v3, bge-m3 and arctic tie
   with it, within one question.
2. **bge-m3 is the only close one**: v3 the same as Gemma, LifeBench 0.33 against 0.38 recall@10 and 0.73 against
   0.76 hit@10 (p = 0.12, so the hit gap may be chance; the recall gap holds in every category but hidden
   information). It costs 1.8 times the disk, 2 times the index time on LifeBench and 1.4 times the memory, for a
   result no better. Its MIT licence is the one thing it has over Gemma.
3. **Qwen3-Embedding-0.6B is weak here at full precision too**: 0.50 on the reworded v3 questions, the same as the
   8-bit run, and the slowest model (72 min on LifeBench, 7.3 GB peak). The card check matched to four decimals,
   so I think the model itself suits this data poorly; the 8-bit form was not the cause. The card's own instruction
   lifts the questions in the record's words (0.80 to 0.85 @10) but not the reworded ones (0.50 to 0.53), still far
   below Gemma's 0.94. The instruction wording matters for Qwen; no wording was tuned beyond these two.
4. **Sorting records by length before embedding cuts LifeBench indexing about 4.5 times** (3,061 s to 688 s for
   Gemma) with identical results. Worth checking whether Memo batches this way.

## Russian (9 November)

### Why

The owners who will use Memo write in Russian, so the choice between EmbeddingGemma and bge-m3 should hold there
too (the owner chose a translated subset over waiting for native data). Neither set above has a Russian line.

### Setup

- **Subset of v3**, so Russian is compared with English on the same records: the 46 questions with a source record
  (17 of them reworded), their 65 source records, the 676 other records that Gemma or bge-m3 ranked in an English
  top ten, and random v3 records up to 3,000 (seed 20261109). [build_ru.py](build_ru.py) picks them.
- **Translation**: Claude Haiku 5.5 (`claude-haiku-5-5`), thinking off, effort low, 40 records per call, JSON-schema
  answer; the prompt is in `build_ru.py`. It asks for natural work Russian and keeps names of people, companies,
  projects and places in Latin letters on purpose, as Russian work chats often do. 77 batches, one split in two
  halves after Haiku changed an id twice. **Cost $0.17** (`spent_dollars` in the build's `summary.json`).
- **Three cases**, each with both models: **en** (the English subset, the control), **ru** (Russian questions,
  Russian records) and **mixed** (Russian questions, English records: an owner who asks in Russian about English
  mail). Same machine, fastembed 0.9.1, 4 threads, batch 32.
- **Translation check**, by a script over all 3,000 records and by eye on 10 (4 of them from the split batch):
  every number, amount and e-mail address is the same as in English; 46 records write ISO dates as 21.02.2026
  (the same date). Project names stayed in Latin letters everywhere. **161 records (18 of the 65 source records)
  wrote a person's name in Cyrillic** ("Ким Хейл" for Kim Hale) against the prompt, and one dropped its speaker's
  name. The Russian reads naturally.

### Results

| Case | Model | All 46, @5 / @10 | 17 reworded, other words, @10 | Index time, 3,000 records | RAM peak |
|---|---|---:|---:|---:|---:|
| en (control) | EmbeddingGemma 300M | **0.91** / 0.94 | **0.94** | 81 s | 1.0 GB |
| en (control) | bge-m3 | 0.89 / 0.94 | **0.94** | 272 s | 1.8 GB |
| ru | EmbeddingGemma 300M | **0.80** / 0.85 | **0.82** | 100 s | 1.1 GB |
| ru | bge-m3 | 0.76 / **0.87** | 0.66 | 166 s | 2.0 GB |
| mixed | EmbeddingGemma 300M | **0.75** / **0.88** | 0.86 | 82 s | 1.0 GB |
| mixed | bge-m3 | 0.70 / 0.87 | **0.88** | 361 s | 1.9 GB |

Paired test of bge-m3 against Gemma (hit@10, questions only one of the two finds, exact sign test):

| Case | Set | Gemma | bge-m3 | Only bge-m3 | Only Gemma | p |
|---|---|---:|---:|---:|---:|---:|
| en | all 46 | 0.93 | 0.93 | 0 | 0 | 1.00 |
| en | 17 reworded | 0.94 | 0.94 | 1 | 1 | 1.00 |
| ru | all 46 | 0.85 | 0.87 | 2 | 1 | 1.00 |
| ru | 17 reworded | 0.82 | 0.71 | 2 | 4 | 0.69 |
| mixed | all 46 | 0.89 | 0.87 | 2 | 3 | 1.00 |
| mixed | 17 reworded | 0.88 | 0.88 | 1 | 1 | 1.00 |

Index times queued behind other agents' jobs and vary by up to two times between runs of the same model (bge-m3
took 272 s on English and 166 s on Russian), so read them as rough.

### What it showed

1. **Russian costs both models about 0.07 to 0.09 recall@10** on the same records (Gemma 0.94 to 0.85, bge-m3 0.94
   to 0.87), and Gemma 0.12 on the reworded questions (0.94 to 0.82).
2. **bge-m3 is not better in Russian either.** On all 46 it is one question ahead, on the 17 reworded two behind
   (0.66 against 0.82 recall@10). No difference is significant (every p ≥ 0.69); with 17 and 46 questions only a gap
   of five or more questions would be. Gemma indexed 1.7 to 4.4 times faster with about half the memory.
3. **Asking in Russian about English records works about as well as all-Russian** (Gemma 0.88 @10, reworded 0.86).
4. **The names written in Cyrillic did not cause the drop**, as far as this set shows: 3 of the misses in Russian
   are questions whose source record has such a name, and the English control misses those same 3 questions too.
5. So the decision stays: EmbeddingGemma remains the default, and Russian gives no reason to offer bge-m3.

## What was not measured

- **Native Russian text.** The Russian subset is machine-translated English (see Russian above), with one translator
  and its habits; real Russian chats and mail may score differently. LifeBench was not translated.
- Qwen3-Embedding-4B (see ² above) and anything quantized except the earlier Qwen 8-bit run.
- bge-m3's sparse and multi-vector outputs; only its dense vector was used.
- Inside Memo: these are vectors alone, without Memo's word search, chunking or 4-bit model files.
- Other LifeBench persons; only fenghaoran.
- Timing on a quiet machine.
