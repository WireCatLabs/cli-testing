# Ranking 300 candidates with a small footprint

The preferred next investigation is a simple CPU ranking solution with a modest download and RAM
footprint. Large models remain optional research comparators. We should not make a 1 GB download
or a 1 GB resident process the default requirement just because it improved a benchmark.

## Which model did the resource table describe?

The measured model is **cross-encoder/mmarco-mMiniLMv2-L12-H384-v1**, pinned in
[reranker.json](message-search/reranker.json). Its quantized ONNX weights occupy 118.6 MB;
weights, tokenizer and configuration together occupy 135.7 MB. The resource probe measured about
1.33 GB peak resident RAM for the whole Node/WASM process using that model.

The approximately 1.19 GB Qwen/Jina weights and 1.75 GB Kev base in the broader research table
belong to different models. They are not downloads required by the current experiment. We have
not installed them. Weight-file size and process RAM must be reported separately for each model.
The present process-memory result does not establish that every 136 MB reranker needs 1.33 GB;
a runtime allocation breakdown and native-runtime comparison remain unmeasured.

## A reranker is a task, not necessarily a large neural model

Input: a query and 300 eligible messages. Output: a score/order for those messages. A reranker can
use a mathematical formula, a small learned feature model or a neural text-pair model. It need
not build a universal embedding index or generate text.

