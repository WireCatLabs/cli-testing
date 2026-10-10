# Model-free question search

This prototype tests a complete path from the user's question to ranked messages. It needs no
neural weights, embedding cache or inference runtime. It runs the selected cli-messaging build
against a newly created synthetic SQLite store; it never opens an existing account store.

## What changed

The earlier robustness test retrieved candidates using hand-written keyword anchors. This test
passes the question itself, with no manually supplied keywords or chat hints, for the headline
question results. A small English/Russian planner removes question scaffolding and produces at
most two lexical variants. Unknown qualifiers remain present in each variant. Bounded domain
aliases cover refunds and log retention; this is explicit vocabulary, not general semantic search.

The three modes share the same store and questions:

| Mode | Retrieval and ordering |
|---|---|
| Direct | Original question sent to existing internal combined search; original ordering |
| Question | Planner variants, combined lexical retrieval, stemmed BM25 |
| Context | Question mode plus eligible direct replies, scored with their parent's text |

Each retrieval uses depth 300. Variant results merge by reciprocal rank fusion and retain at most
300 candidates. Context proposes at most 100 additional direct replies, keeping the final pool
within 300. Both parent and reply must satisfy the requested account, chat, sender, date and
`only` constraints. Eligibility explicitly selects Lucene because the public SDK's legacy default
would not enforce these constraints in the same way. A chat restriction inferred from actual
single-chat candidates accelerates eligibility; no fixture chat annotation supplies it.

BM25 uses corpus document frequencies, average length, term counts and the build's English/Russian
stemmer, with k1=1.2 and b=0.75. Parent and reply counts combine without repeatedly stemming
message bodies. Scoring is bounded to 8 MiB of body text per query. These are relative relevance
scores, not probabilities that an answer exists. There is no trained feature model or score floor.

Explicit Boolean syntax, quoted phrases, wildcards, AST requests, exact matching and newest
ordering retain the underlying service behavior. Tests cover planner invariants; store integration
also checks strict result ordering, sender/date reply eligibility, cancellation, text/AST conflicts
and questions without a question mark.

## Quality results

The fixture contains 6,944 messages, 16 topic families and 320 queries. Four extra runtime messages
exercise sender/date eligibility. Eight topics calibrate the planner and eight provide a topic
holdout, with English and Russian represented equally. The headline holdout has 80 questions:
56 with actual answers, eight unresolved conflicts, eight missing facts and eight unknown
qualifiers. Keyword and explicit-scope controls are separate from these headline results.

| Mode | Answer in candidates | Answer@1 | Answer@3 | Answer@10 | MRR@10 | Evidence Recall@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| Direct | 0% | 0% | 0% | 0% | 0 | 0% | 0 |
| Question | 85.7% | 71.4% | 78.6% | 78.6% | 0.750 | 43.8% | 0.601 |
| Context | 100% | 71.4% | 92.9% | 92.9% | 0.821 | 50.0% | 0.666 |

Answer@10 means at least one grade-2 actual-answer message appears in the first ten, averaged over
answerable questions. Context succeeds for 52 of 56; it does not mean all relevant messages were
found. MRR measures the first actual answer's position. Evidence Recall measures the fraction of
all labeled grade-1/grade-2 messages retrieved, averaged over questions with useful evidence.
nDCG rewards useful evidence and actual answers according to their rank, with grade 2 worth more.
The [evaluation guide](../combined-search-evaluation.md) gives the broader metric definitions.

Context finds 24/28 English answers and 28/28 Russian answers in the top ten; both languages have
20/28 at rank one. All four failures are English log-lifetime paraphrases: the answers reach the
candidate pool, but matching distractor headings outrank them. The eight terse-reply answers are
recovered through eligible context. Ranking quality remains the next bottleneck.

Missing-fact and unknown-qualifier questions produce zero hits, as do unresolved-conflict
questions. The latter contain useful grade-1 evidence that this path misses: abstaining is not
sufficient when the user needs evidence of a conflict. Zero false hits is a narrow fixture result,
not an established answer-confidence detector.

The raw-question baseline's zero recall reflects required question words in this internal lexical
path. It is not a comparison against a production semantic assistant. These results also cannot
be compared directly with the historical 43.8% cross-encoder result: the corpus, questions and
retrieval inputs differ.

## Latency and memory

Measured on 2026-10-10 with Node v24.19.0 on Linux x86-64, AMD Ryzen AI 9 HX 470.
This single-machine CPU run does not predict slower PCs.

| Resource | Measurement |
|---|---|
| Neural weight download | 0 bytes |
| Setup: populate/index/statistics | 799.3 ms |
| First scoped context query after setup | 31.7 ms |
| Same query warm p50 / p95 (10 repeats) | 12.4 / 15.3 ms |
| Holdout context query p50 / p95 | 12.2 / 42.5 ms |
| Process RSS after imports | 98.8 MB |
| Process RSS after setup | 146.0 MB |
| Process RSS after first query | 151.9 MB |
| Whole benchmark process peak RSS | 292.1 MB |

Times include query planning, lexical lookups, context eligibility and BM25. The cold probe is the
first search after creating/indexing the store and constructing statistics, not a fresh process
launch; its ten repeats use an explicit chat filter. Headline p50/p95 use the 80 unscoped holdout
questions. Setup includes synthetic database population and index/statistics construction.
Whole-process RSS includes Node, SQLite, the message snapshot, statistics and retained benchmark
traces. The full-run peak spans all three modes, not an isolated query's memory requirement.
No model assets were downloaded for this experiment.

This research implementation loads the whole account snapshot into maps. That makes corpus
statistics and reply lookup convenient, but it is not ready for large archives. Before production
integration, put statistics and bounded reply lookup in storage, hydrate only candidates, and
measure scaling at increasing archive sizes. A small per-query scoring cost alone does not prove
low total RAM or fast startup.

## Limits and next work

These are deterministic synthetic templates with shared wording and dates, self-assigned labels
and different topic names. Planner fixes were iterated against this family of examples. A topic
holdout does not make the wording independent or establish real-world quality. The paraphrase
failures and missed conflict evidence remain recorded rather than being removed from evaluation.

Next, validate ranking changes on independently written questions and distractors, including
negation, conflicting decisions and paraphrases beyond the alias list. Compare evidence coverage
as well as actual-answer position. Then replace the full snapshot with storage-backed statistics
and reply lookup and test archive scaling before changing any public search default.

## Reproduce

Build the selected cli-messaging prototype from
[draft PR 803](https://github.com/leemour/cli-messaging/pull/803), then run from cli-testing:

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" path-typecheck
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" path-tests
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" path > /tmp/search-model-free.json
```

The launcher stages only the selected harness, links the build and installed dependencies, and
retains its temporary SQLite store and launch metadata. No Python ML environment is required;
`generate.py` uses the standard library. The committed [report](results/report.json) contains every
query's actual input, planner trace, candidate/result ids, metrics and timing, plus fixture,
experiment and compiled-service hashes. [Launch metadata](results/launch.json) identifies the
selected build and parent experiment commit; experiment hashes identify the uncommitted source
used for this run. Public CLI/MCP/SDK defaults remain unchanged.
