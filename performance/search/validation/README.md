# Robustness validation and efficient search choices

The follow-up checks whether the 1.35 KB feature model survives different wording and harder
answer/context distinctions. **It does not yet justify production adoption.** Lexical scoring is
still the cheapest default direction; a learned feature ranker needs more representative training
and fresh validation. This does not establish that QMD is inefficient: we have not compared whole
engines on the same corpus and tasks.

## What was tested

[generate.py](generate.py) freezes 6,944 invented messages in sixteen topic chats and 288 query
groups. Eight topics, four English and four Russian, calibrate score floors; eight different topics
are the holdout. Each split has 64 keyword requests, 64 manually anchored question diagnostics and
16 sender/date scope probes. Each ordinary group has 48 requests with an actual answer and 16
without a settled answer.

Cases include factual refunds, genuine decisions containing negation, conditional approvals,
archived versions, ownership changes, terse replies, unresolved conflicting documents and absent
auditors. Each case has sixty distractors. The messages use common timestamps; retrieval and
ranking can still depend on insertion/tie order. This is a targeted synthetic stress test, not a
representative independently judged real-chat collection.

The original feature weights remain frozen. [features.py](features.py) reuses the original feature
calculations without retraining; an equivalence run reproduced all 144 historical rankings exactly.
A preregistered ablation removes four broad role/negation cues without fitting new weights. Existing
TinyBERT and multilingual caches are reused; no model download occurs.

Question-form tests give retrieval manual topic anchors and give scoring the full question.
They do not implement automatic natural-language candidate generation. Keyword scoring uses the
anchor terms, with hard filters removed from model text features. Direct question candidate counts
are retained independently in [candidates.json](results/candidates.json).

## Eligible reply context

The reply/context experiment adds direct replies to retrieved parents, bounded at 100 additions
and 300 total candidates. The production strict scope-only query defines eligible ids. Both parent
and reply must be eligible in the same chat; scope probes and strict requests are not expanded.
Parent text is prepended to the reply only for scoring. This is an offline prototype, not an added
production search feature. It uses synthetic reply links already stored by the selected build.

The terse answers contain no topic words. Without expansion, actual answers are present in the
candidate pool for only 40/48 answerable question cases, or 83.3 percent. Adding eligible reply
context recovers the remaining eight, raising candidate answer coverage to 100 percent. Scope
checks confirm that sender/date restrictions are not bypassed to recover those replies.

## Holdout question-ranking results

These values refer to 48 new answerable question diagnostics, not the previous keyword holdout.

| Method | Raw answer @1 | Raw answer @10 | With reply context @1 | With reply context @10 |
|---|---|---|---|---|
| Retrieval order | 16.7% | 66.7% | 16.7% | 66.7% |
| BM25 using the full question | **83.3%** | **83.3%** | **83.3%** | **100.0%** |
| Frozen feature ranker | 16.7% | 50.0% | 25.0% | 58.3% |
| Frozen weights without broad role cues | 25.0% | 75.0% | 41.7% | 91.7% |
| TinyBERT, English model | 50.0% | 50.0% | 58.3% | 60.4% |
| Current multilingual model, native CPU | 83.3% | 83.3% | **100.0%** | **100.0%** |

BM25 plus context reaches answer @10 of 100 percent in both language slices. TinyBERT plus context
reaches 100 percent in English and 20.8 percent in Russian, confirming that its small footprint
cannot substitute for multilingual validation. The full feature model reaches 33.3 percent in
English and 83.3 percent in Russian with context. These are small counts with shared templates.

Keyword requests show a different tradeoff. With reply context, answer @10 is 75.0 percent for
BM25, 83.3 percent for the frozen feature model and 100 percent for the no-role-cue ablation. That
ablation is a diagnostic, not a newly trained or universally validated model. Query form matters;
no single winner from these fixtures should silently become the default.

The full feature model's largest coefficients penalise proposal/negation cues. Those cues were
useful in the first fixture but also occur in real answers such as “do not keep logs beyond 21
days”. The ablation exposes that brittleness. The earlier matrix's 80 percent answer @10 result
remains a valid observation on its fixture; it does not generalise to this question stress test.

## Ranking and answer availability are separate

