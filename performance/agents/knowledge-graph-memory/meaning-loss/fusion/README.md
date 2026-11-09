# Rank fusion across sources in `search all` (8 November 2026)

## Why this was run

cli-core #2667 gives a hit that only word search found the cosine of the hit above it in its source. That way exact
words stay on the page, but it is not the hit's own score. The owner asked for a principled merge:

- give each record its real cosine, a words rank and a meaning rank;
- order by reciprocal rank fusion (RRF);
- measure it against #2667 with e5-small and with EmbeddingGemma.

The bar for merging: beat #2667 on both targets, recall at the 0.618 level and words-only hits in at least 92 of 460
top-ten slots. The change is [cli-core#2742](https://github.com/WireCatLabs/cli-core/pull/2742).

## Setup

- AMD Ryzen AI 9 HX 470, 24 threads, 30 GB, Linux; Node 24.19.0. Other sessions loaded the machine during the runs;
  [`latency.py`](latency.py) alternates scoring on and off per question, so the load cancels out.
- cli-core branch `feat/search-all-rank-fusion`, packed and built into memo from source (memo bundles cli-core). For
  measuring only, the build read `SPIKE_K`, `SPIKE_HEAD` (each source's best hit first), `SPIKE_WM` (meaning weight),
  `SPIKE_NOSCORE` (no computed cosines) and `SPIKE_MERGE=neighbour` (#2667's merge). The PR ships k = 3, no head
  start, and no switches.
- Stores, copied with [`storecopy.sh`](storecopy.sh): `memo-0.131.50-realmail-v3` (e5-small) and
  `memo-src-embeddinggemma-v3` (EmbeddingGemma, built by memo 0.131.55). Both have real mail headers (BUG-618), and
  every chunk has a vector. The Gemma source store was deleted during the runs; the original-wording and guard runs were
  repeated with a copied model.
- Questions: kg-fixture-v3, the 46 with cited records; 17 reworded in kg-fixture-v3-paraphrased.

```sh
python3 run.py <label> <memo.js> <store>/memo reworded|plain SPIKE_K=3 SPIKE_HEAD=0   # one run
python3 guard.py <label> <memo.js> <store>/memo SPIKE_K=3 SPIKE_HEAD=0                # rare-word guard
python3 latency.py <memo.js> <store>/memo 3 SPIKE_K=3 SPIKE_HEAD=0                    # scoring on and off
```

## Results

Recall@1 / @5 / @10; every run is in [`results.jsonl`](results.jsonl), the guard in [`guard.jsonl`](guard.jsonl).

| e5-small | 17 reworded | all 46 | 17 original | all 46 original | words-only in top 10 | guard top 3 |
|---|---|---|---|---|---:|---:|
| #2667 (control) | 0.196 / 0.48 / 0.529 | 0.395 / 0.721 / 0.761 | 0.59 / 0.929 / 1.0 | 0.541 / 0.887 / 0.935 | 108/460 | 5/8 |
| RRF k=3 | 0.196 / 0.51 / 0.618 | 0.424 / 0.725 / 0.793 | 0.62 / 0.959 / 1.0 | 0.58 / 0.891 / 0.935 | 96/460 | 5/8 |
| RRF k=3, no computed cosines | 0.196 / 0.51 / 0.618 | 0.424 / 0.732 / 0.793 | 0.62 / 0.959 / 1.0 | 0.58 / 0.898 / 0.935 | 89/460 | |
| RRF k=60 | 0.255 / 0.451 / 0.51 | 0.446 / 0.703 / 0.725 | 0.62 / 0.971 / 0.971 | 0.58 / 0.895 / 0.895 | 61/460 | 5/8 |
| RRF k=3, meaning ×2 | 0.167 / 0.618 / 0.618 | 0.413 / 0.793 / 0.793 | 0.62 / 0.988 / 1.0 | 0.58 / 0.93 / 0.935 | 45/460 | 4/8 |
| best hit first, then true cosine | 0.196 / 0.50 / 0.618 | 0.395 / 0.728 / 0.793 | 0.59 / 0.988 / 1.0 | 0.541 / 0.909 / 0.935 | 18/460 | 5/8 |

| EmbeddingGemma | 17 reworded | all 46 | 17 original | all 46 original | words-only in top 10 | guard top 3 |
|---|---|---|---|---|---:|---:|
| #2667 (control) | 0.196 / 0.608 / 0.718 | 0.351 / 0.79 / 0.83 | 0.531 / 0.918 / 1.0 | 0.475 / 0.904 / 0.935 | 96/460 | 8/8 |
| RRF k=3 | 0.167 / 0.539 / 0.627 | 0.341 / 0.743 / 0.797 | 0.561 / 0.947 / 1.0 | 0.486 / 0.893 / 0.935 | 102/460 | 8/8 |
| RRF k=60 | 0.196 / 0.451 / 0.51 | 0.359 / 0.703 / 0.725 | | | 63/460 | 8/8 |
| RRF k=3, meaning ×2 | 0.176 / 0.627 / 0.745 | 0.308 / 0.79 / 0.841 | 0.384 / 0.988 / 1.0 | 0.385 / 0.923 / 0.935 | 47/460 | 8/8 |

- **Latency:** computing the cosines for words-only hits adds 26 ms at p50; p95 is unchanged (1,202 against 1,211 ms;
  138 alternating pairs, e5-small).
- **Guard:** 8 questions whose only exact link to their record is a number no other record holds (an invoice or a
  newsletter number) with reworded context. The bar, set before the runs, is the record in the top 3.
- Runs named `e5-control-*` and `e5-cos-h1` are "best hit first, then true cosine": that control's first build
  still computed the cosines. The #2667 control is `e5-c2667-*`.

## What it showed

- **No rule beats #2667 on both models.** RRF k=3 wins with e5-small and loses with EmbeddingGemma on the reworded
  questions (0.627 against 0.718). Weighting the meaning term wins recall with both models, but halves the words-only
  slots and, with e5-small, drops the guard to 4 of 8.
- **The e5 gain is the fusion, not the computed cosines.** k=3 without them reaches the same recall; the cosines add
  words-only slots (89 → 96).
- **A small k matters.** The merged window is 10–20 hits per source, and k=60 flattens it (0.51 with both models). Each
  source's best hit first changes nothing at k=3.
- **q04** finds 1 of 2 with e5-small and 2 of 2 with EmbeddingGemma under every rule; the merge does not move it.
- **Three guard questions miss with e5-small under every rule**: invoices 8784, 2832 and 1178. Their records are not
  in the top 10 at all, so the words half of that store does not find them; EmbeddingGemma's store finds all 8.

## What was not measured

- A store with mail vectors and no note vectors, where the new rule interleaves unembedded notes with mail meaning hits.
- Messenger messages: their words-only hits get no computed cosine (the store scores them by store key, which a hit
  does not carry).
- cli-core#2721 (mail chunk text) changes mail vectors; these stores predate it.
