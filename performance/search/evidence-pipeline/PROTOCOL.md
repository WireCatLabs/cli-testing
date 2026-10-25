# Frozen protocol

Frozen before any arm is scored on the calibration or evaluation splits. A change after freezing is a
new dated section below, with its reason. The old text stays.

## Splits

| Split | Projects | Author | Use |
| --- | --- | --- | --- |
| dev | 2 | separate agent; the pipeline author may read it | build and debug arms |
| calibration | 1 | separate agent | pick the few free parameters (MMR λ, unit fusion weight), once |
| eval | 2 | separate agent, sealed | scored once per arm, after the pipeline is frozen |

Splits differ by project, so they share no conversation, topic or people. The eval files are checked by
hash and schema only until the pipeline hash is recorded in `results/freeze.json`. Old fixtures, the
12-case compact smoke and the six PMED questions are exposed regression controls, not evaluation.

Target size: 30–60 questions in total, English and Russian, with at least a third that are negative,
conditional, conflicting, revoked or unanswerable. Every project includes all of these regression cases:

1. a real answer phrased as a denial ("do not keep logs longer than 21 days")
2. a conditional yes ("yes, if security passes")
3. approval of a heading, not of the content under it
4. a proposal that nobody accepted
5. two competing current versions
6. a decision that was later revoked
7. two different people or projects with the same name
8. a question whose answer is absent from the corpus

## Budgets

- **Candidate pools:** 50, 100, 300 units.
- **Evidence budget:** 4, 8, 16 KiB of serialized evidence. Serialization is fixed:
  `[<source title> · <author> · <at>]` and the unit text, units joined by a blank line. Context added to a hit
  counts against the same budget.
- **Tokens:** the same evidence counted with the mMARCO tokenizer (`tokenizer.json`, sha256 in
  `models.json`). Reported, not used as the cut.

## Arms, added one at a time

| Arm | What it adds |
| --- | --- |
| A0 | Core `searchDiscovery` (published `@wirecat/cli-core`, version pinned in the lock file) over a fresh temporary store holding the units as messages |
| A1 | A0 + native context: each hit's reply parent and direct replies, document section heading, neighbouring transcript turn |
| A2 | A1 with E5 dense retrieval fused in (reciprocal rank fusion, k = 60) |
| A3 | A2 + evidence units (a reply travels with its parent) + exact-duplicate removal + MMR diversity |
| A4 | A3 + mMARCO int8 reranking of the pool, keeping every candidate |

A learned feature ranker and a stronger-model control are open work. They need a broader development set
first.

## Two experiments

1. **Fixed candidates.** Each question gets the same pool: its graded units plus the top lexical and dense
   hits from the whole project, up to 50/100/300. This isolates ordering. Rankers: stemmed BM25, E5
   cosine, RRF, mMARCO, BGE int8.
2. **End to end.** Each arm retrieves from the whole project store. This measures candidate coverage first:
   a reranker gets no credit for evidence that its pool lost.

## Metrics

Per question, then averaged. Answer metrics use answerable questions only.

- Candidate answer recall and evidence recall at 50/100/300
- At each evidence budget: Answer@1/3/10 and answer MRR over ranked items (a hit with its context is one
  item); graded nDCG@10 over units in the order the reader sees them (gain 2^g − 1)
- Direct-support precision@5: items holding a grade-3 unit among the first five
- Complete-set recovery: some evidence set fully inside the budget
- Conflict recovery: for `conflict`/`revoked`, every grade ≥ 2 unit inside the budget
- Duplicate bytes and off-question bytes (grade 0) inside the budget
- Abstention is not implemented. For unanswerable questions, report what fills the budget.
- Cost: per-stage wall time (cold setup, warm median/p95 over repeats), peak worker RSS, model bytes, index
  bytes, threads and batch size

## Decision gates

No regression on exact identifiers, amounts, negation, conditions and conflict evidence. Compare per
question at equal bytes. Prefer the cheapest arm on the Pareto front. A model that helps only on exposed
cases stays a benchmark comparator.

