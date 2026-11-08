# Where memo's search loses what its model finds (8 November 2026)

## Why this was run

On the reworded questions of the knowledge-graph benchmark, memo 0.131.50's `search all` reached recall@10 0.48. A
plain vector search with the same model over the same records reached about 0.71
([`eval_embeddings.py`](../eval_embeddings.py)). The owner asked where the 0.23 goes: the 8-bit model, chunking, the
similarity floor, fusion, per-source caps, the model's prefixes, or something else. The answer decided what cli-core
changes (IDEA-249). The fix is [cli-core#2665](https://github.com/WireCatLabs/cli-core/pull/2665).

EmbeddingGemma inside memo, with these fixes merged, and the mail sender line it found: [gemma-in-memo](gemma-in-memo/README.md).

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 24 threads, 30 GB, Linux. Node 24.19.0, Python 3.14.
- memo 0.131.50 from `~/.cache/wirecat-bench/memo-pkg-0.131.50`, model `e5-small` (multilingual-e5-small, 8-bit ONNX
  from `Xenova/multilingual-e5-small`). Full precision for comparison: `onnx/model.onnx` of
  `intfloat/multilingual-e5-small`, placed in `e5-fp32/onnx/` beside the 8-bit tokenizer files.
- Data: `kg-fixture-v3` (2,000 records, 46 questions with cited sources, 17 of them reworded in
  `kg-fixture-v3-paraphrased`). Store: a copy of `memo-0.131.50-search-v3-paraphrased`, built by
  [`memo_baseline.py`](../memo_baseline.py) before its mail headers were fixed: every mail has sender
  `Synthetic Sender` and subject `rNNNN`.
- Every number is recall@10 of `memo search all <question> --limit 10 --json` against the cited sources.
- The changes were tried in **a patched copy of memo's bundle** ([`patch.py`](patch.py)), switched by environment
  variables, not in a build of cli-core.

```sh
./setup.sh                                   # patched memo copy in memo-pkg/, store copy in store/
node prep.mjs ~/.cache/wirecat-bench/memo-0.131.50-search-v3-paraphrased .   # query vectors, chunk texts
python3 run.py baseline                      # one run; prints recall@10 for the 17 reworded and all 46
python3 run.py fix SPIKE_MERGE=cosine SPIKE_HEAD=1 SPIKE_MAILQ=notes
QSET=plain python3 run.py fix-plain SPIKE_MERGE=cosine SPIKE_HEAD=1 SPIKE_MAILQ=notes   # original wording
python3 summarize.py                         # results.jsonl from the saved replies in runs/
```

Toggles: `SPIKE_FLOOR=0` (notes similarity floor off), `SPIKE_SUM=1` (sum the words and meaning votes instead of the
larger), `SPIKE_MERGE=cosine` with `SPIKE_HEAD=n` (merge: each source's first `n` hits by rank, the rest by cosine),
`SPIKE_MAILQ=1|notes` (mail embeds the question as typed, or the text notes embed), `SPIKE_TRACE_ON=1` (each source's
words, meaning and fused lists, read by [`trace.py`](trace.py)). [`embed_corpus.mjs`](embed_corpus.mjs) re-embeds
every chunk with another text, [`swap.mjs`](swap.mjs) writes those vectors into a store copy, and
[`quant.py`](quant.py) and [`vec.py`](vec.py) score a plain vector search over them.

## Results

| Run | 17 reworded | all 46 |
|---|---:|---:|
| memo 0.131.50 | 0.48 | 0.714 |
| similarity floor off | 0.48 | 0.714 |
| sum the two votes | 0.451 | 0.703 |
| merge by cosine only | 0.471 | 0.717 |
| merge: each source's best hit, then cosine | 0.529 | 0.761 |
| mail embeds the notes text | 0.48 | 0.736 |
| **both of the last two** | **0.618** | **0.793** |
| both, original wording | 1.0 (from 0.941) | 0.935 (from 0.884) |
| both, chunk text without `Synthetic Sender: rNNNN` | 0.765 | 0.848 |

One question is 0.059 of the reworded score. Plain vector search over the same chunks: 8-bit 0.765 and full
precision 0.706 on the record text; 8-bit 0.559 and full precision 0.588 on memo's chunk text.

Per-source traces: [`trace-baseline.md`](trace-baseline.md) and [`trace-fix.md`](trace-fix.md). Every run:
[`results.jsonl`](results.jsonl).

## What it showed

- **The merge across sources took turns by rank** (0.078 of the loss alone). A ten-hit page was the top five of mail
  and the top five of notes, so mail at its third to fifth place fell off behind weak notes.
- **Mail embedded another question text than notes.** It dropped the question mark and `HH:MM`. Alone this gains
  nothing, because the merge did not compare cosines; with the merge fix it adds 0.09.
- **The words memo puts before every chunk cost 0.21 at the vector level** (0.118 of the loss alone). These are the
  fixture's: one sender and an `rNNNN` subject on every mail. Removing only one of the two costs nothing; it is not
  evidence against memo's sender line on real mail. `memo_baseline.py` now writes real subjects and senders (BUG-618).
- **Not the cause:** the 8-bit model (within one question of full precision), chunking (one chunk per record), the
  similarity floor (no source scores under 0.81), per-source caps (depth 100 for mail, 50 for notes; the deepest
  source is at mail rank 69), and the `query:`/`passage:` prefixes (on both sides).
- q12, q17, q32, q35 and q42 are missed by the model alone too: no change inside memo recovers them.
- **Cost of the merge fix:** a hit only words found, below its source's first place, now sorts after every hit meaning
  found. Such hits in the top ten fell from 82 to 13 of 460 slots.

## With real mail headers, and words-only hits (cli-core#2667)

`memo_baseline.py` now gives each mail its record's speaker as sender and its first sentence as subject (BUG-618).
The same runs on a copy of that store, `memo-0.131.50-realmail-v3` ([`realmail.sh`](realmail.sh)). Mail hits are
mapped to records by their Gmail id (`mail_name`), since the subject is no longer `rNNNN`. `SPIKE_WORDS=above|below`
gives a hit only words found the cosine of the hit above or below it in its own source.

| Run | 17 reworded | all 46 | 17 original | all 46 original | words-only hits in top 10 (reworded) |
|---|---:|---:|---:|---:|---:|
| memo 0.131.50 | 0.529 | 0.761 | 0.941 | 0.913 | 74/460 |
| merge + mail text (cli-core#2665) | 0.618 | 0.793 | 1.0 | 0.935 | 15/460 |
| + words-only takes the cosine above (cli-core#2667) | 0.588 | 0.783 | 1.0 | 0.935 | 92/460 |
| + words-only takes the cosine below | 0.588 | 0.783 | 1.0 | 0.935 | 76/460 |

- The real headers alone bring memo from 0.48 to 0.529. #2665 adds the same 0.09 as on the old store.
- Giving words-only hits a cosine brings them back onto the page, more than memo 0.131.50 had. It costs one cited
  source on q04: two words-only mails move ahead of it, and it goes from 9th to 11th.

## Rank fusion across sources (8 November, cli-core#2742)

Replacing #2667's neighbour cosine with reciprocal rank fusion of a words rank and a real cosine rank: it wins with
e5-small (reworded @10 0.529 → 0.618) and loses with EmbeddingGemma (0.718 → 0.627), so it does not ship. Details,
every variant and the scripts: [fusion/](fusion/README.md).

## What was not measured

- A build of cli-core with the fix: the numbers come from the bundle patch.
- `search messages --discover` for chats, which uses the same mail meaning lane.
