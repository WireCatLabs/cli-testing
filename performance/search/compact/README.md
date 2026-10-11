# Compact reranking

Use this comparison to decide whether a small model should reorder search results or supply extra
evidence. Two pretrained models improve some answer metrics, but neither preserves enough
supporting evidence to replace discovery's current order. No production ranking or download
behavior changes in this experiment.

## What we tested

The inputs are the retained 300-candidate pools from three existing synthetic sets: 80 template
questions, 24 fresh scenarios and 24 permission-question cases. They are exposed development
controls, authored and judged by the same agent; this is not independent human validation.
Inference receives only query text and candidate text. Relevance labels enter the evaluator only.

The eight older answers missed by the top ten are all at rank **62**. A top-40 reranker would
exclude them. We compare 100 and 300 candidates, body-only and parent-plus-reply text, and single
pairs versus batches of 16. Parent text is used only when the same-chat parent is in the eligible
pool. Models, revisions, assets and Python dependencies are pinned and checksum-verified.

[Protocol](PROTOCOL.md) distinguishes the fixed neural/RRF comparisons from the later exploratory
merges. Russian model scores are diagnostics; the applicable English-only variants retain the
original Russian ordering. No training or answer-confidence threshold is applied.

## Replacement ranking loses evidence

These results use parent context, 100 candidates and single-pair inference, with Russian fallback.
The table shows the older 56-answer control. Evidence Recall counts useful support and conflicts
as well as answers; nDCG rewards their positions.

| Order | Actual answer in ten | Evidence Recall@10 | nDCG@10 |
|---|---:|---:|---:|
| Existing discovery | 48/56 | 90.6% | 0.823 |
| TinyBERT | 51/56 | 74.2% | 0.767 |
| MiniLM-L6 | 52/56 | 81.3% | 0.848 |

MiniLM-L6 moves all four previously missed English answers to first place; the four Russian misses
remain. On the fresh set, actual answers at rank one rise from 2/16 to 6/16; on the permission set,
from 5/16 to 6/16. Those gains do not erase the loss of supporting messages on the older control.

Body-only scoring loses useful reply meaning. Equal reciprocal rank fusion and preserving the
first three lexical hits also fail the evidence-retention gate. None of the replacement variants
passes all answer, MRR, evidence recall and nDCG regression checks across the three controls.
Partial hits on questions without labeled evidence remain; this is not answerability detection.

Batching changes the quantized scores and sometimes the order. The worker records a single/batch
comparison, and quality is measured separately for both execution modes. Single-pair results
cannot stand in for a batched production implementation.

## An alternative: supplement the evidence

[Follow-up validation](../supplement/README.md) tests new crowded cases and delivery boundaries.
It records an ordering regression and the stable merge that fixes it on the measured controls.

After seeing the support loss, we tried a separate output design: keep the existing ten unchanged
and add two distinct model-selected messages within a **12-result** budget. MiniLM-L6 supplies
English supplements; Russian queries keep the baseline twelve.

| Older control, same 12-result budget | Actual answer in twelve | Evidence Recall@12 |
|---|---:|---:|
| Existing discovery | 48/56 | 90.6% |
| Baseline ten + two MiniLM selections | 52/56 | 93.8% |

The original ten remain unchanged, so Answer@10 is still 48/56. The additional English answers
reach positions 11 or 12; this is richer evidence, not improved first-place or top-ten ordering.
The other two controls preserve their quality metrics. At twelve results, the older questions
without labeled evidence still return 192 partial hits, as does the baseline twelve; the newer
missing-evidence cases still return six. Supplements do not establish that an answer exists. TinyBERT's two supplements do not recover
the older missing answers in this design.

This is exploratory: it was devised after inspecting results and has not passed a new untouched
fixture or a real client implementation. It needs validation on diverse conversations and a fixed
response-byte budget before becoming an optional product feature. It would require an explicit
English model choice or reliable language handling, bounded CPU work and an explicit model setup.
The existing model-free search remains available without downloads.

## Download, CPU and RAM

Measured on Linux, Python 3.12.13, ONNX Runtime 1.23.2, four CPU threads, AMD Ryzen AI 9 HX 470.
Values below cover the context/single-pair/100-candidate worker; scoring p95 uses English questions
in the older control. They do not predict slower PCs or a future Node implementation.

| Resource | TinyBERT | MiniLM-L6 |
|---|---:|---:|
| Quantized weights | 4.52 MB | 23.20 MB |
| Weights + tokenizer/configuration | 5.23 MB | 23.91 MB |
| Preparation on this connection | 2.26 s | 4.33 s |
| Worker model load | 36.3 ms | 92.8 ms |
| Warm scoring p95 | 55.1 ms | 302.3 ms |
| Whole-worker peak RSS | 102.8 MiB | 129.8 MiB |

MB means decimal bytes; MiB means 1,048,576 bytes. The model assets exclude the development Python
environment and execution libraries. Worker RSS includes Python, tokenizer, model and evaluation
inputs; it excludes the CLI process. This is not whole-application RAM or end-to-end search latency.
Model loading and index/retrieval costs are separate from warm pair scoring. Only 29.15 MB of model
assets were downloaded; no large model or embedding index was installed.

## Reproduce and evidence

From cli-testing, create the pinned benchmark environment and explicitly prepare the two models:

```sh
uv venv --python 3.12.13 /tmp/search-ranking-compact-venv
uv pip install --python /tmp/search-ranking-compact-venv/bin/python --require-hashes \
  -r performance/search/matrix/requirements.lock
python3 performance/search/matrix/prepare-models.py /tmp/search-ranking-compact-models
python3 performance/search/compact/export.py --output /tmp/search-ranking-compact-inputs
```

The export verifies retained fixture/report hashes and strips relevance labels. Run the matrix
worker with `body.json` or `context.json`, batch size 1 or 16, and each pinned model manifest.
For the 100-candidate run, add `--shortlists` with the matching `*-top100.json` file. For example:

```sh
mkdir -p /tmp/search-ranking-compact-scores
/tmp/search-ranking-compact-venv/bin/python performance/search/matrix/neural.py \
  --input /tmp/search-ranking-compact-inputs/context.json \
  --cache /tmp/search-ranking-compact-models/minilm-l6 \
  --manifest /tmp/search-ranking-compact-models/minilm-l6/manifest.json \
  --batch-size 1 --threads 4 --shortlists /tmp/search-ranking-compact-inputs/context-top100.json \
  --output /tmp/search-ranking-compact-scores/minilm-l6-context-batch1-top100.json
python3 performance/search/compact/evaluate.py --scores /tmp/search-ranking-compact-scores \
  --output /tmp/search-ranking-compact-report.json
```

[Report](results/report.json) retains all execution summaries, selected per-query traces, model
manifests and source/input hashes. [Raw-artifact manifest](results/raw-artifacts.json) identifies
the full retained worker outputs under `/tmp`; the commands regenerate them. Independent existing
matrix metrics agreed on all 1,024 selected query traces. No real account or owner archive is read.
