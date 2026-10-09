# Lightweight ranking comparison

This matrix compares **23 ranking variants plus the unchanged retrieval-order baseline** on frozen
production candidate pools. It adds a fresh synthetic holdout and measures actual-answer success,
evidence recall, graded ordering, missing-fact failures, latency and native CPU memory. It does not
switch public search defaults or reproduce the complete applications reviewed in
[the tool research](../TOOL-RESEARCH.md).

## Inputs and protocol

The archive contains the original 2,616 invented messages plus 1,452 fresh messages: 4,068 total.
The fresh fixture has six new topic families, three English and three Russian, each with two
useful messages and 240 distractors. It changes the wording and includes cancelled approvals,
unanswered proposals, training examples and confirmations of headings rather than facts.
[generate-fresh.py](generate-fresh.py) reproduces [fresh.json](fresh.json).

The 144 query groups comprise 48 original dev keyword queries, 12 original dev question diagnostics,
72 fresh keyword queries and 12 fresh question diagnostics. Fresh keyword results have 60 answerable
queries and 12 no-answer queries. The six missing-fact question diagnostics have manual topic anchors
and are a separate, deliberately harder measurement.

[export.ts](export.ts) drives the explicitly selected cli-messaging build against a new temporary
synthetic SQLite store, retrieving up to 300 candidates with fixed fusion settings and no lexical
reranking. It retains production scope/filter eligibility and records whether reranking is allowed.
Every variant preserves strict explicit-syntax order. It removes answer-containing `intent` from
inputs; only queries and message text enter inference. Relevance labels are used for offline dev
training and evaluation, never as scorer inputs.

The fresh fixture was frozen before fitting/evaluation. Supervised models use only original dev
queries or original dev candidate messages. Learned features exclude sender/chat/message ids and
timestamps. Archive text supplies unsupervised vocabulary and term statistics, as an indexed archive
normally would. Dev scores for trained models are training diagnostics, not independent validation.

The initial pass identified a dynamic-int8 batching discrepancy. Unbatched neural variants were added
as follow-up execution checks on the same holdout; no supervised hyperparameters or labels were tuned.
[provenance.json](results/provenance.json) distinguishes that follow-up from the original comparison.
The fresh set is now exposed and must not be reused for later tuning presented as a new blind evaluation.

## Approaches tested

| Category | Variants |
|---|---|
| Lexical formulas | BM25, stem BM25, word TF-IDF |
| Matching features | Character TF-IDF, fuzzy/proximity combination, weighted bucket-style priority rules |
| Learning to rank | Linear feature regression, pairwise logistic feature ranking, small LambdaMART tree ranker |
| NLP role signals | Handwritten proposal/decision/support rules, word n-gram Naive Bayes, character n-gram logistic classification |
| Small neural ranking | TinyBERT and MiniLM-L6, current multilingual model under native CPU; full-pool and single/batch checks; TinyBERT position blend and BM25-to-40 cascade |
| Dense representation scoring | Existing e5 cosine, e5/BM25 reciprocal-rank fusion, e5/BM25 fixed score blend |

Dense variants reorder these same pools. They do not measure semantic candidate generation or a
late-interaction index. NLP classifiers provide role features; they are not general answerability
models. The BM25 top-40 shortlist retains only 42.5 percent of original dev evidence, versus 90 percent
in the full pool; the cutoff is not safe to adopt.

The bucket/position variants are inspired by Meilisearch/QMD, not engine implementations.

## Fresh keyword results

These percentages apply to this new fixture, not the old 43.75 percent held-out recall measurement.
The fresh retrieval baseline is already substantially stronger; its answerable candidate recall
is 90 percent. No scorer can restore the paraphrase evidence absent from the pool.