## Changes before the eval freeze (25 October 2026)

Made after dev and the six real PMED questions, before the eval split was opened. Calibration was scored only
to pick λ.

- **Skip, don't stop.** An item that does not fit the remaining budget is skipped and counted (`skipped_items`).
  Real messages run to 7–8 KB, so stopping at the first one left a 4 KiB budget empty.
- **Passages for long units.** In A3 and A4 a unit over 1,200 bytes shrinks to its sentences closest to the
  question by E5, up to 1,200 bytes, in their original order. Synthetic units never exceed 1,200 bytes, so this
  changes only real-data runs.
- **A0 has two variants.** Core 0.412.0 as published, and the same with a question's trailing `?` read as
  punctuation (the cli-core#1935 fix, applied to the input by `core/discover.mjs --question-mark-punctuation`).
  Published discovery found nothing for half the dev questions because of that `?`. A1–A4 are reported on top of
  both.
- **λ = 0.9.** Calibration: λ 0.5, 0.7 and 0.9 gave the same Answer@3; 0.9 had the best A3 MRR (0.18 against
  0.15). The difference is one rank on one question.

## Reranker variants (25 October 2026, after the eval was opened)

The owner asked to test, and tune, three changes to A4 before any of them reaches Core. All three start from A3
at pool 100 and an 8 KiB budget.

- **Mix instead of replace.** Inside the first `D` A3 hits, the final score is
  `(1 − α) · fused + α · reranker`, each min-max scaled over those `D` hits. Hits after `D` keep A3's order.
  `α = 1` and `D = 100` is A4.
- **Richer input.** The pair the reranker reads gets `[source · author · date]` in front of the hit and of its
  reply parent, instead of the bare text.
- **Newest decision first.** After ordering, a hit among the first 30 moves just above an earlier hit when
  their E5 cosine is at least `τ` and it is newer. Each hit moves once. This also applies to A3 with no
  reranker.

Grid: rerankers mMARCO and BGE int8; input plain or rich; α 0.3, 0.5, 0.7, 1; `D` 20, 50, 100; `τ` off or two
values set from the cosine distribution on dev before tuning.

**Splits.** Dev, calibration and eval are all open now, so together they are the tuning set (58 questions, 40
answerable; **correction:** 38 answerable). A new `holdout` split, three projects written by a separate agent with two `revoked` and two
`conflict` questions each, stays sealed (hash and schema only) until the chosen variant is frozen in
`results/freeze-holdout.json`. Holdout is then scored once, with A3 and A4 beside it.

**Choice rule, fixed now.** On the tuning set: the highest mean of Answer@3 and MRR among variants that lose no
`revoked` or `conflict` question's Answer@3 against A3 and lose no more than one question's Answer@3 in total.
Ties go to the cheaper variant (no reranker, then mMARCO, then smaller `D`, then plain input). If no variant
passes, the result is "no reranker".

`τ` from dev before tuning: among the first 30 fused hits, the median E5 cosine of two units both graded ≥ 2 is
0.877 (90th percentile 0.903); of any two units 0.841. So `τ` is 0.87 or 0.90.
For a `conflict` or `revoked` question with no settled answer, losing "all conflict sides" against A3 counts as a
loss too. The tuning report is [variants_report.py](variants_report.py).

**Holdout as delivered.** The holdout author read "two more" as three `revoked` and three `conflict` questions per
project: 42 questions, 27 answerable, 9 revoked, 9 conflict, no `premise`. Kept as written.

**Frozen choice.** The rule picks BGE int8, rich input, `D` 50, α 0.7 (Answer@3 68%, MRR 0.54, 7 won, 0 lost
against A3). The best passing mMARCO variant, rich input, `D` 50, α 0.7 (66%, 0.52, 6 won, 0 lost), is scored
beside it, because it takes about a seventh of the time per question and a quarter of the model size. Newest-first failed on the tuning set
(τ 0.9 lost 3 questions against A3, τ 0.87 lost 10) and is not carried forward. Holdout reports these two, A3
and A4, nothing else.
