# Evaluating project context gathering: industry methods and our protocol

The practical question is whether an agent can gather enough trustworthy context to prepare a meeting,
explain agreements and propose tasks with less owner effort. A fast list of matching documents tests
only one part. This document distinguishes established evaluation methods from our proposed protocol.
Research checked 2026-10-21; no paid evaluator service or new runtime dependency is required.

## Established practice

| Approach | What it contributes | How to use it here | Limit |
| --- | --- | --- | --- |
| IR test collections and TREC-style pooling | Corpus, realistic information needs, relevance judgments; pool results from several systems | Build private query/candidate/judgment sets from several retrieval approaches plus expert anchors | Pool-relative recall is not exhaustive corpus recall |
| Ranked retrieval evaluation | Precision/recall, average precision, nDCG for graded relevance | Score ranked passage candidates for a defined question | Do not score source enumeration order as semantic rank |
| BEIR-style heterogeneous benchmarking | Compare retrieval methods across diverse tasks/domains | Include different projects, languages and evidence types; lexical baseline before dense retrieval | A public retrieval leaderboard is not proof on private project tasks |
| RAGAs | Automated checks addressing retrieval context, faithful use of evidence and response relevance | Cheap regression signals calibrated against reviewed examples | A reference-free score does not establish factual truth |
| RAGChecker | Diagnose retrieval and generation with finer claim-level checks | Separate missing evidence from unsupported or unused claims | An automated checker is another fallible model |
| Human-calibrated model judging | Scalable rubric application plus audited disagreements | Blind method names/order, use a separate assessor and adjudicate | Judge position, verbosity and self-preference biases can change scores |
| OpenTelemetry traces | Correlate operations through parent/child spans and timing | Connect source discovery, CLI calls, local reads, passage expansion, extraction and staging | A trace alone does not label correctness |