| Method | Evidence Recall@10 | Actual answer @1 | Actual answer @10 | nDCG@10 | Warm ranking p95 |
|---|---|---|---|---|---|
| Retrieval order | 78.3% | 15.0% | 66.7% | 0.626 | No second-stage scoring |
| BM25 | 78.3% | 10.0% | 66.7% | 0.616 | 0.66 ms |
| Word TF-IDF | 45.0% | 10.0% | 40.0% | 0.367 | 0.77 ms |
| Fuzzy/proximity | 77.5% | 15.0% | 65.0% | 0.617 | 18.70 ms |
| Linear feature regression | 75.0% | 15.0% | 63.3% | 0.603 | 18.82 ms |
| Pairwise feature ranker | **85.0%** | **31.7%** | **80.0%** | **0.729** | **18.76 ms** |
| LambdaMART | 85.0% | 20.0% | 80.0% | 0.706 | 18.79 ms |
| Handwritten role rules | 85.0% | 10.0% | 80.0% | 0.685 | 18.70 ms |
| Naive Bayes role signal | 58.3% | 23.3% | 60.0% | 0.512 | 20.71 ms |
| Character logistic role signal | 58.3% | 10.0% | 53.3% | 0.473 | 28.89 ms |
| TinyBERT, batch 16 | 54.2% | 18.3% | 45.0% | 0.429 | 79.81 ms |
| TinyBERT position blend | 77.5% | 15.0% | 65.0% | 0.573 | 79.80 ms |
| MiniLM-L6, batch 16 | 55.0% | 28.3% | 55.0% | 0.499 | 738.75 ms |
| Current multilingual model, native batch 16 | 65.8% | 35.0% | 65.0% | 0.598 | 591.48 ms |
| BM25 top 40 → TinyBERT | 57.5% | 21.7% | 50.0% | 0.478 | 28.14 ms |
| e5 cosine | 50.0% | 18.3% | 48.3% | 0.416 | 3.14 ms |
| e5/BM25 RRF | 61.7% | 18.3% | 55.0% | 0.505 | 20.61 ms |
| e5/BM25 score blend | 76.7% | 10.0% | 63.3% | 0.597 | 20.61 ms |

All variants return zero hits on the fresh keyword no-answer cases, where retrieval produces no
candidates. This does not establish missing-fact rejection. Every raw ranker returns 60 false hits
on the six manually anchored missing-fact questions: ten per query. This matrix deliberately applies
no score floors or abstention, unlike the earlier thresholded question experiment.

The pairwise model finds the actual answer in the first ten for 48/60 queries rather than 40/60;
first-place actual answers increase from 9/60 to 19/60. For the 42 implicit answerable requests,
answer @10 increases from 66.7 to 85.7 percent. The strict requests retain their old order.
English answer @10 is unchanged at 90 percent; Russian increases from 43.3 to 70 percent.
There are only six topic families, with correlated query variants: these gains need broader validation.

## Disk, RAM and runtime

The trained [pairwise scorer](results/pairwise.json) occupies **1,345 bytes** of JSON weights/scaling
metadata. [Linear weights](results/linear.json) occupy 1,830 bytes; the
[LambdaMART model](results/lambdamart.txt) is 58,505 bytes. These sizes exclude feature code, corpus
statistics and execution libraries. The linear score is a dot product after scaling; its exported
JSON reproduces the training library's inference numerically. It does not inherently require
shipping Python, scikit-learn or neural weights. A TypeScript production port is still future work.

Native inference uses ONNX Runtime 1.23.2, four CPU threads and Rust tokenizers on an AMD Ryzen
AI 9 HX 470. The worker starts around 66 MB resident RAM. Peak values below use Linux `/proc`
VmHWM for that process; raw resource-usage RSS is retained separately because fork/exec accounting
can include an earlier high-water value. These are whole research-worker processes, not model-only
allocations or performance promises for weaker PCs.

| Model/execution | Selected model assets | Load time | Peak worker RAM |
|---|---|---|---|
| TinyBERT, batch 16 | 5.23 MB | 24.9 ms | 142.5 MB |
| TinyBERT, one pair at a time | 5.23 MB | 29.6 ms | 95.3 MB |
| MiniLM-L6, batch 16 | 23.91 MB | 77.2 ms | 226.7 MB |
| MiniLM-L6, one pair at a time | 23.91 MB | 59.1 ms | 120.5 MB |
| Current multilingual reranker, native batch | 135.7 MB | 440.6 ms | 587.9 MB |
| Existing e5, native | About 135.4 MB, already cached | 413.0 ms | 586.7 MB |

