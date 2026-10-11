# How we improved message search

Read this account to understand what we tried, why we changed direction, and which improvements
reached the tools. It connects the individual experiment reports without treating their different
fixtures as one accuracy curve. The work covered combined retrieval, lightweight ranking,
natural-language discovery and evidence supplements through **11 October 2026**.

The practical goal was to find useful messages from a question, quickly enough for a local CLI,
without requiring a large model download. We also needed to retain supporting and conflicting
records, respect account/chat/sender/date limits, and avoid confusing a relevant match with a
settled answer. Messages were the main evaluation target; the shared tools also search other
stored sources, but these results do not measure notes, files or meeting-transcript quality.

## The outcome

**Shipped:** explicit model-free discovery with bounded lexical retrieval, question planning and
eligible reply context; storage/index improvements; a fix for English and Russian permission
questions. The strict search default remains available and unchanged by these experiments.
The permission fix was released in messaging **0.229.0**, adopted by tg **0.46.2**, max **0.45.3**,
memo **0.7.1** and zoom **0.3.2**. Telegram and MAX expose message discovery; adopting the shared
SDK does not mean Memo and Zoom expose that mode. Published and installed Telegram/MAX binaries
passed isolated offline checks.

**Experimental:** a compact model can supply two additional messages while preserving the first
ten. The strongest measured merge keeps those additions in their original search order. It
recovers some missed English answers without measured losses on the regression sets. No model
or automatic download was added to the CLI, and no neural replacement ranking qualified.

**Not solved:** general paraphrase retrieval, reliable answer/no-answer decisions, long-message
model scoring, independent real-world accuracy, or model-assisted whole-CLI resource use.

## How we made comparisons

All search fixtures in this sequence are synthetic. Runners create new SQLite stores and never
open an owner's archive or contact a messenger. Inputs, labels, ranked ids, source/build hashes,
model revisions and measured resource costs are retained with each experiment.

We kept several measurements separate:

- **Candidate coverage:** did retrieval put the answer into the pool of up to 300 messages?
  A ranker cannot recover an answer absent from that pool.
- **Answer@1/3/10/12:** does at least one actual-answer message appear within the cutoff?
  Only questions labeled as having an answer enter this denominator.
- **Evidence Recall:** what fraction of all useful labeled messages was found? Support and
  contradictions count, even when no settled answer exists.
- **MRR and nDCG:** how early does useful evidence appear? Later experiments use answer-only
  MRR; the first experiment counted either supporting evidence or answers. nDCG rewards actual
  answers more than support and discounts later positions.
- **Missing-fact hits:** what does search return when the requested fact is absent? A relevant
  partial match is not proof that an answer exists.
- **Stage and resource costs:** retrieval, model loading, scoring, ingestion, bytes on disk and
  process RAM are measured separately. A worker measurement is not a whole-CLI measurement.

