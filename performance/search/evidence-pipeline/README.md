# Evidence pipeline: which cheap stage helps a question find its evidence

**Why this was run.** The owner asked a project question in MAX and earlier gathering missed important chats.
On six known questions, existing discovery returned answers mixed with generic advice, and questions ranked
above their own answers. The [compact pipeline handoff](../compact-pipeline/README.md) asked which of the cheap
stages actually improves cited evidence, and at what cost: correct retrieval → native context → lexical and
semantic union → selection and diversity → an optional compact reranker. It also asked to keep search working
without any model. This page answers that on synthetic splits frozen before scoring, with Core's published
discovery as the baseline. The decision it feeds: which stage becomes the next production slice in cli-core.

## What it showed

1. **The biggest defect was a bug, not ranking.** Published `--discover` returned **nothing** for 12 of 24 dev
   questions and 6 of 24 eval questions. A natural question ending in "?" kept its "?", Lucene read it as a
   one-character wildcard, and discovery fell back to strict search. Treating that "?" as punctuation raised
   "the answer is among the candidates" from 62% to 75% of eval questions at pool 100, with no other change. The
   same bug is in the installed tools: on a real chat «Почему поменяли цену?» found 0 messages, and without the
   "?" it found 43. Fix: [cli-core#1935](https://github.com/WireCatLabs/cli-core/pull/1935).
2. **Native context is the cheapest real gain.** Attaching a hit's reply parent, first replies and neighbouring
   transcript turns (A0 → A1) improved the answer's rank on 7 eval questions and worsened it on none.
3. **E5 fusion fixes candidate coverage.** Adding the multilingual E5 model that Core already ships (A1 → A2)
   put the answer among the candidates for 94% of questions at pool 100 (A1: 81%), and 100% at pool 300.
   Answer rank: 7 better, 2 worse.
4. **Diversity did nothing measurable.** MMR and exact-duplicate removal (A2 → A3) changed no eval question.
   λ from 0.5 to 1.0 changed nothing on calibration or on the real chat.
5. **mMARCO reranking is a wash, so it stays a comparator.** A3 → A4: answer rank 5 better and 4 worse. It lifted
   Answer@10 from 69% to 94%, but pushed one of the two `revoked` questions out of the first three (rank 1 → 4: it
   put the earlier, cancelled decision above the message that cancels it), and did not help on the six real
   questions. That fails the "no regression on conflict evidence" gate. Mixed with the fused order and given the
   date and author, a reranker does help: on a fresh holdout split BGE int8 reached 85% Answer@3 against A3's 67%,
   with no question lost ([reranker variants](#reranker-variants)).
6. **Still unsolved in every arm:** both `conflict` questions miss Answer@3. At most half of the conflict/revoked
   questions get all their sides inside the budget. Roughly 89% of every budget is off-question bytes. Nothing
   abstains: every arm fills the budget for unanswerable questions too.
7. **Cancelled decisions and long messages (30 October).** Showing later messages that share a rare name with a
   hit fixed 1 of 14 cancelled-decision questions on the open splits, but 4 of 15 on a split written blind, with
   nothing lost, which passes the rule fixed before it was written; a split of long messages keeps the reranker at
   512 tokens and finds passages neutral ([details](#cancelled-decisions-and-long-messages)).

Recommended next slice: merge and release the "?" fix, then make native context part of discovery's evidence
(check first whether `--discover --thread` on a store with built conversations already does it). Next comes a
per-message E5 index fused with discovery, behind the existing local-model choice. No new model download.
Details in [the results](#results-eval-fixed-discovery) and [reranker variants](#reranker-variants).

## Setup

- **Corpus** ([format](CORPUS.md), [protocol](PROTOCOL.md)). Five invented projects: chats, document sections
  and meeting transcripts in English and Russian, 254–337 units each. Each split also gets 1,500 units of
  unrelated chatter that reuses common words ([background.py](background.py)).
  - **dev:** 2 projects, 24 questions. The pipeline author could read it.
  - **calibration:** 1 project, 10 questions. Used once, to pick λ.
  - **eval:** 2 projects, 24 questions, 16 of them answerable.
  Questions and labels were written by separate agents. The eval files stayed sealed (hash and schema checks
  only) until [freeze-eval.json](results/freeze-eval.json) recorded the code and input hashes in commit
  `696de0b`. Every project covers the eight required traps: a denial as the answer, a conditional yes, approval
  of a heading only, an unaccepted proposal, competing versions, a revocation, a shared name, and an answer
  absent from the corpus.
- **Arms**, one addition each:
  - **A0:** Core `searchDiscovery`, published `@wirecat/cli-core` 0.412.0, over a fresh temporary store
    ([core/discover.mjs](core/discover.mjs)). Run once as published, and once with the "?" fix applied to the
    input.
  - **A1:** + native context.
  - **A2:** + E5 retrieval, fused by reciprocal rank (k = 60).
  - **A3:** + duplicate removal, MMR (λ = 0.9), and passages for units over 1,200 bytes.
  - **A4:** + mMARCO int8 reranking of the whole pool.
- **Budgets.** Pools of 50, 100 and 300 candidates. Evidence of 4, 8 and 16 KiB, serialized as
  `[source · author · time]` plus the text. Context counts against the budget. An item that does not fit is
  skipped.
- **Fixed candidates.** The same pool for every ranker (labelled units plus top BM25 and E5 hits), to isolate
  ordering. Rankers: stemmed BM25, E5, RRF, mMARCO, BGE-m3 int8.
- **Machine.** AMD Ryzen AI 9 HX 470, Linux 7.0, Python 3.12.13, ONNX Runtime 1.23.2, 4 threads, batch 1, Node
  24.19. Models are pinned by sha256 in [models.json](models.json). E5 is the exact file Core pins, copied from
  the existing local cache. No weights were downloaded.

## Results (eval, fixed discovery)

Answer metrics count the 16 answerable questions, so one question is 6 points. Items are hits with their
context.

How to read it. Each row adds one stage to the row above. An "item" is one found message with its context.

- **Answer among candidates:** the message with the answer is among the first 100 (or 300) results at all. If it
  is not, no later step can show it.
- **Answer@1 / @3 / @10:** share of questions whose answer is in the first 1, 3 or 10 items.
- **Answer MRR:** the average of 1 / rank of the first answer. 1.0 means always first, 0.5 means about second.
- **Complete evidence set:** every message needed for the full answer fits in the 8 KiB budget.
- **All conflict sides:** for competing or cancelled decisions, both the old and the new version fit in the budget.

| Arm | Answer among candidates (pool 100 / 300) | Answer@1 | Answer@3 | Answer@10 | Answer MRR | Complete evidence set | All conflict sides |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A0 published | 62% / 75% | 12% | 31% | 44% | 0.24 | 38% | 0% |
| A0 with "?" fix | 75% / 88% | 19% | 38% | 69% | 0.33 | 54% | 0% |
| A1 + context | 81% / 94% | 31% | 50% | 75% | 0.43 | 58% | 0% |
| A2 + E5 | 94% / 100% | 44% | 62% | 69% | 0.54 | 75% | 0% |
| A3 + diversity, passages | 94% / 100% | 44% | 62% | 69% | 0.54 | 75% | 0% |
| A4 + mMARCO | 94% / 100% | 38% | 69% | 94% | 0.55 | 79% | 50% |

Pool 100, 8 KiB. A1–A4 build on the fixed A0; on published A0 they follow the same pattern
([report](results/eval/report.md)). Every budget, pool and the per-kind table are in
[the eval report](results/eval-fixq/report.md). Dev and calibration reports are under [results/](results/).

**Per question** (pool 100, 8 KiB, answer rank better / worse): A0 → A1 7 / 0, A1 → A2 7 / 2, A2 → A3 0 / 0,
A3 → A4 5 / 4.

**Why mMARCO is a wash.** A cross-encoder reads the question and one message together and scores how well that
message's text matches the question. Here it replaced the whole fused order with that score. It sees no date and
does not know that a later message cancels an earlier one. Examples from eval:

- Won: "How long did Andrei estimate for building the subscription checkout?" The answer is a Russian message.
  Word search and E5 put it at rank 27, mMARCO at rank 1. It matches across languages better than E5.
- Lost: «Через что клиника сейчас шлёт людям оповещения о предстоящем приёме?» A3 had the cancelling message
  (17 September, "SMS and push only") first. mMARCO put the 10 September plan ("the messenger is the main
  channel") and the 28 August spec above it, because they talk about channels more directly. The answer fell to 4.
- Lost: "How old can the beans be, at most, when an order leaves us?" mMARCO put "beans rest 48h" and a message
  with the number 22 above the "five days" rule. It matches words and numbers, not which number answers.

Three changes were then tuned and checked on a fresh split: see [reranker variants](#reranker-variants).

**Ordering only** (fixed pool of 100): BM25 Answer@3 12%, E5 38%, RRF 44%, mMARCO 50%, BGE 62% (MRR 0.13,
0.36, 0.29, 0.43, 0.41). The 588 MB BGE export beats mMARCO at rank 3, not at rank 1 or by MRR, and costs about
6× the time.

**Six real questions** (owner's chat, exposed regression controls, totals only; the per-question report is
private). Direct support in the first five items, pool 100, 8 KiB: A0 for 5/6 questions, A2–A4 for 6/6.
Off-question items among the first 30: A0 11, A2 8, A3 6, A4 8. The real chat has messages of 7–8 KB, so at
4 KiB whole-message evidence often fits one message. That is why items are skipped, not stopped at, and why A3
trims long messages to passages. The trimmed passages were not judged, so A3's real numbers are an upper
bound.

## Reranker variants

**Why.** mMARCO alone was a wash on eval. The owner asked to test, and tune, three changes before any reranker
reaches Core: mix its score with the fused order instead of replacing it, give it `[source · author · date]` with
the text, and put the newest of two similar messages first. Rules and grid: [PROTOCOL.md](PROTOCOL.md), section
"Reranker variants".

**Setup.** Tuned on dev, calibration and eval together (38 answerable questions), which were all open by then
([tuning table](results/variants-tuning.md)). 147 variants: mMARCO or BGE int8, plain or rich input, mix weight
α 0.3–1, reranked depth 20/50/100, newest-first off or at cosine 0.87/0.90. The choice rule was written before
the results: best mean of Answer@3 and MRR, losing no `revoked`/`conflict` question and at most one question
overall against A3. Then a new `holdout` split, written by a separate agent (3 projects, 42 questions, 27
answerable, 9 revoked, 9 conflict), was frozen unread with the two chosen variants
([freeze-holdout.json](results/freeze-holdout.json)) and scored once ([holdout table](results/holdout/variants.md)).

| Variant (pool 100, 8 KiB) | Tuning Answer@3 / MRR | Holdout Answer@3 / MRR | Holdout won / lost vs A3 | Time per question | Model |
| --- | ---: | ---: | ---: | ---: | ---: |
| A3, no reranker | 50% / 0.44 | 67% / 0.61 | — | — | — |
| A4: mMARCO replaces the order | 63% / 0.49 | 78% / 0.72 | 4 / 1 | ~0.4 s (100 pairs) | 136 MB |
| mMARCO, rich input, top 50, α 0.7 | 66% / 0.52 | 81% / 0.72 | 5 / 1 | ~0.2 s (50 pairs) | 136 MB |
| **BGE int8, rich input, top 50, α 0.7** | 68% / 0.54 | **85% / 0.82** | **5 / 0** | ~1.5 s (50 pairs) | 588 MB |

One holdout question is 4 points. Time is the median over the tuning splits, 4 threads, batch 1. Peak memory with
E5, mMARCO and BGE all loaded was 2.2 GB.

What it showed:

1. **The date and author in the input helped most.** mMARCO at depth 100 and α 1 went from 63% / 0.49 to
   68% / 0.57 on the tuning set with nothing else changed.
2. **Mixing at α 0.7 removed the losses** on the tuning set (0 lost against A3) for a smaller gain. Replacing the
   order (α 1) won more and lost the clinic `revoked` question every time.
3. **Newest-first failed.** At cosine 0.90 it fixed that `revoked` question but lost three others; at 0.87 it lost
   ten. Two messages about the same thing are not the same decision, and cosine cannot tell them apart.
4. **No variant changed the `revoked` result on holdout:** 6 of 9 in the first three for every arm, A3 included.
   All 9 holdout `conflict` questions are unanswerable, and every arm kept all sides in 6 or 7 of them. The
   rerankers' holdout gains are on `fact`, `same-name` and `approval` questions.
5. **The ceiling is retrieval.** The answer was among the 100 candidates for 89% of holdout questions; the best
   variant reaches 85% in the first three.


| Stage | What it fixed | Cost measured here | Decision |
| --- | --- | --- | --- |
| "?" as punctuation in discovery | Natural questions returning nothing | none | Ship: cli-core#1935 |
| Native context (A1) | Answers separated from their question; replies without their request | ~0 ms; uses stored reply links | Ship next; check `--discover --thread` with built conversations first |
| E5 fusion (A2) | Answers lexical search never retrieves | 569 MB peak RSS with E5 alone; 3–5 ms per unit to index; 1.5 KB of index per unit (150 MB per 100k messages); 13 ms per query | Ship after context: on by itself when the E5 model is downloaded and the index built, noted in the result (owner, NEED-1799 A); never auto-download |
| Duplicates, MMR (A3) | Nothing measured | 2–6 ms | Don't ship; keep duplicate removal for real forwarded text |
| Passages for long units (A3) | Long messages crowding out the budget | E5 per sentence of long units | Keeps the answer sentence about as often as whole units on the `long` split (39% vs 42% in the first three); no gain, no ship ([long messages](#cancelled-decisions-and-long-messages)) |
| mMARCO replacing the order (A4) | Answer@10 up, but one `revoked` question lost from the first three | 136 MB model; ~0.55 s per question at pool 100, 1.6 s at 300 | Don't ship in this form |
| Reranker mixed at α 0.7, rich input, top 50 | Answer@3 on holdout: A3 67% → mMARCO 81%, BGE 85% (5 won, 0 lost) | mMARCO 136 MB, ~0.2 s; BGE 588 MB, ~1.5 s per question | Shipped in Core with mMARCO; the search for a smaller model was dropped on 30 October (a smaller one would likely cost quality) |
| Newest-first by cosine | One `revoked` question fixed, three to ten others lost | ~0 ms | Don't ship; cancelled decisions need another approach |
| Follow-ups of a hit (later units sharing a rare term) | 1 of 14 `revoked` on the open splits; 8 of 12 on `long`, which was written to a spec naming the mechanism | ~0 ms | Passed the blind re-test (4 of 15 won, 0 lost); proposed for Core ([cancelled decisions](#cancelled-decisions-and-long-messages)) |
| Reranker input cut to 256 / 128 tokens | Nothing; 3 / 6 answers lost on `long` | ~40% less CPU per pair (rerank-speed) | Keep 512 |
| Meaning floor before fusion (0.80–0.88) | Nothing at the top: no floor already lets no off-topic meaning-only item into the first five | ~0 ms | Don't add; no floor for per-message E5 ([meaning floor](#meaning-floor)) |

## Meaning floor

**Why.** Core 0.432.0 ([cli-core#1979](https://github.com/WireCatLabs/cli-core/pull/1979)) fuses discovery with
up to 100 nearest messages by E5, and keeps all 100 even when nothing in the store answers the question. Core's
existing E5 floor, 0.80 (`meaningFloor`), was measured on conversation chunks, not single messages. The question:
should discovery drop meaning hits below a minimum cosine before fusion, and at what value? The choice rule was
committed before any floor was scored ([PROTOCOL.md](PROTOCOL.md), section "Meaning floor").

**Setup.**

- Floors none, 0.80, 0.82, 0.84, 0.86, 0.88, applied to the 100 nearest messages; then the same fusion (RRF,
  k = 60). Pool 100, 8 KiB.
- A2 (discovery + E5, what Core ships) decides. A3 and the two frozen reranker mixes (rich input, `D` 50, α 0.7)
  are scored beside it.
- Word lists are the stored discovery runs (Core 0.412.0 with the "?" fix). The floor acts only on the meaning
  list, which this harness computes like Core: float32 unit vectors, mean pooling, top 100. Two differences: a
  document unit's text here starts with its section path (Core embeds the message text only), and the query is
  the raw question (Core embeds `plainWords`, see point 6 below).
- Tuning set: dev, calibration and eval (38 answerable, 10 `missing`/`premise`). Holdout: 27 answerable,
  3 `missing`, no `premise`. **The holdout was opened once already, for the reranker choice**, so it is not unseen
  data; it was scored once more, after the rule was committed.
- With no floor, every arm matched the stored per-question rows on all four splits in Answer@3, reciprocal rank,
  all conflict sides and item count (400 rows, 0 differences).
- 1–3.5 minutes per split, peak 2.2 GB with E5, mMARCO and BGE loaded, same machine as above.

"Off-topic meaning-only item": among the first five items, a hit that word search did not return and that holds
no graded message. "Words only": no meaning hit is left that word search did not also find. No result was ever
empty: every stored discovery run returned word hits for every question, so "empty or words only" is words only.

**A2 by floor** (tuning · holdout):

| Floor | Meaning hits kept (of 100) | Answer@3 | MRR | Answer@3 lost / won | Conflict sides lost | Answerable questions left words-only | `missing`/`premise` left words-only | `missing`/`premise` off-question bytes of 8 KiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 100 · 100 | 50% · 67% | 0.44 · 0.61 | — | — | 0/38 · 0/27 | 0/10 · 0/3 | 7,498 · 7,749 |
| 0.80 | 72 · 58 | 50% · 67% | 0.44 · 0.61 | 0/0 · 0/0 | 0 · 0 | 1/38 · 1/27 | 2/10 · 0/3 | 6,836 · 5,806 |
| 0.82 | 34 · 28 | 55% · 70% | 0.46 · 0.63 | 0/2 · 0/1 | 0 · 0 | 7/38 · 9/27 | 3/10 · 1/3 | 6,822 · 5,737 |
| 0.84 | 10 · 7 | 53% · 78% | 0.47 · 0.64 | 0/1 · 0/3 | 0 · 1 | 17/38 · 18/27 | 9/10 · 2/3 | 6,808 · 5,736 |
| 0.86 | 2 · 2 | 50% · 70% | 0.38 · 0.66 | 2/2 · 2/3 | 0 · 2 | 34/38 · 25/27 | 9/10 · 2/3 | 6,839 · 5,733 |
| 0.88 | 0 · 1 | 50% · 59% | 0.34 · 0.55 | 2/2 · 4/2 | 0 · 3 | 37/38 · 26/27 | 10/10 · 3/3 | 6,839 · 5,728 |

Off-topic meaning-only items in the first five on `missing`/`premise`: **0 with no floor**, on every split.

**With a reranker** (Answer@3 lost / won against the same reranker with no floor, tuning · holdout):

| Floor | mMARCO, Answer@3 | mMARCO lost / won | mMARCO conflict sides lost | BGE int8, Answer@3 | BGE lost / won | BGE conflict sides lost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 66% · 81% | — | — | 68% · 85% | — | — |
| 0.80 | 66% · 74% | 1/1 · 2/0 | 0 · 0 | 66% · 81% | 1/0 · 1/0 | 0 · 0 |
| 0.82 | 61% · 70% | 3/1 · 3/0 | 0 · 0 | 66% · 81% | 3/2 · 1/0 | 0 · 0 |
| 0.84 | 58% · 74% | 4/1 · 2/0 | 0 · 1 | 58% · 81% | 4/0 · 1/0 | 1 · 1 |
| 0.86 | 61% · 74% | 4/2 · 2/0 | 0 · 2 | 58% · 78% | 4/0 · 2/0 | 1 · 2 |
| 0.88 | 61% · 74% | 4/2 · 2/0 | 0 · 3 | 63% · 78% | 4/2 · 2/0 | 1 · 3 |

**E5 cosine, query to message** (median, 10th–90th percentile):

| Split | Answer messages | Other graded messages | Ungraded messages in the meaning top 100 | Best hit, answerable | Best hit, `missing`/`premise` |
| --- | --- | --- | --- | --- | --- |
| tuning | 0.819 (0.765–0.863) | 0.815 (0.765–0.861) | 0.811 (0.787–0.839) | 0.860 (0.836–0.890) | 0.848 (0.827–0.866) |
| holdout | 0.816 (0.767–0.861) | 0.819 (0.748–0.876) | 0.805 (0.780–0.835) | 0.875 (0.837–0.905) | 0.860 (0.850–0.876) |
| dev | 0.823 (0.770–0.866) | 0.822 (0.772–0.860) | 0.816 (0.792–0.843) | 0.862 (0.844–0.894) | 0.861 (0.844–0.888) |
| calibration | 0.794 (0.718–0.827) | 0.783 (0.739–0.837) | 0.803 (0.781–0.833) | 0.847 (0.829–0.870) | 0.833 (0.821–0.844) |
| eval | 0.837 (0.766–0.864) | 0.814 (0.767–0.868) | 0.811 (0.782–0.835) | 0.861 (0.840–0.884) | 0.839 (0.828–0.855) |

Answer messages below each floor: 0.80 → 35% · 33%, 0.82 → 50% · 53%, 0.84 → 67% · 71%. The 0.877 / 0.903 in
"Reranker variants" are cosines between two messages, a different quantity. All tables:
[results/floor.md](results/floor.md).

What it showed:

1. **The rule picks no floor.** The harm a floor was meant to stop does not reach the top: with no floor, no
   `missing` or `premise` question had an off-topic meaning-only item in the first five, on any split. Those
   first five are messages both lists found, or word hits. Meaning-only hits sit lower down.
2. **E5 cosine does not tell an answer from noise for single messages.** Answer messages (median 0.82) score like
   the ungraded messages around them (0.81), and a third of them are below 0.80. The best hit for a question
   nothing answers (0.85–0.86) overlaps the best hit for one that has an answer (0.86–0.88). At 0.84 the floor
   leaves no meaning hit that word search did not also find for 9 of 10 unanswerable questions, and for 17 of 38
   answerable ones.
3. **0.80, Core's chunk floor, is neutral for A2 and harmful after a reranker.** Without a reranker it lost and won
   nothing on either set and cut off-question bytes for `missing`/`premise` by 9% (tuning) and 25% (holdout). With
   mMARCO or BGE it lost 1–2 answers on each set.
4. **0.82–0.84 lift A2 by thinning the meaning list** (holdout Answer@3 67% → 78% at 0.84), but they leave about
   half of the answerable questions with no meaning hit, lose a conflict side on holdout from 0.84, and lose 1–4
   answers once a reranker is on. The reranker with no floor gets more (85%).
5. **No floor value makes the result abstain.** Word hits fill the 8 KiB budget for unanswerable questions with or
   without meaning hits: at 0.88 they still carry 5.7–6.8 KB of off-question text.
6. **Core's query text differs slightly.** Core embeds `plainWords(question)`, which drops the "?". That moves the
   best hit's cosine by a median of +0.010 on tuning and +0.003 on holdout (−0.017 to +0.034 per question), so a
   floor here sits up to about 0.01 below the same number in Core.

**Not measured:** real data; Core's exact message text (section paths are in the embedded text here); Core 0.432.0's own word lists (0.412.0 with the "?" fix was used); messages longer than
one chunk (Core scores a message by its first chunk; synthetic units fit in one); a threshold on the reranker
score as an abstention signal. Holdout has only 3 questions that nothing answers, so the abstention side rests
on the tuning set (10).

## Cancelled decisions and long messages

**Why.** Two items were left open. First, cancelled decisions: on holdout, 6 of 9 `revoked` questions have their
answer in the first three for every arm, and newest-first by cosine lost more than it fixed. Second, long messages:
synthetic units stop at 1,200 bytes, so the passage cut (A3) and the reranker's 512-token input cut were never
graded, while real chat messages run to 7–8 KB. The owner picked both on 30 October. Rules and choice criteria
were committed before any of it was scored ([PROTOCOL.md](PROTOCOL.md), "Cancelled decisions and long messages").

**Follow-ups of a hit.** In the failing `revoked` questions the cancelling message shares a distinctive name with
the old decision (a supplier, a code, "PIN"), not the question's words, and is mostly not a reply to it. So each of
the first `K` hits gets up to `M` later units of its project that share a term found in at most `T` units. Grid:
`K` 5/10, `M` 1/2, `T` 3/5/10, as context of the hit or as an item above it, on A3 and on Core's mMARCO mix.

- **Open splits** (dev, calibration, eval, holdout; 14 `revoked`): the rule picks **no change**. The best variants
  that lose nothing win one `revoked` question ([tuning table](results/followups-tuning.md)). Why: the shared name
  recurs in 4–8 units of a project (plan, decision, confirmation, task), so at `T` 3 there is no link, and the
  latest mentions are recaps, not the cancellation. Putting follow-ups above the hit lost 6–15 questions.
- **The `long` split** (below): the variant with the most wins and no loss on the open splits (mMARCO mix, `K` 5,
  `M` 2, `T` 3, context) lifted `revoked` Answer@3 from 17% to 83% (8 won, 0 lost). **This does not count.** The
  split's spec told its author that the cancellation shares a distinctive name with the decision, and the author
  checked that name occurs in at most 5 units, which is exactly the link this method uses. The controls cannot
  show harm either: follow-ups added as context never push a hit down. The two results disagree for that reason.
  A split written from a spec that does not describe the link is the clean test.
- **The `blind` split** (below): that test. The variant and the gate were committed and pushed before the split
  existed ([PROTOCOL.md](PROTOCOL.md), "Blind re-test of follow-ups"; [blind_gate.py](blind_gate.py)). The
  variant **passes**: `revoked` Answer@3 from 47% to 73% (7 → 11 of 15; 4 won, 0 lost), no answerable question
  lost, no control lost, MRR on the other answerable questions up 0.03, Answer@10 28 → 31 of 33
  ([gate.json](results/blind/gate.json)). The cost is room: the budget stays 8 KiB, so follow-ups push about three
  of the last items out (23.0 → 19.7 items per question). Across all five honest splits it won 5 of 29 `revoked`
  questions and lost none; on the open splits most cancellations are recapped too often for any term to be rare.
- **Where the cancelling message is** ([followup_links.py](followup_links.py),
  [followup-links.txt](results/followup-links.txt)). On `blind` the cancelling unit is a follow-up of the decision it
  cancels in 5 of 15 `revoked` questions, and only 2 of those 5 are in the decision's own source (chat, document or
  meeting); on holdout 1 of 3. Limiting follow-ups to the hit's own chat would keep less than half of the links.

**The `blind` split.** Three new projects by a separate agent that saw only a neutral brief, the format sheet and
`validate.py`, in a folder outside this repository; the brief and its generator scripts are stored with the split
([corpus/blind/writer/](corpus/blind/writer/), with the agent's [prompt](corpus/blind/writer/AGENT_PROMPT.md)). Its
saved transcript shows 9 tool calls, every path inside its own folder, no git, GitHub or web. The brief asked for decisions, some later cancelled and some still
standing, written as people really do it, and said nothing about how a cancellation refers to its decision. Sealed
([freeze-blind.json](results/freeze-blind.json)), scored once: 42 questions, 33 answerable, 15 `revoked`, 6
controls. The first run stopped in discovery: Core reads the colon in "22:00" as a field filter and throws, so the
harness now escapes a colon between digits (`--digit-colon-literal`) and froze again; no question had been scored.
Messages came out short (longest 1.9 KB), so this split adds little on long messages.

| Arm (pool 100, 8 KiB) | Answer@3 | MRR | Answer sentence shown, first 3 / 10 | `revoked` Answer@3 | Control Answer@3 | Won / lost vs Core |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A3 | 42% | 0.37 | 42% / 70% | 13% | 67% | 0 / 10 |
| **Core: mMARCO mix, replied-to message cut to 300 characters, 512 tokens** | **73%** | **0.62** | 73% / 85% | 47% | 100% | — |
| mMARCO mix, 256 tokens | 73% | 0.60 | 73% / 85% | 47% | 100% | 0 / 0 |
| mMARCO mix, 128 tokens | 70% | 0.59 | 70% / 79% | 40% | 100% | 0 / 1 |
| **Core + follow-ups `K` 5, `M` 2, `T` 3, context (the tested variant)** | **85%** | **0.73** | 82% / 91% | 73% | 100% | 4 / 0 |

The run labels the last row "exploratory, not chosen", a name carried over from `long`; on `blind` it is the
variant the protocol fixed. Report: [blind/report.md](results/blind/report.md).

**The `long` split.** Three new projects by a separate agent, sealed until the code was frozen
([freeze-long.json](results/freeze-long.json)), scored once: 42 questions, 33 answerable, 12 `revoked`, 6 controls.
Non-background unit medians 452–519 bytes, p90 2.2–3.6 KB, longest 7 KB. In 28 of 33 answerable questions the
answer sentence starts after the unit's first 1,000 bytes: the set is built so that the answer sits past a short
input cut, so its absolute numbers are a hard case, not what a real chat looks like (real median 153 tokens).

| Arm (pool 100, 8 KiB) | Answer@3 | MRR | Answer sentence shown, first 3 / 10 | `revoked` Answer@3 | Lost vs Core | Pairs cut |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A3 (passages) | 42% | 0.41 | 39% / 42% | 8% | 2 | — |
| A3, whole units | 42% | 0.40 | 42% / 42% | 8% | 2 | — |
| **Core: mMARCO mix, replied-to message cut to 300 characters, 512 tokens** | **48%** | **0.43** | 45% / 45% | 17% | — | 598 |
| mMARCO mix, whole replied-to message, 512 tokens | 48% | 0.43 | 45% / 45% | 17% | 0 | 598 |
| mMARCO mix, 256 tokens | 39% | 0.35 | 36% / 45% | 8% | 3 | 1,164 |
| mMARCO mix, 128 tokens | 30% | 0.25 | 30% / 36% | 8% | 6 | 1,520 |
| Core + follow-ups (exploratory, see above) | 73% | 0.68 | 70% / 70% | 83% | 0 (8 won) | — |

One question is 3 points. "Pairs cut" counts reranker pairs (42 questions × 50) longer than the cap. About ten items
fit the budget per question. Report: [long-spanfix/report.md](results/long-spanfix/report.md).

What it showed:

1. **Keep the reranker at 512 tokens.** 256 tokens lost 3 answers and 128 lost 6. Even at 512, 598 of 2,100 pairs
   were cut, so the reranker never read the end of a long hit; that is where this split puts the answer.
2. **Passages neither help nor hurt.** The answer sentence is shown in the first three for 39% of questions with
   passages and 42% with whole units (one question); Answer@3 is the same. A first count said passages lost far
   more (27%); that was a scoring error with multi-sentence quotes, fixed and kept visible
   ([first run](results/long/report.md), PROTOCOL.md "span check fixed").
3. **Long messages halve the answers.** Core's order gets 48% Answer@3 here against 81% on the short holdout.
   Most of the gap is the cut: the answer is past what the reranker reads.

## In Core

**Why.** The owner decided to use the reranker by default, since it improves search (25 October 2026). cli-core
[feat/discover-rerank](https://github.com/WireCatLabs/cli-core/tree/feat/discover-rerank) adds the winning variant
to `search messages --discover`: top 50, rich input, α 0.7, mMARCO by default, BGE int8 by profile setting. The
numbers above are native ONNX Runtime; Core runs every model through WebAssembly
(`@wirecat/cli-core-onnx`, ONNX Runtime 1.30.0). The questions: do the scores survive the change of runtime, and
does scoring fit discovery's 2 s?

**Setup.** Same laptop (Ryzen AI 9 HX 470, Linux 7.0, Node 24.19), 8 threads, batch 1, the pinned files of
[models.json](models.json). Synthetic data only, a fresh temporary state folder and store for every run.

- Agreement: 9 holdout questions (3 per project), each with its graded units plus random units of the same
  project to 50, as `[source · author · date] text`. [rerank_pairs.py](rerank_pairs.py) scores them natively,
  [core/rerank-agreement.mjs](core/rerank-agreement.mjs) through Core's runtime and tokenizer.
- Latency: [core/rerank-latency.mjs](core/rerank-latency.mjs) over cli-core's build, a synthetic store of
  100,000 messages in 20 chats, 4 natural questions. `inprocess` is one CLI call: a fresh process per question.
  `warm` is the MCP server: the reranker held in its own process, two rounds.
- Memory: [core/rerank-memory.mjs](core/rerank-memory.mjs), one cold `--discover` on 1,000 messages with E5
  vectors built, so E5 and then the reranker load into one process, as in the CLI.

```sh
python -I rerank_pairs.py . CACHE/mmarco onnx/model_quint8_avx2.onnx /var/tmp/pairs-mmarco.json
(cd CLI_CORE && node "$OLDPWD/core/rerank-agreement.mjs" CACHE/mmarco onnx/model_quint8_avx2.onnx /var/tmp/pairs-mmarco.json 8)
node core/rerank-latency.mjs CLI_CORE/dist CACHE mmarco inprocess 1 0    # question 0, one cold call
node core/rerank-latency.mjs CLI_CORE/dist CACHE mmarco warm 2
```

**Results.**

| | mMARCO | BGE int8 |
| --- | ---: | ---: |
| Token ids, Core vs Python `tokenizers` (450 pairs) | 450 identical | 450 identical |
| Spearman, WebAssembly vs native scores, per question | 0.97–0.99 | 0.87–0.98 |
| Questions whose first three stay the same | 7 of 9 | 8 of 9 |
| Load, cold | 0.8–1.0 s | 1.0–1.3 s |
| Scoring 50 hits, cold CLI call | 0.9–1.7 s | 6.7–9.8 s |
| Scoring 50 hits, warm (MCP) | 0.83–1.0 s (first call 1.7 s) | 6.8–9.7 s |
| Native, for comparison (table above) | ~0.2 s | ~1.5 s |
| Word search of discovery itself | 0.15–0.3 s | 0.15–0.3 s |
| Peak memory, cold `--discover` with E5 (without a reranker: 1.0 GB) | 1.6 GB | 2.8 GB |

What it showed:

1. **The scores survive.** Tokens are identical; the small score differences come from the int8 kernels, and
   the order barely moves.
2. **WebAssembly is 4–6× slower than native.** mMARCO alone takes about half of discovery's 2 s on a cold CLI
   call, and with the word search it passed 2 s on one question in four. BGE never fits 2 s.
3. **So scoring is not on the word search's clock in Core.** Loading and scoring both sit outside discovery's
   2 s; scoring has 15 s of its own, and a reranking that would not finish is dropped, never the search. At a
   10 s cap BGE was dropped on one question in four.
4. **BGE as the default would make every `--discover` take 7–10 s** on this laptop. mMARCO stays the default.
5. The x86 name of the mMARCO file (`quint8_avx2`) does not matter in Core: WebAssembly runs the same file on
   any processor. The `qint8_arm64` file of the same revision gave the same agreement and speed here.

Not measured: Answer@3 through Core's own discovery (the holdout above used the harness's fused order), Bun,
arm64 and Apple silicon (inferred from WebAssembly, not run), slower processors, real messages.

## What was not measured

- Abstention, answer generation, claim support. A meaning floor is not an abstention signal
  ([meaning floor](#meaning-floor)).
- A learned feature ranker: it needs a broader dev set.
- A 2–5 GB control model.
- Core's own conversation-chunk E5 search: the E5 arm here embeds units directly.
- Document and transcript search paths: here documents and transcripts were loaded as messages.
- Human judgment, and agreement between two assessors on the synthetic labels.
- Follow-ups on real archives; the blind split is 15 `revoked` questions, written by one agent.
- Feeding the reranker the passage nearest the question instead of the start of a long hit.

Splits are small (16 answerable eval questions) and machine-written. Core thread context needs a conversation
build, and the temporary store had none, so A1's context comes from this harness, not from Core.

## Reproduce

From cli-testing, with the models in `CACHE` and a Python environment from [requirements.lock](requirements.lock):

```sh
(cd performance/search/evidence-pipeline/core && pnpm install --ignore-workspace)
performance/search/evidence-pipeline/run.sh eval /var/tmp/new-eval CACHE PYTHON --question-mark-punctuation --mmr-lambda 0.9
```

Reranker variants (both rerankers in `CACHE`):

```sh
performance/search/evidence-pipeline/run.sh holdout /var/tmp/new-holdout CACHE PYTHON --question-mark-punctuation \
  --pools 100 --budgets 8192 --mmr-lambda 0.9 --fixed-models '' --variants mmarco,bge-int8 --taus 0.87,0.90
python3 performance/search/evidence-pipeline/variants_report.py /var/tmp/new-holdout/arms.json \
  --frozen performance/search/evidence-pipeline/results/freeze-holdout.json
```

[run.sh](run.sh) gives every step a fresh temporary HOME, store and state. A result path that exists is refused.
[measure_e5.py](measure_e5.py) measures E5 alone. [validate.py](validate.py) checks a split and prints only
counts and hashes.

Follow-ups (stored discovery runs, mMARCO in `CACHE`) and the long split:

```sh
cd performance/search/evidence-pipeline
PYTHON -I pipeline.py --split dev --discovery results/dev-fixq/discovery.json --models CACHE \
  --output /var/tmp/new-followups-dev/arms.json --pools 100 --budgets 8192 --fixed-models '' --mmr-lambda 0.9 --followups
PYTHON -I followups_report.py /var/tmp/new-followups-*/arms.json
node core/discover.mjs /var/tmp/long-discovery.json questions/long corpus/long/*.json --question-mark-punctuation
PYTHON -I pipeline.py --split long --discovery /var/tmp/long-discovery.json --models CACHE \
  --output /var/tmp/new-long/arms.json --pools 100 --budgets 8192 --fixed-models '' --mmr-lambda 0.9 --long
PYTHON -I long_report.py /var/tmp/new-long/arms.json
./long.sh blind /var/tmp/new-blind CACHE PYTHON    # validate, discovery, pipeline, report.md, gate.json
PYTHON -I followup_links.py dev calibration eval holdout long blind
```

[long.sh](long.sh) runs every step of the blind (or long) split under a fresh temporary HOME. Re-run on 31 October
2026 into a new folder: all 294 rows equal to [results/blind](results/blind/) in Answer@3, reciprocal rank, all
conflict sides, items, bytes and span, and the same `gate.json`.

Run each under a fresh temporary HOME, as `run.sh` does. Calibration reads `results/calibration-l0.9`, eval
`results/eval-fixq`, holdout `results/holdout`.

Meaning floor (stored discovery runs, both rerankers in `CACHE`):

```sh
cd performance/search/evidence-pipeline
./floor.sh dev results/dev-fixq/discovery.json /var/tmp/new-floor-dev CACHE PYTHON
PYTHON -I floor_report.py tuning=/var/tmp/new-floor-dev/floors.json
```

The other splits read `results/calibration-l0.9`, `results/eval-fixq` and `results/holdout`. `floor_report.py`
takes `NAME=a.json,b.json` groups; [results/floor.md](results/floor.md) was made from `results/floor-*`.
