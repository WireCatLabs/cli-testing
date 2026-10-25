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
   questions. That fails the "no regression on conflict evidence" gate.
6. **Still unsolved in every arm:** both `conflict` questions miss Answer@3. At most half of the conflict/revoked
   questions get all their sides inside the budget. Roughly 89% of every budget is off-question bytes. Nothing
   abstains: every arm fills the budget for unanswerable questions too.

Recommended next slice: merge and release the "?" fix, then make native context part of discovery's evidence
(check first whether `--discover --thread` on a store with built conversations already does it). Next comes a
per-message E5 index fused with discovery, behind the existing local-model choice. No new model download.
Details in [the decision table](#decision-table).

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

Untested changes that may keep the wins and lose fewer: mix its score with the fused order instead of replacing
it, give it the date and author with the text, and put the newest of competing decisions first in a separate step.
Testing them needs a new sealed eval split; this one is now open.

**Ordering only** (fixed pool of 100): BM25 Answer@3 12%, E5 38%, RRF 44%, mMARCO 50%, BGE 62% (MRR 0.13,
0.36, 0.29, 0.43, 0.41). The 588 MB BGE export beats mMARCO at rank 3, not at rank 1 or by MRR, and costs about
6× the time.

**Six real questions** (owner's chat, exposed regression controls, totals only; the per-question report is
private). Direct support in the first five items, pool 100, 8 KiB: A0 for 5/6 questions, A2–A4 for 6/6.
Off-question items among the first 30: A0 11, A2 8, A3 6, A4 8. The real chat has messages of 7–8 KB, so at
4 KiB whole-message evidence often fits one message. That is why items are skipped, not stopped at, and why A3
trims long messages to passages. The trimmed passages were not judged, so A3's real numbers are an upper
bound.

## Decision table

| Stage | What it fixed | Cost measured here | Decision |
| --- | --- | --- | --- |
| "?" as punctuation in discovery | Natural questions returning nothing | none | Ship: cli-core#1935 |
| Native context (A1) | Answers separated from their question; replies without their request | ~0 ms; uses stored reply links | Ship next; check `--discover --thread` with built conversations first |
| E5 fusion (A2) | Answers lexical search never retrieves | 569 MB peak RSS with E5 alone; 3–5 ms per unit to index; 1.5 KB of index per unit (150 MB per 100k messages); 13 ms per query | Ship after context, opt-in where the E5 model is already downloaded; never auto-download |
| Duplicates, MMR (A3) | Nothing measured | 2–6 ms | Don't ship; keep duplicate removal for real forwarded text |
| Passages for long units (A3) | Long real messages crowding out the budget | E5 per sentence of long units | Promising on real data only; needs judged passages |
| mMARCO (A4) | Answer@10 up, but one `revoked` question lost from the first three | 136 MB model; ~0.55 s per question at pool 100, 1.6 s at 300 | Benchmark comparator only |
| BGE int8 | Best Answer@3 with fixed candidates | 588 MB; 3.4 s per question at pool 100 | Comparator only |

## What was not measured

- Abstention, answer generation, claim support.
- A learned feature ranker: it needs a broader dev set.
- A 2–5 GB control model.
- Core's own conversation-chunk E5 search: the E5 arm here embeds units directly.
- Document and transcript search paths: here documents and transcripts were loaded as messages.
- Human judgment, and agreement between two assessors on the synthetic labels.

Splits are small (16 answerable eval questions) and machine-written. Core thread context needs a conversation
build, and the temporary store had none, so A1's context comes from this harness, not from Core.

## Reproduce

From cli-testing, with the models in `CACHE` and a Python environment from [requirements.lock](requirements.lock):

```sh
(cd performance/search/evidence-pipeline/core && pnpm install --ignore-workspace)
performance/search/evidence-pipeline/run.sh eval /var/tmp/new-eval CACHE PYTHON --question-mark-punctuation --mmr-lambda 0.9
```

[run.sh](run.sh) gives every step a fresh temporary HOME, store and state. A result path that exists is refused.
[measure_e5.py](measure_e5.py) measures E5 alone. [validate.py](validate.py) checks a split and prints only
counts and hashes.