In the early report, **43.75% was macro Evidence Recall@10**, not the fraction of questions with
an answer. On those saved rankings, 50% of questions had at least one useful hit, 37.5% had all
labeled evidence, and 42.5% had an actual-answer hit. The
[evaluation guide](combined-search-evaluation.md#what-438-percent-means) gives the arithmetic.

Questions and labels were frozen before the relevant runs. The same agent authored and judged
these fixtures. Once a failure informed a change, that fixture became a development/regression
control. “Fresh” means new relative to preceding work; it does not mean independent human or
blind certification. Shared templates and correlated query variants limit generalisation.

## 1. Combining lexical matchers was insufficient

The initial benchmark used 2,616 invented messages and 96 queries, split into development and
held-out topics. Strict Lucene search avoided missing-fact noise but missed spelling variants;
the legacy fallback recovered some variants but returned many irrelevant fallback hits.

The idea was to let independent lexical matchers contribute candidates, then merge their lists
with reciprocal rank fusion and inexpensive lexical signals. We tried **180 configurations**
covering candidate depth, fusion constants, ranking signals and chat caps, preserving explicit
query syntax and existing labels.

Every configuration produced the same development Recall@10 **0.3625**, MRR **0.375** and nDCG
**0.3264**, with zero no-answer false hits. All failed the approved **0.45 / 0.50 / 0.40** gates.
The dev failure prevented a combined held-out evaluation. Repeating nearby weight combinations
was providing no evidence of progress, so the next step was to diagnose retrieval versus ranking.

Evidence: [initial benchmark and reports](message-search/README.md#combined-lexical-experiment).

## 2. Candidate coverage explained where ranking could help

At candidate depths 50, 100, 300 and 500, development evidence recall was **43.75%, 75%, 90% and
90%**. Three hundred was the smallest tested pool reaching the maximum. Paraphrase evidence
remained absent, so more reranking could not solve every miss.

We compared two model uses. The existing e5-small embedding model encoded text separately and
compared vectors; it reduced development Recall@10 from 36.25% to 27.5%. A multilingual
cross-encoder read each query/message pair together and improved the original held-out Recall@10
from strict **26.25%** and legacy **33.75%** to **43.75%**. It still missed the agreed recall/MRR
and latency gates, so “better than baseline” did not mean “ready to ship.”

That cross-encoder scored 300 uncached pairs in roughly **3–4 seconds** in the measured Node/WASM
path, plus model loading. Candidate lookup was not the source of that entire delay. Question
ranking looked stronger when we supplied manual topic anchors, but that was a diagnostic,
not an implemented end-to-end question-search feature.

Evidence: [candidate and model comparison](message-search/README.md#candidate-recall-and-semantic-ranking).

## 3. We narrowed the footprint and borrowed specific tool ideas

The large-checkpoint research and measured resource table referred to different models. The
measured multilingual reranker had **118.6 MB** quantized weights and **135.7 MB** selected assets;
the original Node/WASM process peaked near **1.33 GB**. Model bytes and resident RAM were not
interchangeable. Larger researched alternatives were not installed.

We also reviewed Jev/System One and open-source shared-state, listwise and late-interaction
approaches. Their appeal was avoiding repeated work or generation for relevance decisions. Our
cross-encoder already returned a scalar without generating text; adopting a new architecture
would still require footprint, language and runtime evidence. We made no hosted Jev call and
did not benchmark a late-interaction index. The [architecture research](combined-search-model-research.md)
and [model explanation](MODELS.md) distinguish researched alternatives from tested models.

This motivated a comparison from simplest to most expensive: lexical formulas, matching
features, small learned feature rankers, role classifiers, compact cross-encoders and dense
representation scoring. We also inspected QMD, Meilisearch and Typesense for bounded inference,
retrieval-position protection and explainable lexical priorities. We adapted individual ideas;
we did not benchmark those complete engines or establish that QMD was inefficient.

The matrix tested **23 variants plus the baseline**. A 1,345-byte pairwise feature model improved
fresh keyword Answer@10 **40/60 → 48/60**, while small neural alternatives often lost evidence.
Its size was attractive, but one synthetic fixture was too little evidence to adopt it.

Evidence: [footprint rationale](LIGHTWEIGHT-RANKING.md), [tool review](TOOL-RESEARCH.md),
[methods and resource matrix](matrix/README.md).

## 4. Harder wording broke the promising feature model

The next stress test included negated decisions, conditional approvals, superseded records,
terse replies, conflicts and absent facts. The frozen feature model's proposal/negation penalties
also penalised real answers such as “do not keep logs beyond 21 days.” Its earlier improvement
was valid on that fixture, but did not transfer well enough to ship.

A more useful finding was contextual: short replies often omit the question's keywords. Adding
eligible direct replies raised answer coverage **40/48 → 48/48**. BM25 with reply context reached
48/48 answers within ten on the anchored question diagnostic. Both parent and reply still had
to satisfy the scope filters.

Score-floor experiments also showed why ranking and answer availability are separate tasks.
Some lexical thresholds achieved zero false answers by rejecting every answer. Good ordering
alone did not provide a reliable confidence threshold. These findings directed effort toward
retrieval and context rather than a universal score floor or more role-keyword penalties.

Evidence: [robustness and answer-availability validation](validation/README.md).

## 5. We removed the manual keyword anchors

The next prototype accepted the question itself. A small English/Russian planner removed question
scaffolding, retained content and unknown qualifiers, and used bounded domain aliases. Lexical
retrieval, stemmed BM25 and eligible parent/reply context required no neural weights.

On the 56-answer template holdout, the snapshot context prototype reached **52/56** answers within
ten. New individually authored questions then exposed a large drop: the frozen path found only
**9/16**. This was the reason to change retrieval, rather than keep polishing its ranking formula.
Missing query words had excluded useful messages before scoring.

A bounded partial-word lookup over content terms and supported aliases recovered those answers.
The storage-backed implementation reached **16/16** on the fresh set. It used indexed retrieval,
stemmed coverage and retrieval-rank fusion, avoiding a whole-archive JavaScript statistics snapshot.
Reply candidates inherited parent rank before the final cutoff. On the older templates its order
was different: **48/56**, rather than the snapshot's 52/56. We retained that regression control.

Explicit discovery was shipped alongside strict search, with bounded candidates, reply additions,
body bytes and execution time. It still returns partial matches when facts are missing; the
original strict no-answer gate did not become a passed discovery gate.

Evidence: [question prototype](model-free/README.md),
[fresh wording and storage-backed implementation](model-free/FRESH-VALIDATION.md).

## 6. Fresh diagnostics found a small, shippable retrieval bug

Another frozen 24-question set showed that English “Can…” and Russian “Могут…” permission
questions were not recognised as questions. Their trailing question mark was treated as a
wildcard, and discovery fell back to strict retrieval. Two answers disappeared from the pool.

Fixing the planner raised candidate coverage and Answer@10 **14/16 → 16/16**, without new model
weights or ranking parameters. Three cheap candidate rerankers—BM25, coverage then BM25, and
rare-term coverage—lowered early-answer and graded ranking metrics. We did not ship them.

The released model-free path was also measured on 100,284 synthetic messages: ten-result query
p50/p95 **36.9/77.9 ms**, first query **112 ms**, query-process peak **128.3 MiB**. Indexing took
about 6.1 minutes and had a separate memory peak. Background receipts are a scaling workload,
not 100,000 independently judged conversations or a slower-PC performance promise.

The exact published SDK artifact matched the measured search-module hashes. Telegram/MAX
published and installed binaries passed offline permission-question, reply and sender-filter
checks. These small binary checks establish delivery of the contract, not general search accuracy.

Evidence: [fix and candidate diagnostics](model-free/RANKING-VALIDATION.md),
[released-package verification](released/README.md).

## 7. Compact models improved answers but lost supporting evidence

The remaining eight old-template answers were all in the 300-candidate pool at **rank 62**.
That made ranking the bottleneck and ruled out a top-40 cascade for these misses. We compared
pinned TinyBERT and MiniLM-L6 using body or eligible parent context, 100 or 300 candidates,
and single-pair or batched inference. Relevance labels never entered model inputs.

MiniLM improved older Answer@10 **48/56 → 52/56**, but Evidence Recall@10 fell **90.6% → 81.3%**.
TinyBERT also lost support. Raw neural order, reciprocal rank fusion and preserving the first
three results all failed the replacement gates. Batched quantized inference sometimes changed
scores and order, so we evaluated execution modes separately.

The compact alternatives were practical sizes: TinyBERT assets **5.23 MB**, MiniLM **23.91 MB**.
The compact comparison's MiniLM worker peaked near **129.8 MiB** and scored top-100 English
queries at p95 about **302 ms**. These were native-worker measurements, not whole-CLI costs.
The size improvement did not erase the evidence-loss problem.

Evidence: [compact models, replacement gates and resources](compact/README.md).

## 8. We changed the model's job: supply extra evidence

The support loss suggested preserving the existing ten and adding two distinct model selections.
At the same twelve-result cutoff, this recovered older answers **48/56 → 52/56** and improved
Evidence Recall **90.6% → 93.8%**. It did not improve the first ten or establish answerability.

A new crowded fixture recovered answers **8/14 → 10/14**. Long messages exposed the model's
512-token limit: the unchanged worker aborted, so the follow-up explicitly excluded overlength
pairs from the original top-100 shortlist. It did not silently clip text or remove baseline hits.
The policy therefore cannot recover long answers outside the baseline.

The first new fixture had no useful baseline results at 11–12 and every twelve-result payload
fit under 4 KiB. Its passing result did not test displacement or a binding byte limit. We added
five targeted cases and tighter byte budgets. One case exposed a small nDCG regression when the
model swapped an answer and support at 11–12.

The stable merge keeps the same two model selections but orders them by their original search
positions. It fixed that observed regression and passed measured per-query answer/evidence/nDCG
checks on all **157 questions** across five sets and the tested budgets. It was designed after
viewing the failure, so these are regression results, not a new independent holdout success.

Unit counterexamples establish the remaining structural limits: preserving ten can still discard
useful evidence at 11–12, and a long addition can prevent a later answer fitting. Tight byte
budgets can erase the twelve-result gain. The simulated id/text JSON payload is not the CLI's
actual response schema or a model-token budget.

Evidence: [supplement design and results](supplement/README.md),
[frozen protocol and follow-up decisions](supplement/PROTOCOL.md).

## What we concluded

The most useful shipped gains came from retrieving the right evidence: question planning,
partial lexical matching, eligible replies and a small planner fix. A more complex ranker was
not automatically better. We rejected measured regressions instead of promoting an aggregate
answer gain that hid lost support.

For optional neural help, stable evidence supplementation is the strongest measured candidate.
Before rollout it needs independent judgments, a portable runtime and actual CLI latency/RAM
and response-size checks. More sweeps over the exposed fixtures would add little confidence.
Model-free discovery remains the production path, without a compulsory model download.

The experiments now live in `cli-testing/performance/search`; implementation tests stay beside
the SDK/client code. Public search and testing documentation were updated separately, keeping
reader explanations simple and deeper benchmark details here. Historical reports remain available;
this account does not replace their protocols or raw evidence.
