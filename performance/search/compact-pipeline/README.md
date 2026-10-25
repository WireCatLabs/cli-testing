# Compact evidence ranking: handoff and CPU feasibility

The owner asked for an actionable handoff that reuses our ranking experiments, favours arithmetic
and compact models, and permits 2–5 GB models only as optional benchmark controls. This package
records the reusable evidence, selected artifact sizes and a small CPU feasibility comparison.
It changes no application dependency, search default, provider connector or owner database.

The private assignment/context is `2026-10-25-compact-evidence-ranking-handoff.md` in cli-private.
It contains the project-specific evidence, scope and next-agent acceptance checklist. This public
package contains synthetic inputs only. The completed smoke is not the requested full new held-out
ranking evaluation: that remains the next agent's implementation assignment.

## Reuse before downloading or implementing

| Existing experiment | Finding to retain |
| --- | --- |
| [Lightweight ranking](../LIGHTWEIGHT-RANKING.md), [23-variant matrix](../matrix/README.md) | Arithmetic, features, linear/pairwise/tree LTR and compact neural scoring were already tested. A 1,345-byte pairwise model improved one fixture, not all tasks. |
| [Robustness](../validation/README.md) | Broad question/proposal/negation cues hurt real answers. Context mattered more than naive role penalties. Frozen learned features did not generalize. |
| [Model-free fresh validation](../model-free/FRESH-VALIDATION.md), [ranking checks](../model-free/RANKING-VALIDATION.md) | Distinguish missing candidates from poor ordering and old templates from new wording. |
| [Compact comparison](../compact/README.md), [supplements](../supplement/README.md) | Reranking can recover answers while losing supporting evidence. Two supplements helped some cases, but byte limits removed apparent gains. |
| [Document rerankers](../local-documents/README.md#rerankers-on-these-queries) | mMARCO and Qwen3 were already compared. mMARCO improved notes at lower cost; document gains were small and exact hits sometimes moved down. This was not held-out evidence. |

Do not reuse an exposed test as a new untouched evaluation. TinyBERT/MiniLM English controls are not
Russian defaults. Earlier top-40/50 cuts discarded answers before neural scoring; test shortlist
recall before adopting a cascade. Existing `local-documents/rerank.mjs` is a historical private-data
workflow, not an instruction to export owner document bodies for this task.

## Categories, ordered by experiment cost

| Category | First experiment | Limitation/check |
| --- | --- | --- |
| Statistical matching | Stemmed BM25/BM25F, term rarity, phrase/proximity, character n-grams | Exact overlap does not establish an answer; don't repeat the same old feature sweep |
| Native context | Scope-checked parent/reply pairs and document sections | A reply is not necessarily agreement; preserve conditions, dates and provenance |
| Fusion and diversity | RRF, exact deduplication, MMR/overlap selection | Preserve contradictory versions; compare fixed bytes and evidence coverage |
| Graph arithmetic | Bounded propagation or personalized PageRank over native/confirmed links | Popularity/graph proximity is not truth; measure degree bias and scope |
| Tiny learned scorer | Linear/pairwise or LambdaMART on query-aware features | Fresh topic/project splits, role-cue ablations, no gold intent/entity-ID leakage |
| Compact cross-encoder | Existing multilingual mMARCO before new models | Measure pair/context support, single/batch drift, RAM and cold/warm cost |
| Late interaction or learned sparse retrieval | ColBERT token matching or SPLADE only after candidate-coverage/cost diagnosis | Include extra index bytes and update cost; English controls don't establish Russian quality |
| Query expansion | Scoped RM3 or variants supplied by the existing agent | Feedback can amplify noise; preserve strict filters and measure drift |
| Finalist support classification | Question/answer/confirmation/condition/conflict with exact evidence | Keep role, support, certainty and truth separate; calibrate abstention separately |

Relevant primary references: [SQLite BM25](https://www.sqlite.org/fts5.html#the_bm25_function),
[rank fusion](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion),
[LightGBM ranking objectives](https://lightgbm.readthedocs.io/en/latest/Parameters.html),
[PyTerrier RM3](https://pyterrier.readthedocs.io/en/latest/terrier/rewrite.html),
[retrieve and rerank](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html),
[PyLate](https://github.com/lightonai/pylate), [FlashRank](https://github.com/PrithivirajDamodaran/FlashRank).
These are approaches/reference tools, not dependencies selected for shipping.

## Artifact shortlist checked 25 October 2026

[models.json](models.json) pins exact selected files, revisions, sizes and SHA256 for the two
explicitly prepared bundles. [candidates.json](candidates.json) retains metadata-only alternatives;
it is not a download list or a claim that all those models were tested. Sizes are decimal MB/GB.

| Candidate | Artifact size | Position in the plan |
| --- | ---: | --- |
| Existing mMARCO multilingual int8 | 135.704 MB selected assets | First compact pair-model comparator; same pinned revision as earlier research |
| BGE v2 m3 community int8 ONNX | 587.812 MB selected assets | New CPU feasibility comparator; upstream publisher FP32 weights are 2.271 GB |
| Jina v2 multilingual int8 | 279.577 MB weights, ~17 MB tokenizer | Optional research; CC-BY-NC-4.0, not a permissive product default |
| Qwen3-Reranker-0.6B | 1.192 GB publisher weights | Already tested historically as ~639 MB Q8; old QMD cache is absent on this machine |
| mxbai-rerank-base-v2 | 0.988 GB publisher weights | Optional multilingual generative scorer, runtime and prompt handling separate |
| AnswerAI ColBERT-small | 34.001 MB int8 weights | English late-interaction control; extra index cost must be counted |
| mxbai-rerank-large-v2 | 3.087 GB publisher weights | Optional 2–5 GB comparison control, never mandatory for ordinary search |
| Qwen3-Reranker-4B | 8.044 GB publisher shards | Outside chosen 5 GB weight budget; a verified quantization is a different artifact |

Weight-only rows exclude tokenizer/configuration and runtime dependencies. Parameter counts do
not predict selected bytes or resident RAM. Publisher model cards:
[mMARCO](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1),
[BGE upstream](https://huggingface.co/BAAI/bge-reranker-v2-m3),
[BGE export](https://huggingface.co/onnx-community/bge-reranker-v2-m3-ONNX),
[Jina](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual),
[Qwen 0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B),
[mxbai base](https://huggingface.co/mixedbread-ai/mxbai-rerank-base-v2),
[mxbai large](https://huggingface.co/mixedbread-ai/mxbai-rerank-large-v2),
[ColBERT-small](https://huggingface.co/answerdotai/answerai-colbert-small-v1),
[Qwen 4B](https://huggingface.co/Qwen/Qwen3-Reranker-4B).
The BGE export links the upstream Apache-2.0 model but declares no license in its own Hub metadata;
export provenance/terms and numerical fidelity still need checking before product adoption.

## Completed synthetic smoke

Why: verify compact-model download and native CPU feasibility, compare a mathematical control with
the known small multilingual model and a larger exported model, and give the next agent a working cache.
No account, project corpus or provider was read. Only 723,516,047 model-asset bytes were downloaded;
no 2–5 GB model or embedding index was installed. No hosted inference or remote model code was run.

Machine: AMD Ryzen AI 9 HX 470, Linux 7.0.0-38 x86-64/glibc 2.43, Python 3.12.13, native CPU ONNX
Runtime 1.23.2, tokenizers 0.22.1, NumPy 2.3.5, four threads, one pair per inference. The exact full
Python environment is in [requirements.txt](requirements.txt) and [requirements.lock](requirements.lock).
Python is benchmark tooling only; no product Python or neural dependency was added.

The frozen [fixture](smoke-fixture.json) has 12 authored EN/RU cases with 4–5 candidates each: launch
date, negation, conditional approval, delivery, missing amount and unresolved conflicting offers.
Eight ask for a fact supplied by a grade-2 answer; four lack a settled requested fact and have
useful grade-1 evidence. Role/label fields never enter scoring. Some candidates include an explicit
parent question with its reply; this smoke does not measure automatic context selection.

| Method | Actual answer@1 | Actual answer@3 | Mean nDCG@3 | Median scoring/query | Maximum scoring/query | Peak worker RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unstemmed shortlist BM25 | 1/8 | 7/8 | 0.7550 | 0.031 ms | 0.113 ms | 28.7 MB |
| mMARCO int8 | 5/8 | 8/8 | 0.8853 | 20.43 ms | 62.37 ms | 579.1 MB |
| BGE int8 export | 1/8 | 8/8 | 0.8056 | 80.65 ms | 118.31 ms | 1192.2 MB |

Answer metrics exclude the four no-settled-fact cases; nDCG includes all 12 with gain `2^grade - 1`.
Each case was scored three times; the median/max span all 36 measurements, including initial inference.
These are not calibrated warm-production p95 values. BM25 uses shortlist statistics and no stemming,
not production discovery or the best earlier mathematical baseline. Peak memory is the whole worker,
not total CLI/application RAM. Setup (mMARCO 2139 ms, BGE 1349 ms) includes imports, model hashing and
session construction; it is not isolated model-load latency. Independent processes were run sequentially.

The larger model was not better at rank one here. This does not establish mMARCO superiority on
independent real questions, full-precision BGE, larger candidate pools, other exports or different
prompt/context boundaries. Labels were self-authored, the set is exposed, and no tuning was done.
No abstention, fact verification or generated-answer accuracy was measured. Every ranker still returns
candidates on missing/conflict cases. Do not interpret a relevance score as answer confidence.

[Retained results](results/) include rankings, raw logits, score timing, input/worker/catalog hashes,
versions and memory; [preparation](results/preparation.json) retains selected download bytes/times.
Preparation was ~5.79 s for mMARCO and ~18.47 s for BGE on this connection, run concurrently and excluding
Python/dependency installation. Models and dependencies are retained outside product state at
`/var/tmp/compact-ranking-1025`; cache lifetime is not guaranteed.

## Reproduce

Run from cli-testing. Commands use fresh temporary state on each line. Choose new result paths;
`smoke.py` refuses an existing output. Scoring opens only explicit synthetic inputs and model files.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T python3 -I performance/search/compact-pipeline/verify.py
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T uv --no-config venv --python 3.12.13 /var/tmp/ranking-benchmark-venv
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T uv --no-config pip install --python /var/tmp/ranking-benchmark-venv/bin/python --require-hashes -r performance/search/compact-pipeline/requirements.lock
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/search/compact-pipeline/prepare.mjs mmarco /var/tmp/ranking-models --download
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/search/compact-pipeline/prepare.mjs bge-int8 /var/tmp/ranking-models --download
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T /var/tmp/ranking-benchmark-venv/bin/python -I performance/search/compact-pipeline/smoke.py --model mmarco --cache /var/tmp/ranking-models --output /var/tmp/ranking-mmarco-new.json
```

Repeat the last command with `--model bge-int8` and a new output, then `--model bm25` without a cache.
`prepare.mjs` downloads only the pinned files, verifies byte counts/SHA256, reuses verified files and
refuses mismatches. Failed partial downloads stay for inspection; do not delete other sessions' caches.
The verifier recomputes scores' metrics and checks input/worker fingerprints without loading models,
opening an archive or accessing the network. It does not rerun neural inference.

## Next comparison and decision

Freeze new development/calibration/evaluation queries split by topic, conversation and project.
Use existing exposed fixtures as regressions, not blind evaluation. Add independently authored
questions, an assessor subset, multiple acceptable evidence sets and complete confirmation pairs.
Compare fixed candidates separately from end-to-end gathering, with identical serialized byte and
specified-token budgets. Keep strict filters and exact-identifier controls intact.

Compare discovery → context → lexical/semantic union → cheap selection/diversity → compact reranker,
one addition at a time. Add learned features only with representative labels. Use one optional
stronger control if a concrete failure remains. Measure shortlist recall, answer/direct-support
precision and rank, complete pairs/conflicts, duplicate/off-question bytes, abstention trade-offs,
cold/warm stage costs, model/runtime/index bytes, whole-process peak RAM and reviewer effort.

A query/answer-role classifier is a supporting signal, not a truth oracle. Genuine answers can be
questions, negative or conditional; approval of a heading does not approve its contents. Keep raw
source provenance, dates, reported/inferred state and uncertainty. Preserve conflicting evidence.
Common ports/budgets/context/ranking belong in Core with thin connectors; the benchmark does not
justify shipping a new model or changing any public default yet.
