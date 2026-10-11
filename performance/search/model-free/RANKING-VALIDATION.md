# Candidate coverage and ranking

Use this experiment to distinguish an answer that search never retrieved from one it retrieved
but ranked too low. It tests the released messaging package and a small question-planner fix,
then compares three cheap rerankers. Everything uses synthetic messages; no account is opened
and no neural weights are downloaded.

## What we froze

[ranking-frozen.py](ranking-frozen.py) authors 12 new English/Russian scenarios: retention,
permissions, superseded versions, terse replies, conflicting records and missing facts. Its
[fixture](ranking-frozen.json) contains 284 messages and 24 questions, of which 16 have an
actual answer. Two questions have no labeled useful evidence.

Questions and labels were frozen before inspecting their results. The same agent authored and
judged them, so this is a development regression set, not independent human evaluation. The
fixture SHA-256 is `f8e4c261ae640f9a9b4d6fc1fbe4df00187ec43c3522ac1624568e4a9ee9f8b4`.
After a failure informs a fix, this set is no longer an untouched final holdout.

## What we measure

- **Answer in candidates:** at least one actual-answer message is present in the returned pool
  of up to 300. A miss requires better retrieval; rearranging this pool cannot fix it.
- **Answer@1/3/10:** at least one actual answer appears within that many results, averaged over
  the 16 answerable questions. This does not mean every relevant message was found.
- **MRR@10:** rewards the first actual answer's position; an answer outside ten scores zero.
- **Evidence Recall@10/300:** the fraction of all labeled useful messages retrieved, averaged
  over questions with evidence. Supporting context and unresolved decisions count too.
- **nDCG@10:** rewards actual answers and supporting evidence according to their position.
  The ideal ranking is also limited to ten results.

The runner requests ten results, then separately requests 300 and asserts that their first ten
locators agree. It checks unique locators and that discovery's reported candidate count matches
that pool. The second request is a diagnostic probe; its time is recorded separately and is
excluded from the ordinary ten-result query latency. It is included in process peak RAM.

## Results and the fix

| Path | Answer in candidates | Answer@1 | Answer@3 | Answer@10 | MRR@10 | nDCG@10 |
|---|---:|---:|---:|---:|---:|---:|
| Released messaging 0.225.0 | 87.5% | 31.3% | 75.0% | 87.5% | 0.552 | 0.753 |
| Main 0.228.0 before fix | 87.5% | 31.3% | 75.0% | 87.5% | 0.552 | 0.753 |
| Permission-question fix | 100% | 31.3% | 81.3% | 100% | 0.599 | 0.807 |
| Fix + candidate BM25 | 100% | 18.8% | 68.8% | 100% | 0.481 | 0.770 |
| Fix + coverage, then BM25 | 100% | 18.8% | 75.0% | 100% | 0.490 | 0.776 |
| Fix + rare-term coverage | 100% | 18.8% | 75.0% | 100% | 0.486 | 0.774 |

“Can vendors connect…” and “Подрядчики могут подключиться…” were not recognized as natural
questions. Their trailing question mark became a Lucene wildcard, so discovery fell back to
strict retrieval and returned nothing. The [planner fix](https://github.com/WireCatLabs/cli-messaging/pull/899)
recognizes English can/could/should and Russian можно/может/могут/ли forms. It preserves subjects,
negation, filters and explicit query syntax. Both answers are now retrieved, without changing
ranking weights or the strict default.

Evidence Recall@300 and @10 rise from 90.9% to 100% on questions with evidence. The two questions
without evidence still return six partial hits in total. These hits are retained in the report;
discovery does not determine that an answer exists.

The older 24-question development fixture retains Answer@1 12.5%, Answer@3 87.5% and Answer@10
100%. The 80-question template control retains 48/56 actual answers at rank one and within ten.
The new candidate measurement finds answers for **all 56** inside 300: its eight remaining failures
are ordering failures. The control's missing-fact queries still return 160 unlabeled partial hits.

## Why the rerankers are not shipped

[rank.ts](rank.ts) computes document frequencies only over the returned candidates, not the
entire archive. It tests BM25 with k1=1.2 and b=0.75, coverage followed by BM25, and coverage
weighted by inverse document frequency. Eligible parent text is included only when its locator
is also in the returned pool. None uses relevance labels during scoring.

All three lower Answer@1, MRR and nDCG on the frozen set. They also lower Answer@1 on the older
fresh development set. Lexical overlap can reward a repeated question or a proposal over an
answer, so adding another lexical formula does not establish a useful improvement.

The comparison records the shared cost of preparing and sorting all three methods. Its variant
latency includes the 300-result request and that combined cost; it is not an isolated production
latency estimate for one method. No experimental reranker is added to the shipped search path.

## Performance and resources

Measured on Linux, Node 24.19.0, AMD Ryzen AI 9 HX 470. These are single-machine observations,
not performance promises for slower PCs or a controlled comparison between releases.

| Archive | Ten-result query p50 / p95 | First query after open | Query process peak RSS |
|---|---:|---:|---:|
| 284 messages, including cheap ranking comparisons | 3.8 / 7.1 ms | 26.7 ms | 124.8 MiB |
| 100,284 messages, discovery without experimental reranking | 36.9 / 77.9 ms | 112.0 ms | 128.3 MiB |

The larger run preserves all reported quality metrics. Its background consists of synthetic
receipts and weak Helix log-chart matches, not 100,000 independently judged conversations.
It measures archive scaling, not a dense 300-candidate adversarial ranking test. The fresh query
process reuses only the marked, fixture-hashed synthetic store created by this runner.

Creating and indexing that larger store took about **6.1 minutes**, with an ingestion-process
peak of 361.6 MiB. Ingestion and query costs are separate; that setup cost is not charged to each
search. The query peak includes labels, Node, SQLite and the extra candidate probes. The run
requires zero neural weight bytes.

## Reproduce

Build the selected cli-messaging checkout, then run from cli-testing:

```sh
python3 performance/search/run.py --messaging-root /absolute/cli-messaging path-typecheck
python3 performance/search/run.py --messaging-root /absolute/cli-messaging production \
  --fixture "$PWD/performance/search/model-free/ranking-frozen.json" --compare-ranking
```

To select an installed published artifact instead, provide its package directory as
`--messaging-root` and its installation's `node_modules` directory as `--dependency-root`.
The launcher records an installed-package selection with no inferred source commit, its package
hash and version, and the dependency directory. Typechecking requires an installed compiler;
the launcher never asks the package manager to install one implicitly.

[Recorded reports](results/ranking-2026-10-11/) retain candidate ids, top-ten ordering, per-question
metrics, build hashes and launch metadata. The unchanged main baseline is commit `5f935a5d`;
the fix is commit `7bb378c9`. It is released in messaging 0.229.0; the published tarball
exactly matches all five measured search-module hashes and the validated release artifact. Re-run these cases after any ranking change. The next useful ranking
experiment should address answers versus echoed questions and proposals, and keep both ordering
quality and useful conflict evidence visible.

The [compact-model follow-up](../compact/README.md) now tests 100/300 candidates with two small
models. Replacement ranking loses support; adding two model-selected messages to the existing ten
improves twelve-result evidence coverage on the older control, and remains an exploratory design.
