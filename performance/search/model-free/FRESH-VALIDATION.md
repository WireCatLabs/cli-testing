# Fresh questions and storage-backed discovery

New wording exposed how much the earlier 92.9% figure depended on shared templates. This experiment
holds the original planner fixed first, then separates retrieval failures from ranking failures and
tests the built shared implementation. No model is downloaded or loaded.

## Fresh example design

[fresh.py](fresh.py) contains 12 individually authored English/Russian scenarios: log retention,
conditional access, replaced builds, terse replies, unresolved locations and missing auditor/fee
facts. Each has two questions and several different answer/proposal/question/heading distractors.
The resulting [fixture](fresh.json) has 341 messages and 24 questions, with 16 actual-answer queries.
Unrelated office-receipt background is generated; the meaningful distractors are not topic-name
substitutions of the previous 60-copy template.

The same agent authored and labeled these examples. The frozen initial test is fresh relative to
prior templates, but subsequent implementation changes used these results for development. The
`holdout` field identifies their initial comparison role, not a blinded final quality certification.
There is no independent human relevance review or real-account evaluation.

## What the comparisons revealed

| Path on the same 16 answerable questions | Answer@1 | Answer@3 | Answer@10 | MRR@10 | Evidence Recall@10 | nDCG@10 |
|---|---|---|---|---|---|---|
| Frozen planner + corpus BM25 + reply context | 0% | 43.8% | 56.3% | 0.219 | 36.8% | 0.321 |
| Content-only BM25 / coverage-first ablation | 6.3% | 37.5% | 56.3% | 0.245 | 36.8% | 0.338 |
| Partial retrieval + snapshot BM25/context | 6.3% | 81.3% | 100% | 0.443 | 100% | 0.738 |
| Built storage-backed discovery | 12.5% | 87.5% | 100% | 0.521 | 100% | 0.748 |

The two simple ranking ablations barely help: missing query words exclude answers before scoring.
A bounded OR lookup over content terms and supported aliases recovers those messages. The built
implementation uses SQLite's FTS/BM25 retrieval rank, stemmed term coverage and eligible direct
replies. Replies inherit their parent's retrieval rank and precede the parent on an equal final
score. No fact/proposal/negation keyword penalty or trained weights are used.

The fresh baseline's candidate answer coverage is 56.3%; the partial snapshot prototype reaches
100%. The public built service does not return all candidate ids, so its report measures top-ten
success, not a reconstructed candidate-coverage metric. Missing facts in this fresh fixture include
explicit useful evidence that a fact is undecided. Thus zero `falseHits` here is not an abstention
result: every question has at least one labeled useful message.

## The older template remains a harder ranking control

On the previous 80-question topic-template holdout, the built path returns an actual answer at rank
one and in the top ten for 48/56 answerable questions (85.7%), evidence Recall@10 90.6%, nDCG@10
0.823. Eight retention paraphrases still fail top-ten ranking. This differs from the earlier
snapshot BM25/context path's 52/56: native FTS/retrieval-rank fusion avoids whole-corpus statistics
in memory, but its ordering is not identical to the snapshot's formula.

The built discovery path also returns 160 partial hits across the 16 missing-fact/unknown-qualifier
queries that have no labeled evidence. Their missing terms are visible. This is an explicit evidence
retrieval mode, not an answer-availability detector. Do not replace the strict default or claim the
original no-answer quality gate passed. Conflict evidence, previously missed by all-word questions,
can now enter the result set for the agent to inspect.

## Archive size, latency and query RAM

Measured on 2026-10-10: Node v24.19.0, Linux x86-64, AMD Ryzen AI 9 HX 470. Each query measurement
opens a retained synthetic database in a fresh Node process. It loads fixture labels for evaluation,
but does not enumerate the larger archive into JavaScript maps. Ingestion, indexing and its peak
RSS are separate from the query process. Background adds office receipts and weakly matching Helix
log-chart messages; it does not add 100,000 independently labeled realistic conversations.

