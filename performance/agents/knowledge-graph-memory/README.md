# Knowledge graph memory benchmark preparation

Memo searches stored notes, mail and messages, but that does not tell us whether a graph memory engine
answers changing agreements more accurately. This fixture prepares a comparison with Hindsight first,
Graphiti second and Cognee third. It asks whether better answers and citations justify another index,
provider costs and setup. Engine runs are pending a provider/model decision; the table below validates
only the fixture and scorer and makes no claim about engine quality.

## Setup

Run the standard-library Python script with a new output directory:

```sh
python3 performance/agents/knowledge-graph-memory/run.py --self-check --output /tmp/kg-memory-check
```

The recorded self-check used Python 3.14.4 on Linux, with no external packages, model or network calls.
The fixed seed is 20261024. It produces 2,000 synthetic records: 500 Telegram messages, 500 emails,
500 notes and 500 meeting passages. All names, accounts and references are invented.
Ten projects carry original deadlines, confirmed replacements, rejected date suggestions, owners,
commitments and unknown budgets. The 50 questions include current versus original agreements,
misleading mentions and explicit unknown answers. Distractors add separate archive conversations.

The script writes `corpus.jsonl`, `queries.json`, `oracle.json` and `manifest.json` with a corpus hash.
Give engines only the corpus and queries. The answer key stays outside retrieval and prompts.
`as_of` is the latest time an answer may use; ingest chronologically and retain source ids verbatim.
Each row's `kind` preserves its source; these are interchange records, not real provider exports.

## Harness result

Output of the exact command above:

| Run | Records | Questions | Correct | Correct with sources | Stale answers |
|---|---:|---:|---:|---:|---:|
| Harness self-check (oracle answers) | 2000 | 50 | 50 | 50 | 0 |
| Memo (not run) | 2000 | 50 | — | — | — |
| Hindsight (not run) | 2000 | 50 | — | — | — |
| Graphiti (not run) | 2000 | 50 | — | — | — |
| Cognee (not run) | 2000 | 50 | — | — | — |

The self-check also injects a stale deadline, a fabricated citation and an invented budget. The scorer
must report 48 correct answers, 47 correctly cited answers and one stale answer. These checks prove
that the scoring path rejects those errors; they do not exercise any engine.

## Run an engine

Use an isolated engine instance and pin its exact package/container version and image digest before
installing it. Record the LLM, embedding model, prompts, retrieval limits and all configuration alongside
its predictions. No provider, credentials or spending policy is selected by this script.

- [Hindsight retain](https://hindsight.vectorize.io/developer/api/retain): preserve each record's source id
  when retaining it, then recall/reflect for the questions. Check that source ids survive generated answers.
- [Graphiti](https://github.com/getzep/graphiti): ingest dated episodes and evaluate current versus original
  facts. Graph extraction requires a configured model; graph validity must not turn a suggestion into a decision.
- [Cognee](https://docs.cognee.ai/): select and record the retrieval mode. A provider-free graph and an
  LLM-built graph are separate configurations; do not treat them as the same experiment.
- Memo: seed a disposable store through public CLI import commands, then drive `search all` and `ask` from
  the outside. Do not import Memo source or store APIs. Record the answer-generation model too.

Adapters are not implemented yet. Normalize each engine answer to a short final value and its evidence:

```json
[
  { "id": "q01", "answer": "2026-12-11", "citations": ["msg:email/synthetic%40example.test/thread-2/2"] }
]
```

A real file must contain all 50 question ids exactly once. `unknown` is the abstention value, with no
citations. Values are compared after case and whitespace normalization. A correct citation requires the
expected source set; citing unrelated records is not credit. Preserve raw engine responses separately
so that normalization can be reviewed without reading the answer key.

Score the completed predictions with the recorded engine name and version:

```sh
python3 performance/agents/knowledge-graph-memory/run.py --predictions /tmp/hindsight-answers.json --engine Hindsight-VERSION --output /tmp/hindsight-scores
```

The output directory must not already exist; the script never deletes prior results.

## What remains unmeasured

No engine accuracy, ingest duration, latency distribution, token usage, cost, disk footprint, installation
size or offline behavior has been measured. Record these during engine runs, with p50/p95 query times and
token/cost totals reported separately from quality. This small English template corpus is a pilot, not
LongMemEval, multilingual coverage or evidence that graph memory improves Memo. It needs broader wording
and repeated runs before a product decision. No store export integration is justified by this self-check.