Conflicting unresolved documents have grade 1 evidence labels and no grade 2 answer. Finding them
is useful search behaviour; it is not finding a settled answer. [validate.py](validate.py) uses
`answerExpected` separately from evidence relevance so those messages do not inflate actual-answer
success or disappear from evidence evaluation.

Each method/context mode selects an experimental answer-availability floor above the maximum
score on calibration questions without a settled answer. This uses calibration only and does not
change the displayed raw rankings. It is a conservative diagnostic of whether rank scores alone
can support an answer/no-answer decision, not a calibrated probability or an implemented CLI flag.

| Question decision after calibration | Recall on holdout answerable cases | False-answer rate on holdout unanswerable cases |
|---|---|---|
| BM25, raw or with context | 0.0% | 0.0% |
| Frozen feature score, raw or with context | 0.0% | 0.0% |
| TinyBERT, raw or with context | 16.7% | 0.0% |
| Multilingual model, raw | 83.3% | 0.0% |
| Multilingual model with context | 95.8% | 0.0% |

A method that declines every answer can achieve zero false answers. That is why decision recall
must accompany the false-answer rate. Good BM25 ordering does not make its top score a reliable
answerability signal. The neural model supplies more useful semantic discrimination on these
cases, at a higher resource cost. These sixteen negative question cases do not establish general
calibration or correctness.

## Cost and the category choice

On the same AMD CPU, raw question BM25 scoring p95 is about 0.18 ms, versus about 14.7 ms for the
shared feature pipeline and 240 ms for the native multilingual worker. Adding context changes
input lengths: BM25 is about 0.33 ms, feature scoring about 29.3 ms and the multilingual worker
about 1,089 ms. These are small candidate lists, at most 63 in the ordinary cases, and warm
scoring-only lab observations. They are not 300-candidate production benchmarks. Loading,
index/preparation costs and complete engine operation are separate.

| Need | Efficient category to start with | Main cost/limitation |
|---|---|---|
| Keyword, prefix, typo and filtered lookup | Inverted-index lexical search, with BM25/explicit matching rules | Small query cost; word mismatch and missing context limit coverage |
| Combine cheap signals for a task | Small feature-based learning to rank | Tiny weights and arithmetic; training distribution and feature quality matter |
| Find differently worded messages | Precomputed vector or other semantic candidate retrieval | Model/index/build costs; amortised message encoding can make queries cheap |
| Understand answer versus proposal or unresolved facts | Query-message/context reranking or a dedicated decision model | More inference; apply only where its measured benefit justifies it |

QMD combines several of these categories and also offers keyword-only search. Its hybrid model
footprint is a resource/capability choice, not proof of wasteful implementation. The
[tool review](../TOOL-RESEARCH.md) describes what we inspected and what we did not benchmark.

For our modest-download default, favour lexical retrieval, useful eligible context and measured
cheap ranking. Investigate a better-trained feature model without brittle word penalties. Keep
stronger semantic scoring optional until a cheaper method passes the same quality tests; a
shortlist cutoff must preserve answers before reducing inference. Public search remains unchanged.

## Reproduce and evidence

Use the selected built prototype, the existing pinned caches and the matrix's hash-locked Python
environment. Run from the cli-testing checkout:

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" validation-typecheck
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" validation-candidates > /tmp/search-validation-candidates.json
/tmp/search-matrix-venv/bin/python performance/search/validation/validate.py \
  --input /tmp/search-validation-candidates.json \
  --small-cache /tmp/search-matrix-models/tinybert \
  --current-cache /tmp/search-multilingual-reranker \
  --output /tmp/search-validation-results
/tmp/search-matrix-venv/bin/python performance/search/validation/test_validation.py
```

The [report](results/report.json) retains category/language breakdowns, raw ids, candidate coverage,
score floors and decision failures. Candidate pools, worker scores, context inputs, launch metadata
and source/model hashes are retained alongside it. Tests check hard eligibility, reply recovery,
unresolved evidence labels and hash consistency. Historical matrices and weights were preserved.

The next [model-free experiment](../model-free/README.md) removes manual keyword anchors from
headline question retrieval, adds bounded question planning and measures the complete lexical/
context path. It preserves paraphrase failures and distinguishes small scoring cost from the
prototype's full-archive memory footprint.
