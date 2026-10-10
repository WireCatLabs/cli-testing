# Ideas from established search tools

This review inspected publisher documentation and QMD source; it did not install or benchmark the
complete QMD, Typesense or Meilisearch applications. The [matrix](matrix/README.md) benchmarks
our own bounded message-ranking variants inspired by some of their ideas.

A large hybrid footprint does not establish inefficiency. We have not measured complete engines
on equivalent tasks. The [follow-up validation](validation/README.md#cost-and-the-category-choice)
compares the costs and limitations of ranking categories within our own prototype.

## QMD

QMD source was inspected at commit
[93d211f9ef4a869a9aed0d075ca767dda552627f](https://github.com/tobi/qmd/tree/93d211f9ef4a869a9aed0d075ca767dda552627f).
Its [README](https://github.com/tobi/qmd/blob/93d211f9ef4a869a9aed0d075ca767dda552627f/README.md)
separates BM25 keyword search, vector search and a hybrid query pipeline. The documented default
assets are about 300 MB for EmbeddingGemma, 640 MB for Qwen3 reranking and 1.1 GB for query expansion.
Keyword-only search avoids those neural assets; the complete hybrid stack does not meet our modest-download preference.

The [store implementation](https://github.com/tobi/qmd/blob/93d211f9ef4a869a9aed0d075ca767dda552627f/src/store.ts)
fuses lexical/vector lists, gives retrieval results position-dependent protection during reranking,
and caps reranker input at 40. A strong scoped BM25 score plus a gap to second place bypasses query
expansion; it does not establish that all neural work is skipped. Its explain path records stage contributions.

The [model adapter](https://github.com/tobi/qmd/blob/93d211f9ef4a869a9aed0d075ca767dda552627f/src/llm.ts)
uses node-llama-cpp ranking contexts and deduplicates identical effective texts before scoring.
These are useful execution/lifecycle ideas independent of its chosen model sizes.

We tested a position-aware blend and an independently scored BM25-to-40/TinyBERT cascade. These
are adaptations, not QMD reproductions. Our prior candidate recall already warns against blindly
copying a small cutoff. Exact-text caching/grouping is safer than merging similar but potentially
contradictory messages. Score thresholds and weights require our own validation.

## Meilisearch

[Meilisearch's ranking rules](https://www.meilisearch.com/docs/capabilities/full_text_search/relevancy/ranking_rules)
prioritise matched words, typo count, proximity, attributes, sorting and exactness. Rules resolve
ranking in sequence rather than requiring a general semantic model. Its
[typo-tolerance description](https://github.com/meilisearch/documentation/blob/main/resources/internals/typo_tolerance.mdx)
also explains bounded edit-distance matching over an indexed vocabulary.

For our single message-text field, coverage, correction provenance, proximity and exactness can
be signals without a model download. The matrix's `bucket-rules` is a weighted priority heuristic
inspired by this approach, not the engine's full bucket-sort implementation. The 180 earlier
configurations already tested some similar signals; borrowing the idea does not guarantee a gain.

## Typesense

[Typesense's ranking guide](https://typesense.org/docs/guide/ranking-and-relevance.html) describes
text matching using token coverage, edit distance, proximity, field priorities/weights and exact
matches. It also exposes ranking controls for grouping and custom sort signals.

Useful lessons are bounded forgiving matching, visible provenance and explicit precedence between
text relevance and metadata sorting. Sender/chat authority remains an eligibility filter here.
We excluded sender ids, topic names as identifiers, chat ids, message ids and timestamps from learned
features: those would create misleading shortcuts in these synthetic fixtures.

## What we can borrow now

- A genuinely lightweight keyword path that does not load neural models.
- Explainable lexical features and small learned combinations of those features.
- Measured retrieval/model blending, with raw score scales clearly identified.
- Bounded second-stage inference only after measuring shortlist answer/evidence recall.
- Exact effective-text score reuse and persistent model sessions where they help measured workloads.
- Separate stage costs and per-language quality checks.

Candidate-generation changes, query expansion and late-interaction indexes remain separate work.
The current matrix fixes the production candidate pools to compare ranking fairly; its dense
variants test cosine and hybrid scoring inside those pools, not a new semantic retrieval engine.