| Stored messages | Question p50 / p95 | First query after open | Repeated export p50 / p95 | RSS after open | Query process peak RSS |
|---|---|---|---|---|---|
| 341 | 4.9 / 8.2 ms | 45.6 ms | 7.6 / 15.9 ms | 97.3 MB | 119.6 MB |
| 10,341 | 9.0 / 22.6 ms | 87.7 ms | 20.4 / 24.4 ms | 99.4 MB | 122.6 MB |
| 100,341 | 53.9 / 107.6 ms | 382.5 ms | 92.1 / 107.3 ms | 98.8 MB | 124.5 MB |

Timings include planning, indexed retrieval, bounded reply/eligibility lookup and cheap scoring.
The repeat probe is unscoped and runs ten times; the p50/p95 column covers all 24 fresh questions.
These single-machine values do not predict slower PCs. The resource reports retain the exact
inputs and per-query timing, fixture/runner/build hashes and synthetic store paths.

Replacing the correlated `only` JSON test with indexed message-key lookup prevents eligibility
from testing every archive row. Migration 29 adds an index on live replies by chat and parent id.
Natural questions use one partial lexical lookup rather than repeated all-word variants. A full
lexical shortlist no longer prevents replies entering: they inherit parent rank before the final
300-candidate cutoff. The query retains at most 300 scoring candidates and proposes at most 100
replies; body and execution budgets still apply.

No neural assets are required. Whole-process RAM still includes Node, SQLite and the language
stemmer; “no model” does not mean zero RAM. The older template report has a larger peak because
its runner loads the 6,944-message labeled fixture into the evaluation process.

## Reproduce and evidence

Use a freshly built cli-messaging checkout containing
[PR 803](https://github.com/WireCatLabs/cli-messaging/pull/803):

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" path-typecheck
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" path-tests
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" path \
  --fixture /absolute/path/to/performance/search/model-free/fresh.json --compare-ranking > /tmp/search-fresh.json
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" production > /tmp/search-discovery.json
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" production \
  --background 100000 > /tmp/search-discovery-100k.json
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" production \
  --fixture /absolute/path/to/performance/search/model-free/fixture.json > /tmp/search-discovery-template.json
```

The production runner creates a synthetic database, closes the ingestion process's store and
launches a fresh query process. Its internal reuse option requires the runner's synthetic marker
and fixture hash under its temporary directory; it never chooses the owner's store by default.
The recorded query runs reuse those already generated synthetic stores with the final build;
ingestion timings from older builds are not mixed into their query resource fields.

[Initial frozen results](results/fresh-initial.json), [their source snapshot](results/fresh-initial-source/search.ts.txt),
[partial prototype results](results/fresh-discovery.json), [built fresh results](results/production-fresh.json),
[10k background](results/production-10k.json), [100k background](results/production-100k.json) and
[older-template control](results/production-original.json) retain failures and raw result ids.
Launch metadata accompanies each report. The launcher uses WireCat imports directly. Namespace
normalization hashes are recorded separately from the original migration hashes.

Next ranking work needs genuinely independent questions and judgments, answer/proposal/conflict
comparisons and dense difficult distractors. These measurements justify a bounded, opt-in lexical
evidence tool, not general semantic understanding or an automatic answer.

## Candidate and ranking follow-up

[Candidate coverage and ranking](RANKING-VALIDATION.md) now measures the returned 300-candidate
pool, compares three cheap rerankers and records a permission-question retrieval fix. All 56
answers in the older template control reach that pool; eight still fall outside the top ten.
The rerankers lower ordering quality and are not shipped.

## Next experiments

1. Freeze a new set of independently phrased questions and relevance judgments before tuning.
   Include actual answers, proposals, contradictory decisions and questions with no answer.
2. Record evidence coverage inside the 300 candidates as well as Answer@1/3/10, MRR, evidence
   recall and nDCG. Separate retrieval failures from poor ordering.
3. Compare cheap lexical/context ranking changes first. Try a compact optional reranker on a
   short list only if it improves the frozen questions within the measured latency and RAM budget.
4. Measure cold/warm queries and archive scaling across messages, notes, files and meeting
   transcripts, including joined context and account/date filters. Keep strict defaults unchanged.

The last fresh fixture had 16/16 actual answers in the top ten but only 2/16 at rank one.
Moving useful answers earlier is the next ranking target; these synthetic results do not establish
real-world success rates or an answer-availability guarantee.
