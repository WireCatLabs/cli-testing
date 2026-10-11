# Evidence supplements

Use these experiments to decide whether a small model should add evidence to search results.
Keeping ten lexical results and adding two model selections recovers some missed answers. A
stable merge keeps those two selections in their original search order and avoids the measured
ranking regression. This remains an offline experiment; the CLI keeps its model-free default.

## Results

We tested published SDK **0.229.0**, the pinned MiniLM-L6 model from the
[compact comparison](../compact/README.md), and synthetic messages only. The first fixture has
24 new questions with crowded candidate pools. A second, targeted five-question fixture tests
evidence at positions 11–12. Three older controls add 128 questions. The same agent wrote and
judged all fixtures; this is development evidence, not independently measured user accuracy.

| Set | Baseline answers in twelve | Stable supplement | Evidence Recall@12, before → after |
|---|---:|---:|---:|
| New crowded cases | 8/14 | 10/14 | 44.2% → 50.0% |
| Targeted boundary cases | 4/5 | 5/5 | 80.0% → 100.0% |
| Older templates | 48/56 | 52/56 | 90.6% → 93.8% |
| Earlier fresh cases | 16/16 | 16/16 | 100% → 100% |
| Permission-question cases | 16/16 | 16/16 | 100% → 100% |

The answer fraction counts questions where at least one labeled actual answer is delivered.
Evidence Recall counts all labeled useful messages, including supporting and contradictory
records. Questions without an answer are excluded from the answer denominator. Ranking quality
uses graded nDCG@12. None of these measures proves that an agent answers correctly or abstains.

The two newly recovered answers concern a current version and a terse reply. Long answers remain
unrecovered in two English questions, and Russian queries retain the baseline order. Questions
with missing facts still return partial matches. Preserving ten means this design does **not**
improve Answer@10 or the ranking of those first ten results.

The original neural supplement swapped an answer and supporting record at positions 11–12 in
one boundary case, reducing nDCG from 0.5101 to 0.5059. The stable merge chooses the same messages
but restores their baseline order. It has no measured per-query loss of actual answers, evidence
or nDCG across all five sets and tested budgets. It was designed after inspecting the failure;
these passing checks are regression evidence, not independent validation.

## Size and runtime

Model assets remain **23.9 MB**, including the 23.2 MB quantized weights. On this machine, the new
worker loaded in 55 ms, scored eligible pairs at English-query p50 **162 ms**, p95 **232 ms**, and
peaked at **105.5 MiB**. These numbers describe the Python/ONNX worker, excluding the CLI and
retrieval. They are not total application memory or end-to-end latency.

Long messages exposed a real constraint: the unchanged worker rejected pairs over **512 tokens**.
The follow-up explicitly excludes those pairs from the original top-100 shortlist and records
the exclusions. It does not clip text, widen the shortlist or remove long baseline messages.
The 24-query fixture excludes 106 query/message pairs, counting repeated query appearances.
A long answer outside the baseline cannot be recovered by this policy.

## Delivery boundaries

The evaluator compares twelve results and identical UTF-8 JSON byte budgets. The new crowded
cases all fit under 4 KiB, so that check alone is weak. The targeted cases and older controls also
exercise 512- and 1,024-byte budgets. Under tight limits, the two extra selections often cannot
be delivered, so the apparent twelve-result gain disappears.

Independent unit counterexamples show that preserving ten does not guarantee preserving useful
baseline results at 11–12. They also show how a long supplement can prevent a later answer from
fitting. The stable merge fixes the observed ordering problem, but cannot guarantee safety for
arbitrary candidate pools. Byte simulation uses complete id/text records, not the CLI response
schema; a token budget would need a separate check.

## Reproduce

See [the protocol](PROTOCOL.md) for frozen fixture hashes and the sequence of exploratory changes.
Use the hash-locked Python environment and model preparation from
[the compact comparison](../compact/README.md#reproduce-and-evidence). Select an installed SDK and its dependency
root explicitly; all stores are new synthetic stores.

```sh
python3 performance/search/run.py \
  --messaging-root "$SEARCH_MESSAGING_ROOT" \
  --dependency-root "$SEARCH_DEPENDENCY_ROOT" production \
  --fixture "$PWD/performance/search/supplement/fixture.json" > /tmp/supplement-baseline.json
"$SEARCH_PYTHON" performance/search/supplement/validate.py export \
  --baseline /tmp/supplement-baseline.json --output /tmp/supplement-inputs \
  --tokenizer "$SEARCH_MODEL_CACHE/tokenizer.json"
"$SEARCH_PYTHON" performance/search/matrix/neural.py \
  --input /tmp/supplement-inputs/context.json \
  --cache "$SEARCH_MODEL_CACHE" --manifest "$SEARCH_MODEL_CACHE/manifest.json" \
  --batch-size 1 --threads 4 --shortlists /tmp/supplement-inputs/context-top100.json \
  --output /tmp/supplement-scores.json
python3 performance/search/supplement/validate.py evaluate --stable \
  --baseline /tmp/supplement-baseline.json --scores /tmp/supplement-scores.json \
  --output /tmp/supplement-report.json
python3 performance/search/supplement/test_delivery.py
```

For boundary cases, retrieve `boundary.json` and pass `--fixture boundary` to export/evaluate.
Omit `--stable` to compare the initial neural order. `controls.py` evaluates the older pinned
MiniLM context/batch1/top100 scores without another inference run. The committed
[results](results/stable.json), [boundary results](results/boundary-stable.json) and
[older controls](results/controls.json) retain every query trace. Raw input/score hashes and
retained local paths are in [raw-artifacts.json](results/raw-artifacts.json).

## Production decision

Keep model-free discovery as shipped. The stable supplement is the strongest measured model
option here, but it still needs a portable runtime, full CLI latency/RAM measurements and fresh
independent judgments before a production rollout. Current fixtures do not justify more model
sweeps, a confidence threshold or a default download. The next useful integration work would
make the supplement optional, visibly distinguish added evidence and preserve account/chat/date
scope checks and explicit size limits. No model, dependency or client release is needed for
these research-only changes.
