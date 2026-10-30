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

**After the holdout score.** `variants_report.py` changed only its header line, to say "Holdout" instead of
"Tuning set" for a `--frozen` report. The hash in `freeze-holdout.json` is of the version before that line.

## Meaning floor (25 October 2026, before any floor was scored)

Core 0.432.0 (cli-core#1979) fuses discovery with up to 100 nearest messages by E5, with no minimum cosine, so a
question that nothing answers still gets 100 meaning hits. Core's existing floor for E5, 0.80
(`meaningFloor`), was measured on conversation chunks, not single messages. Question: should the per-message
meaning list drop hits below a cosine before fusion, and at what value?

- **Floors:** none, 0.80, 0.82, 0.84, 0.86, 0.88. The floor drops meaning hits below it from the 100 nearest,
  then fusion runs as before (RRF, k = 60). Pool 100, 8 KiB.
- **Arms:** A2 (discovery + E5 fusion, what Core ships) decides. A3 and the two frozen reranker mixes (mMARCO and
  BGE int8, rich input, `D` 50, α 0.7) are reported beside it, to see whether a floor still matters after a
  reranker.
- **Word lists:** the stored discovery runs (Core 0.412.0 with the "?" fix applied to the input:
  `results/dev-fixq`, `calibration-l0.9`, `eval-fixq`, `holdout`). The floor acts only on the meaning list, which
  this harness computes.
- **Reproduction gate:** with no floor, every arm must match the stored per-question rows (`results/variants-*`,
  `results/holdout`) before any floor row is read.
- **Measures:** Answer@3 and MRR on answerable questions; "all conflict sides" on `conflict` and `revoked`; on
  `missing` and `premise` (nothing answers them) the number of off-topic (grade 0) items among the first five
  that only meaning search found, and how many of those questions get words-only results. `conflict` and
  `unresolved` questions have graded sides, so losing one is a loss, not a win. Query-to-message E5 cosines:
  answers, other graded messages, ungraded messages in the meaning top 100, and the best hit's cosine per question
  kind. (The 0.877 / 0.903 in "Reranker variants" are message-to-message cosines, a different quantity.)

**Choice rule, fixed now.** On the tuning set (dev, calibration, eval), with A2: the highest floor that
(1) loses no answerable question's Answer@3 against no floor, (2) loses no `conflict`/`revoked` question's
"all conflict sides", (3) lowers mean MRR by at most 0.01, and (4) has strictly fewer off-topic meaning-only items
in the first five on `missing`/`premise` questions than no floor. If no floor passes, the result is "no floor".

**Holdout.** The holdout split was already opened once, for the reranker choice above, so it is no longer unseen
data; its no-floor numbers are public. It is scored once more, with the chosen floor and every other floor
beside it, after this section is committed. It has 3 `missing` and no `premise` questions, so it tests mostly
"no answerable question lost"; the off-topic benefit rests on the tuning set.

**After the floor runs.** `pipeline.py` gained `--floors` and an optional record of which hit each evidence item
came from; its other paths are unchanged, and the no-floor rows matched every stored row in Answer@3,
reciprocal rank, all conflict sides and item count. The rule above was committed in 635a8e6, before any floor
was scored. The rule picked no
floor on the tuning set: with no floor, no `missing`/`premise` question had an off-topic meaning-only item in the
first five, so condition (4) could not pass. Holdout agreed (results in the README, "Meaning floor").

## Cancelled decisions and long messages (30 October 2026, before any of it was scored)

Two open items, one new split. **Cancelled decisions** (`revoked`): on holdout 6 of 9 such questions have their
answer in the first three for every arm, A3 included, and newest-first by cosine lost more than it fixed. In the
failing ones the cancelling message shares a distinctive name with the decision it cancels (a supplier, a code,
a product term), not the question's words, and is usually not a reply to it. In two holdout questions and one
calibration question the cancelling message is not among the first 100 candidates at all. **Long messages:**
synthetic units stop at 1,200 bytes, so A3's passage cut and the reranker's input cut were never graded; real chat
messages run to 7–8 KB (median 153 mMARCO tokens, p90 762).

### Follow-ups of a hit

After the final order, each of the first `K` hits gets up to `M` follow-ups: later units of the same project (any
source) that share at least one term with the hit whose document frequency in the split store, background
included, is at most `T`. Terms are the BM25 terms (casefolded words of 3+ letters, Snowball-stemmed by script).
The latest follow-ups are taken first. A follow-up already shown earlier is skipped.

- **Placement:** `ctx` — the follow-ups join the hit's item after its native context; `above` — each follow-up
  becomes its own item just above the hit.
- **Grid:** `K` 5, 10; `M` 1, 2; `T` 3, 5, 10; placement `ctx`, `above`. Applied on two bases: A3, and the mMARCO
  mix that Core ships (rich input, `D` 50, α 0.7). Pool 100, 8 KiB. No question text, kind or label reaches it.

**Choice rule, fixed now.** Tuning set: dev, calibration, eval and holdout, all already open (14 `revoked`
questions). For each base: the variant that wins the most `revoked` questions' Answer@3 against that base, among
variants that (1) lose no answerable question's Answer@3, (2) lose no `conflict`/`revoked` question's "all
conflict sides", and (3) lower mean MRR on the other answerable questions by at most 0.01. Ties go to fewer added
bytes: smaller `K`, then `M`, then `T`, then `ctx`. Fewer than two wins is "no change".

### The `long` split

Written by a separate agent; sealed (hash and schema checks only) until `results/freeze-long.json` records the
chosen follow-up variant and the code hashes. Scored once. Three projects, about 14 questions each, English and
Russian, all eight traps of "Splits", plus:

- **Long units.** This split alone allows units up to 8,000 bytes. Chat messages aim at the real spread: median
  about 600 bytes, a tenth over 3,000, a few of 5–8 KB. Documents and transcript turns may run long too.
- **Answer spans.** Every grade-3 unit of a question gets a `spans` entry: the exact sentence(s) that state the
  answer, as a substring of the unit text. In at least half of the answerable questions the grade-3 unit is over
  1,500 bytes and its span starts after the first 1,000 bytes.
- **Cancelled decisions.** Four `revoked` questions per project. In at least two the cancelling message is not a
  reply to the decision and shares a distinctive name with it but not the question's key words; at least one is a
  native reply.
- **Controls.** Two questions per project marked `control: true`: a decision that still stands although a later
  message names the same thing (a passing mention, a question about it, a related task). Follow-ups must not push
  these down.

**Gates on `long`.** The chosen variant passes if it wins at least one `revoked` question, loses no `control`
question's Answer@3, and loses at most one answerable question's Answer@3 overall, against its base.

**Long-message measures, reported, no choice made.** On `long`, for A3 and the mMARCO mix: the share of answerable
questions whose span survives in what the reader sees (whole unit or A3 passage) among the first 3 and 10 items;
the same with the passage cut off; and the mMARCO mix with the reranker reading the first 256 and 512 tokens of
its input against the full model limit. `spans` and `control` reach only the scorer, never a ranker.

**After tuning, before `long` was opened (30 October 2026).** `pipeline.py --followups` reproduced every stored A3
and mMARCO-mix row on all four splits (200 rows, 0 differences in Answer@3, reciprocal rank, all conflict sides and
item count), then scored the grid ([followups_report.py](followups_report.py),
[tuning table](results/followups-tuning.md)). The rule picks **no change** for both bases: the best passing
variants win one `revoked` question. `freeze-long.json` therefore records no follow-up variant. `long` still runs
the follow-up variant with the most wins and no loss on the tuning set (mMARCO mix, `K` 5, `M` 2, `T` 3, `ctx`),
labelled exploratory; it decides nothing. The mMARCO limit is 512 tokens, so "full model limit" and 512 are the
same run; the input cut is reported at 512, 256 and 128 tokens, with Core's released input (the replied-to message
cut to 300 characters, then the hit) and with the whole replied-to message at 512.