Small-model preparation fetched only 29.15 MB total. Measured complete preparation was about
2.44 seconds for TinyBERT and 3.04 seconds for MiniLM-L6 on this connection, including metadata and
verification. The Python benchmark environment is separate development tooling; its dependency
install is not included in those model totals. No QMD, Qwen/Jina, or other large alternative weights
were downloaded. Existing multilingual/e5 caches were verified and reused.

Ranking p95 excludes model loading and index construction. Pure lexical timings cover their own
score calculation plus sorting. Matching/feature/NLP timings include shared feature preparation;
this is a conservative harness cost and includes signals some variants do not use. Dense hybrid
costs include that preparation plus query encoding/comparison. e5 message encoding took about
3.7 seconds and is a separate reusable preparation cost; its index was built only for needed candidates.
Lookup plus pairwise ranking p95 was about 34.5 ms in the retained run. These are one lab run's
observations on a small archive, not production p95 on an owner's full message store.

Dynamic-int8 batches changed logits and some within-probe orderings, so batching is not assumed
score-equivalent. The unbatched follow-up keeps the same answer @10 for the multilingual model
and changes first-place answer success to 36.7 percent, with ranking p95 about 1,018 ms. TinyBERT
single-pair p95 is 139 ms; MiniLM-L6 is 901 ms. Full details and the eight-pair equivalence probes
are in [report.json](results/report.json).

## Reproduce

Run from the cli-testing checkout with a freshly built prototype cli-messaging checkout selected
explicitly. Stores, weights and outputs stay outside real account paths. Use a new output directory;
completed neural scores may be reused only after verifying input, worker and model manifest hashes.

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" matrix-typecheck
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" candidates > /tmp/search-matrix-candidates.json
uv venv --python 3.12.13 /tmp/search-matrix-venv
uv pip install --python /tmp/search-matrix-venv/bin/python --require-hashes -r performance/search/matrix/requirements.lock
python3 performance/search/matrix/prepare-models.py /tmp/search-matrix-models
python3 performance/search/message-search/prepare-reranker.py /tmp/search-multilingual-reranker
/tmp/search-matrix-venv/bin/python performance/search/matrix/test_metrics.py
/tmp/search-matrix-venv/bin/python performance/search/matrix/matrix.py \
  --input /tmp/search-matrix-candidates.json \
  --models /tmp/search-matrix-models \
  --current-model /tmp/search-multilingual-reranker \
  --embedding-cache /absolute/path/to/already-installed/e5-small \
  --output /tmp/search-matrix-results
```

The two small model revisions/checksums are recorded in [models/tinybert.json](models/tinybert.json)
and [models/minilm-l6.json](models/minilm-l6.json). The e5 files are pinned by the selected build;
this runner does not install it. Current reranker preparation is optional if its verified cache
already exists. All inference is offline; only explicit preparation/install steps use the network.

## Evidence and next step

[results/report.json](results/report.json) contains all methods, raw displayed ids, per-language
and implicit-query breakdowns, metrics and stage/resource measurements. The candidates, worker
scores, launch metadata, exported models and source/input hashes are retained beside it. Historical
reports in `message-search/` were not overwritten. Independent metric tests cover support versus
actual answer, graded discounts, missing evidence, cutoffs and no-answer denominators.

The strongest lightweight direction from this comparison is the pairwise feature scorer. Validate
it on more varied, fresh topics with independent labels before porting it into production. In
particular, challenge its negative/proposal cues with genuine decisions containing negation,
contradictions, terse replies and thread context. Add dev-only abstention calibration and fresh
missing-fact validation separately. A tiny file is valuable only if those tests preserve quality.