A neural cross-encoder reads each query-message pair together and predicts relevance. Its training
teaches it which passages help answer queries. The result is a numeric score, not an answer or
proof that the message contains the requested fact. This is the task our current MiniLM already
performs. See the [Sentence Transformers training overview](https://sbert.net/docs/cross_encoder/training_overview.html).

Having only 300 candidates limits the number of computations. It does not resolve the ambiguity
between “retention agreed at 30 days” and “should retention be 30 days?”. A purely lexical score
can struggle with that distinction. We should measure whether that limitation matters enough to
justify a small neural model, rather than assume it does.

## Categories worth checking, from simplest upward

| Category | What it calculates | Download/training requirements | Main limitation |
|---|---|---|---|
| Lexical scoring: BM25, TF-IDF | Query-term matches weighted by rarity and document length | No pretrained neural weights; needs corpus statistics | Shared words do not guarantee an answer; misses differently worded concepts |
| Text-matching features | Coverage, phrase adjacency, token distance, character n-gram overlap, typo distance | Algorithms and small language resources where needed | Handwritten weights and language cues can be brittle |
| Feature-based learning to rank | Learns how to combine matching signals using linear weights or decision trees | Needs representative labelled query-message groups; model size depends on chosen feature/tree budget | Cannot learn semantic distinctions absent from its features; easy to overfit a small fixture |
| Small neural cross-encoder | Reads the query and message together and predicts relevance | Compact pretrained weights, tokenizer and runtime | Repeated inference per candidate; language coverage and RAM must be measured |
| Text classifier or linguistic analyser | Tags proposal/decision/question, entities or sentence structure | Rules or task-specific trained resources | Supporting feature extraction, not automatically a query-relevance ranker |
| Dense or late-interaction retrieval | Compares precomputed message representations with the query | Neural weights and an additional index | Useful for candidate coverage, but not required merely to reorder this shortlist |

[SQLite's BM25 documentation](https://www.sqlite.org/fts5.html#the_bm25_function) describes a
standard lexical relevance calculation. This is a method to evaluate; it does not mean the
existing custom word-index implementation already exposes SQLite FTS5 scores.
[TF-IDF and character n-grams](https://scikit-learn.org/stable/modules/feature_extraction.html#text-feature-extraction)
can be computed without downloading pretrained embeddings. Their vectors represent text counts,
not learned universal semantic representations.

For a learned feature ranker, [LightGBM](https://lightgbm.readthedocs.io/en/latest/Parameters.html)
provides ranking objectives including LambdaRank and rank_xendcg. Training happens offline on dev
query groups; evaluation labels are not inputs during inference. A shipped linear scorer could
be a small set of numbers, while a tree scorer's size depends on its number and depth of trees.
The training library need not dictate the shipped inference runtime; export/runtime support still
needs checking. No such model has been trained or sized here yet.

[fastText](https://fasttext.cc/docs/en/supervised-tutorial.html) illustrates lightweight text
classification. A generic question/decision classifier could provide a feature, but it is not
already trained to rank messages against arbitrary queries. Stopword removal, stemming, tokenising
and entity extraction are also tools for matching/features, not complete relevance judgments.

## Small pretrained rerankers we can test first

Publisher Hub metadata checked on 2026-10-09 gives these selected assets. The totals include one
quantized ONNX file, tokenizer.json, tokenizer_config.json, config.json and special_tokens_map.json.
They exclude the runtime/dependency download and do not predict RAM.

| Candidate | Quantized weights | Selected asset total | Language/scope |
|---|---|---|---|
| TinyBERT-L2-v2 | 4,518,068 bytes, about 4.52 MB | 5,231,713 bytes, about 5.23 MB | English; smallest first experiment |
| MiniLM-L6-v2 | 23,200,716 bytes, about 23.20 MB | 23,914,368 bytes, about 23.91 MB | English; next quality/size comparison |
| Current multilingual MiniLMv2 | About 118.6 MB | About 135.7 MB | Existing multilingual quality comparator; current runtime exceeds the desired footprint |

Publisher file listings:
[TinyBERT](https://huggingface.co/cross-encoder/ms-marco-TinyBERT-L2-v2/tree/81d1926f67cb8eee2c2be17ca9f793c7c3bd20cc/onnx),
[MiniLM-L6](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2/tree/233902d25c440f23af6f7d6e94d2946bac0bee0a/onnx).
These models are older, established task-specific rankers; a modern release date is not a
requirement for this comparison. RAM and CPU timings here are unknown until measured.
The [publisher performance table](https://www.sbert.net/docs/pretrained-models/ce-msmarco.html)
uses GPU timings, which must not be presented as laptop CPU predictions.

[FlashRank](https://github.com/PrithivirajDamodaran/FlashRank) demonstrates the small CPU/ONNX
approach and uses a TinyBERT-family model as its tiny default. It is a library around models,
not a separate universal 4 MB model that covers every language. We can examine its execution
approach without introducing a Python inference dependency into the shipped TypeScript CLI.

English-only controls answer whether compact pair models help at all. They do not qualify as the
default for Russian messages. Score Russian and English separately, retain the lexical baseline
for unsupported languages, and research/train a suitable compact multilingual model if the tiny
controls justify that further work. Do not silently drop multilingual support to meet a file budget.

## What the earlier experiments did and did not reject

The 180 lexical configurations varied fusion constants, depth, coverage/proximity/phrase signals
and chat caps. They produced identical dev top-ten quality. That is evidence against those tested
signals and combinations, not proof that BM25, sparse features or learned feature ranking cannot
help. We have not run the latter experiments.

The e5 experiment tested cosine similarity as the final reranker and failed dev quality. It did
not establish a need for larger universal embeddings. The joint multilingual reranker showed
that more detailed query-message comparison can help, but its current memory/latency costs are
not acceptable evidence for a lightweight default.

## Comparison and further validation

The [matrix](matrix/README.md) measures the approaches below. The
[robustness validation](validation/README.md) exposes brittle negation/proposal cues in its frozen
feature model. Lexical ranking plus eligible context is the cheapest default direction; a better
trained feature ranker remains an option requiring fresh validation.

1. Keep the same scoped 300-candidate pool. Evaluate BM25/term-rarity scoring and character/phrase
   features, using archive statistics where applicable and keeping explicit syntax strict.
2. Add a small linear or tree feature ranker only with sufficiently varied dev labels. Compare it
   against the formula baseline, with fresh topic holdouts rather than memorising fixture templates.
3. Test TinyBERT, then MiniLM-L6, using only their selected pinned assets. Measure full-process RAM,
   load time and scoring all 300 candidates on CPU; record tokenizer/runtime overhead separately.
4. Compare the resulting quality/footprint tradeoff by language. Keep larger models optional until
   a concrete small-model limitation justifies testing them.

Do not reduce the shortlist to 50 by truncating the current order: dev evidence recall drops from
90 percent at 300 to 43.75 percent at 50. A cascade becomes credible only when its inexpensive
stage preserves actual answers and evidence before the stronger model sees the finalists.

Report actual-answer Success@1/3/10, graded nDCG, evidence recall, no-answer hits, per-language
results, cold/warm latency, peak RAM and complete asset bytes. A small download is not a speed
measurement. Resource limits should be explicit experiment constraints, with current quality gates
retained rather than quietly weakened. The initial size inspection downloaded no weights. The subsequent [comparison matrix](matrix/README.md)
explicitly prepared the two small models, compared all six categories and recorded CPU/RAM results.
