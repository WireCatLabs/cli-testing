# EmbeddingGemma inside memo (8 November 2026)

## Why this was run

EmbeddingGemma 300M alone finds 0.94 of the 17 reworded questions of the v3 set at @10, more than any hosted engine
here ([`eval_embeddings.py`](../../eval_embeddings.py)). Memo can use it since
[cli-core#2608](https://github.com/WireCatLabs/cli-core/pull/2608) and
[cli-memo#676](https://github.com/WireCatLabs/cli-memo/pull/676). The owner asked how close memo's `search all` gets
to that number with every merged search fix, and, if it is far below, why. The answer decided
[cli-core#2721](https://github.com/WireCatLabs/cli-core/pull/2721).

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 24 threads, 30 GB, Linux 7.0, Node 24.19.0, Python 3.14.4. Other benchmarks shared
  the machine; every embedding job held one machine-wide lock, so only one ran at a time.
- memo built from source, not from npm: cli-memo main (0.131.55 to 0.131.58) with #676, against a packed local build
  of cli-core main (0.608.0, later 0.610.0) plus [cli-core#2667](https://github.com/WireCatLabs/cli-core/pull/2667)
  and each change tried here ([`build.sh`](build.sh)).
- Data: `kg-fixture-v3` (10,444 synthetic records, 46 questions with cited sources) and `kg-fixture-v3-paraphrased`
  (the same 46, 17 of them reworded so they share no words with their record). Stores built by
  [`memo_baseline.py`](../../memo_baseline.py) (`--model`, which now runs `memo models set`).
- Changes were measured on copies of those stores ([`variant.py`](variant.py), [`run-variant.sh`](run-variant.sh)):
  the copy syncs with the new build, which embeds only what its chunk text lacks, then both question sets run.
- Vector-level splits ([`prep.mjs`](prep.mjs), [`vec.py`](vec.py), [`mailvar.mjs`](mailvar.mjs),
  [`precision.mjs`](precision.mjs), [`prec_score.py`](prec_score.py)) use cli-core's own embedder with the question
  as typed, over memo's stored chunks or re-embedded texts.

```sh
python3 ../../memo_baseline.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased \
  --output ~/.cache/wirecat-bench/memo-src-embeddinggemma-v3-paraphrased --memo <memo.js> --model embeddinggemma
./run-variant.sh <label> <cli-core commit>          # build, then both models on store copies
node prep.mjs <store> <out> bare && python3 vec.py <store>
```

## Results

### Memo `search all`, question as typed

| Build | Model | 17 reworded @10 | reworded wording, all 46 @1 / @5 / @10 | own words, all 46 @1 / @5 / @10 | p50 |
|---|---|---:|---|---|---:|
| main + #2667 | e5-small | 0.529 | 0.39 / 0.72 / 0.76 | 0.54 / 0.89 / 0.93 | 1.3 s |
| main + #2667 | EmbeddingGemma | 0.718 | 0.35 / 0.79 / 0.83 | 0.48 / 0.90 / 0.93 | 1.6 s |
| + mail without its sender | e5-small | 0.647 | 0.42 / 0.74 / 0.80 | 0.56 / 0.92 / 0.93 | 1.1 s |
| + mail without its sender | EmbeddingGemma | 0.788 | 0.39 / 0.82 / 0.86 | 0.50 / 0.93 / 0.93 | 1.5 s |
| **+ sender at the end (#2721)** | e5-small | **0.676** | 0.39 / 0.72 / 0.82 | 0.56 / 0.93 / 0.93 | 1.4 s |
| **+ sender at the end (#2721)** | EmbeddingGemma | **0.788** | 0.39 / 0.83 / 0.86 | 0.52 / 0.91 / 0.93 | 2.3 s |
| + sender at the end, `embeddinggemma-full` (full precision) | EmbeddingGemma | 0.800 | 0.34 / 0.81 / 0.86 | 0.50 / 0.91 / 0.93 | 3.5 s |

The six "who" questions (q12, q13, q30, q31, q42, q43): 6 of 6 with the record's own words and 4 of 6 reworded in
every row. One reworded question is 0.059 of the 17-question score. p50 varied with the other jobs on the machine.

Embedding 10,444 records from nothing with EmbeddingGemma: 142 syncs and 624 to 698 s before #2721 (a sync was held
to 39 chunks), 57 syncs and 417 s after (97 chunks). e5-small: 10 syncs, about 70 s. Re-embedding the 4,372 mails
after the re-cut took 7 syncs and 31 to 40 s with e5-small and 43 syncs and 350 s with EmbeddingGemma.

### Note titles: rNNNN or the note's first words (released memo 0.131.61)

Until 8 November the bench named every note file `rNNNN`, after its record id; since 90c8e73 it names it by its first
words, as a person would. The rows above are rNNNN. Four new stores, one per model and naming, built with the
released memo 0.131.61 from npm ([`../../memo_baseline.py`](../../memo_baseline.py) `--note-titles`), then both
question sets on a copy ([`variant.py`](variant.py)):

| Titles | Model | 17 reworded @10 | reworded wording, all 46 @1 / @5 / @10 | own words, all 46 @1 / @5 / @10 | p50 |
|---|---|---:|---|---|---:|
| rNNNN | e5-small | 0.529 | 0.39 / 0.72 / 0.76 | 0.54 / 0.89 / 0.93 | 1.5 s |
| first words | e5-small | 0.559 | 0.39 / 0.70 / 0.75 | 0.52 / 0.87 / 0.91 | 1.1 s |
| rNNNN | EmbeddingGemma | 0.718 | 0.35 / 0.79 / 0.83 | 0.48 / 0.90 / 0.93 | 1.5 s |
| first words | EmbeddingGemma | 0.706 | 0.31 / 0.81 / 0.83 | 0.39 / 0.88 / 0.93 | 2.4 s |

Titles from the first words change @10 by less than one question with either model; the 17-question score moves by
0.03 at most. They cost EmbeddingGemma at @1 (0.48 to 0.39 with the record's own words): the title repeats the
note's opening, so more notes look alike at the top. The numbers of the earlier rows still hold for comparison
among themselves; a new comparison should use first-word titles, the bench default. p50 varied with other jobs.

### Where Gemma's 0.94 went (plain vector search, 17 reworded, @10)

| Vectors | 17 reworded | all 46 |
|---|---:|---:|
| Gemma alone (fastembed, full precision, record text) | 0.94 | 0.93 |
| memo's 4-bit Gemma, record text | 0.871 | 0.887 |
| memo's 4-bit Gemma, memo's stored chunks | 0.729 | 0.835 |
| the same, mail without the leading `Name: ` | 0.847 | 0.878 |
| memo's `search all` on those stored chunks (merge included) | 0.718 | 0.83 |

### The model file (vector level, same texts)

| Weights | Disk | Peak memory | 1,200-char chunks/s | record text, 17 reworded | memo chunks without sender, 17 reworded |
|---|---:|---:|---:|---:|---:|
| e5-small, 8-bit | 135 MB | 0.67 GB | 52.7 | — | — |
| Gemma 4-bit (`model_q4`, what memo ships) | 218 MB | 0.86 GB | 8.3 | 0.871 | 0.788 |
| Gemma 8-bit (`model_quantized`) | 330 MB | 1.9 GB | 3.9 | 0.863 | 0.871 |
| Gemma full precision (`model`) | 1,257 MB | 3.4 GB | 8.6 | 0.941 | 0.824 |

## What it showed

- **The mail sender line cost Gemma most of the gap.** Every mail piece began `Name: Subject`; the model read the
  sender as the topic of each email they wrote. Dropping only that name moved the right records up with both models
  (q35's sources from about 80th to 18th, q17 from 23rd to 8th). Putting it at the end scores as well as dropping it
  with Gemma and better with e5-small, and keeps the name in the vector, so #2721 moves it.
- **The merge loses nothing now.** `search all` (0.718) is within one question of a plain vector search over the same
  chunks (0.729): #2665 and #2667 did their job.
- **The 4-bit weights cost about one question on the record text** (0.941 full precision, 0.871 4-bit). On memo's
  chunk text the order changes from file to file (8-bit 0.871, full 0.824, 4-bit 0.788) within two questions, so
  17 questions cannot rank them. Full precision needs four times the memory at the same speed: worth a separate
  catalogue entry at most, not a replacement. Inside memo it gains less than one question (0.800 against 0.788),
  loses at @1 (0.34 against 0.39) and embeds 10,444 records in 667 s against 417 s.
- **EmbeddingGemma's catalogued speed was 2 chunks a second; it is 5** on the scale where e5-small is 31 (8.3 against
  52.7 measured). memo's sync bound derives from it, so a sync now does real work.
- **Not the cause:** the question text (memo already embeds the question as typed: `plainQuery` quotes `?` and
  `HH:MM`, and a build that passed the raw text gave the same 100 hit lists), chunking (one piece per record: 5,512
  note pieces for 5,512 documents, 4,372 mail pieces for 4,372 emails), the 2,048-token window (records are one
  sentence), the prefixes (the same as the plain-vector run), the similarity floor (0 for Gemma).
- `MEMO_EMBEDDING_MODEL`, which `memo_baseline.py` set before 8 November, was read by no memo version.

## What was not measured

- Real mail, where the body does not repeat the subject and the sender as these records do.
- LifeBench with Gemma inside memo.
- Store sizes beyond 10,444 records; machines other than this one.