Sources: [TREC terminology and pooling](https://trec.nist.gov/howto.html),
[IR relevance assessment](https://nlp.stanford.edu/IR-book/html/htmledition/assessing-relevance-1.html),
[ranked IR measures](https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-of-ranked-retrieval-results-1.html),
[BEIR paper](https://arxiv.org/abs/2104.08663), [RAGAs paper](https://aclanthology.org/2024.eacl-demo.16/),
[RAGChecker paper](https://arxiv.org/abs/2408.08067),
[LLM-as-judge limitations](https://arxiv.org/abs/2306.05685),
[OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/).

Our application below is an engineering proposal based on these methods. It is not a universal industry
standard, and the historical live runs did not already implement all its metrics.

## Split the workflow into measurable stages

```mermaid
flowchart LR
  A[Selected sources and freshness] --> B[Imported and indexed material]
  B --> C[Candidate retrieval]
  C --> D[Passage expansion and version checks]
  D --> E[Claims, entities and proposed tasks]
  E --> F[Review and persistence]
```

A missing fact can originate at any stage. Classify failures before tuning embeddings:

- **Discovery/ingestion:** relevant source not selected, missing history, unsupported format, stale import.
- **Indexing:** imported content not indexed or transcript indexing incomplete.
- **Retrieval:** evidence is accessible/indexed but none of the strategies returns it within budget.
- **Passage selection:** document returned, relevant sheet/section absent or truncated.
- **Interpretation:** warning, speaker, negation, date, version or project boundary misunderstood.
- **Entity resolution:** wrong existing person/project reused, duplicate created or inferred attendance.
- **Persistence/review:** proposed state lost, stale evidence accepted, duplicate task/decision written.

## Define information needs before looking at results

Create question families for at least two projects initially, then a held-out third project:

| Family | Example need using invented data | Scoring unit |
| --- | --- | --- |
| Current status | What remains open for Harbour? | Supported status claim with as-of date |
| Decisions | Was migration accepted, rejected or merely suggested? | Decision/commitment claim |
| People | Who attended, spoke, was mentioned or owns a follow-up? | Person-role-evidence triple |
| Meeting preparation | What should be discussed with a named person next? | Required context item, linked to evidence |
| Documents | Which specification version controls the next step? | Version/provenance judgment |
| Follow-ups | What task follows, and was an owner or due date explicit? | Typed proposal with optional fields |
| Negative/unknown | Is there evidence a contractor was hired? | Correct abstention rather than inference |
| Project boundary | Does a copied example belong to this project? | Link/membership judgment |

Predeclare scope, source accounts, time basis, included versions and expected abstentions. A document
updated yesterday may describe a May decision; modification time is not event time. Keep a separate
source-completeness register. A missing-source question tests coverage reporting, not retriever recall.

## Build a judgment pool and keep a holdout

1. Use the same source snapshot/version manifest, past exclusive cutoff and budgets for all methods.
   Preserve the source archive; if reset experiments become necessary, take and verify a consistent
   backup/copy first. SQLite WAL stores require a consistent backup operation, not a bare main-file copy.
2. Pool top candidates from each approach, expert-known anchors and selected hard negatives. Include
   neighbour-only replies, copied documents, mixed sheets, name collisions, negations and stale versions.
3. Deduplicate by source/section/version identity while preserving copies and provenance. The same URL
   or identical excerpt does not always mean the same source record.
4. Label candidates with grades 0 unrelated, 1 contextual/weak, 2 directly useful, 3 essential evidence.
   Separately label current validity, project membership, event date and claim support; relevance is
   not approval of every statement in the document. Mark insufficient evidence explicitly.
5. Use two independent assessors on a subset; blind retrieval-method identity and shuffle display order.
   Record disagreement rate and Cohen's kappa or Krippendorff's alpha where appropriate. Adjudicate
   critical conflicts. A single agent's labels remain provisional rather than “human gold.”
6. Freeze training/tuning and held-out evaluation queries. Do not tune aliases against test misses and
   then report the same test as independent quality. Record pool coverage and unjudged results.

Never use an unjudged result as an automatic negative. Report the judged fraction and pessimistic /
optimistic bounds where useful. Even a large pool leaves unknown relevant material outside the pool.

## Compare several approaches, one change at a time

| Variant | Purpose | Current status |
| --- | --- | --- |
| A: stored name/key | Cheap lexical baseline | Real observation retained |
| B: add project aliases | Measure name variation | Combined run plus independent single-name contribution observations retained |
| C: add known people | Recover communications mentioning people | Combined and contact-only observations retained; mentions are not membership |
| D: confirmed linked-chat history | Retrieve replies with no project name | Released capability; no real chat link tested in this observation |
| E: document graph/key-document expansion | Follow meaningful links and versions | Existing context/key document read; systematic experiment pending |
| F: lexical + semantic retrieval | Compare vocabulary-independent matching | Proposed; use existing shared capabilities before building another engine |
| G: rerank pooled candidates | Improve useful evidence under a fixed passage budget | Proposed; measure added cost and false exclusions |
| H: agent-directed multi-hop | Read a lead, search its entities, expand supporting passages | Qualitative manual use; needs instrumented protocol |

Run ablations A, A+B, A+C, A+B+C, then add D/E individually. Compare F/G/H against the same pool and
budget. Keep all-returned-ref scores separate from fixed top-k passage scores. Do not assume the most
expensive approach wins. Byte, command, model-token and owner-review budgets must be explicit.

## Metric definitions and denominators

| Layer | Metric | Definition / denominator |
| --- | --- | --- |
| Source coverage | Accessible sources | Selected sources reachable / selected sources; retain unavailable/unknown separately |
| Source coverage | Import/index completeness | Completed eligible units / known eligible units; never invent provider-wide denominator |
| Retrieval | Precision@k | Judged relevant results in top k / k; report unjudged fraction separately |
| Retrieval | Pool-relative recall@k | Relevant pool items retrieved / all judged relevant pool items |
| Retrieval | nDCG@k | Graded discounted gain / ideal gain for the same judged pool |
| Retrieval | MRR | Mean reciprocal rank of first relevant evidence; appropriate for one-answer lookup |
| Retrieval | MAP | Average precision over ranked relevant items, averaged over questions with declared judgments |
| Retrieval | Unique useful gain | New judged useful evidence from a variant / added calls, seconds or tokens |
| Passage | Usable passage rate | Returned passages containing required readable evidence / reviewed passages |
| Passage | Truncation/exclusion | Truncated hits / hits; oversized excluded refs counted separately |
| Answer | Claim support precision | Supported answer claims / all answer claims; contradictions separately |
| Answer | Required-fact coverage | Correctly supported required facts / adjudicated required facts |
| Answer | Citation correctness | Citations supporting their attached claim / checked citations |
| Answer | Citation completeness | Factual claims with adequate citations / factual claims requiring citations |
| Unknowns | Abstention quality | Correct abstentions and unsupported assertions on known-unanswerable questions |
| Entities | Resolution precision/recall | Correct reused/created entities against adjudicated identity labels |
| Relationships | Typed-edge precision/recall | Correct person/project/meeting/role edges against gold typed edges |
| Tasks | Proposal correctness | Supported action, explicit versus inferred commitment, owner/date accuracy by field |
| Persistence | Duplicate/stale-write rate | Duplicate or stale accepted writes / attempted reviewed writes |
| Efficiency | Cost per useful unit | CLI/model/provider/seconds/review-minutes per validated evidence item or accepted proposal |
| Repeat | Stability and drift | Reference Jaccard, evidence-hash drift, additions/deletions and decision invalidations |

Do not call candidate-set overlap “accuracy.” Accuracy/TN-based metrics are often misleading for
retrieval because the number of irrelevant items in the whole archive dominates. Do not report F1
without an actual precision/recall denominator. Exact schema/quote checks establish structure, not
speaker attribution, entailment or correct project ownership. String-overlap metrics alone are weak
for these decisions; a paraphrase may be right and an exact quote may be misattributed.

## Instrument actual work and cost

Use one run ID; each operation records parent ID, start/end, status, input/config hashes and scope.
The shared SDK should own provider-neutral instrumentation; hosts map explicit source/profile identity.
Local measurement helpers can start with JSONL metadata, without adding a telemetry service dependency.

| Operation | Required measurements |
| --- | --- |
| Discovery/import | Provider name, explicit account label, pages/items, HTTP requests/retries, downloaded bytes, newest event time |
| Index catch-up | Indexed/skipped/failed units, elapsed time, index version, pending state |
| CLI invocation | Exact arguments in private manifest, release/dependency hash, wall time, exit code, stdout bytes |
| Local retrieval | Reader calls, budgets charged, sources/lanes, hits and exclusions; distinguish SQL work from HTTP |
| Passage expansion | Source ref/section/version, read bytes, shown bytes, truncation, added useful evidence |
| Model extraction/judging | Model/prompt/version hash, input/output/cache tokens, cost, claim count, retries |
| Review/persistence | Reviewer active minutes, corrections, approvals/rejections, duplicate reuse and stale refusals |

Raw queries and source bodies do not belong in public traces. Public results use allowlisted totals;
private manifests retain references, fingerprints and derived labels. Retrieval content remains evidence,
never instructions for tool use. Trace metadata must not include credentials or authentication headers.

## Statistics and experiment controls

- Use per-question paired comparisons on the same corpus and budget; bootstrap confidence intervals
  over questions for aggregate quality changes. Keep the query/project as the unit rather than treating
  thousands of correlated paragraphs as independent samples.
- For representative binary relevance samples, report sample design and confidence intervals. A Wilson
  interval on a simple random sample is useful; it is not valid to attach it blindly to our stratified
  sample plus a hand-picked diagnostic. Weight strata correctly if estimating a population rate.
- Separate first/cold runs from warmed runs. With enough repetitions report median and p95 plus n;
  three successive runs support a range and individual timings, not a production tail-latency claim.
- Randomize variant order and control concurrency/index changes where possible. Keep cache/embedding
  model readiness explicit. Report CPU/RAM and actual I/O only if measured, not inferred from budgets.
- Recheck evidence hashes before reusing labels. A fixed time filter is not a frozen archive.
- Treat privacy leaks, cross-account reads and incorrect entity merges as critical failures regardless
  of average relevance. Do not hide them inside a composite score.

## Proposed first acceptance gates

These are engineering targets to agree against a frozen pilot, not industry-mandated thresholds:

1. Every result exposes source scope and exclusions; no false “complete archive” statement.
2. Every staged claim has resolvable evidence; no fabricated owner/date/attendance in the labeled cases.
3. Replays create no duplicate facts/tasks/links and refuse stale reviewed evidence.
4. Candidate quality improves on held-out questions without exceeding the declared cost budget.
5. Required-fact coverage and owner correction effort improve together; gains are not just more text.

Start small: 12–20 questions across two existing projects, annotate a pooled set, calibrate a second
reviewer on the difficult cases, then add a third held-out project. This provides a useful pilot; it
cannot establish broad reliability. Use the existing synthetic fixtures for deterministic contracts
and the private pilot for semantic behavior. Keep extraction and provider freshness separate from
retrieval performance so the next fix addresses the actual failure.

A first independent-hint round is now retained in the audit README. It measures candidate contribution
and cost, not held-out relevance or causal latency; systematic multi-project quality experiments remain pending.
