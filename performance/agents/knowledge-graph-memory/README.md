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

## API cost plan (24 October 2026)

The generated corpus contains 296,860 text characters. Tokenizing each body independently with
`tiktoken==0.14.0`, encoding `o200k_base`, gives 60,175 tokens; the whole JSONL gives 147,426 tokens.
This encoding is a proxy, not a guarantee of the selected model's billed token count.
The source text is small; repeated system prompts, graph context and generated facts dominate cost.

Use the standard-library estimator to reproduce the planning table:

```sh
python3 performance/agents/knowledge-graph-memory/estimate.py
```

| Scenario | Input tokens | Output tokens | GPT-6 Luna | GPT-6.1 Sol |
|---|---:|---:|---:|---:|
| Lean | 18,800,000 | 2,560,000 | $3.16 | $63.20 |
| Higher overhead | 85,600,000 | 14,400,000 | $15.76 | $315.20 |

These are assumptions, not engine measurements or upper bounds. The lean scenario assumes 1, 4 and 1
completion calls per source record for Hindsight, Graphiti and Cognee; the higher-overhead scenario
assumes 3, 8 and 3. Each call averages 1,500 input/200 output tokens or 3,000 input/500 output tokens.
Both add 200 answer calls (50 questions across four systems), averaging 4,000 input/800 output tokens
or 8,000 input/2,000 output tokens. Output includes any billed reasoning tokens.

The rates are the short-context Standard prices from [OpenAI pricing](https://developers.openai.com/api/docs/pricing):
Luna $0.10 input/$0.50 output and Sol $2 input/$10 output per million tokens. The table assumes no
caching, Batch or Flex discounts and no cache writes. Regional uplifts, retries, extra consolidation,
longer context and repeated full runs can increase the bill. Each new full ingest costs again.
At [text-embedding-3-small's listed rate](https://developers.openai.com/api/docs/models/text-embedding-3-small),
embedding all source bodies once for each graph engine is about $0.004; generated facts and repeated
embedding add tokens. Local embedding models avoid that API line. Hosting and graph database costs
are separate and are not estimated here.

Why count extra completion calls? [Hindsight retain](https://hindsight.vectorize.io/developer/api/retain)
extracts facts through an LLM, while [Graphiti's node processing](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/node_operations.py)
and [edge processing](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py)
include extraction, deduplication, summaries and temporal resolution. A bulk API does not establish
one model call for the whole corpus. The exact multiplier needs a metered pilot.

Recommended sequence: a 100-record Hindsight pilot under a $1 cap, then update this estimate from
actual input/output usage before authorizing the 2,000-record comparison. Start with a small model
only after checking structured-output compatibility and extraction quality. A $20 cap is a reasonable
planning allowance for the small-model full comparison, not a promise it will finish. The call path
must reserve a request's maximum cost before dispatch, include retries, and stop before its cap.
No paid request or credential access has occurred for this estimate.

### Reusing the coding assistant

Fixture design, adapter implementation and exact answer/citation scoring need no model API calls.
The benchmark's scorer is deterministic, so it also avoids a paid LLM judge. A developer assistant
can review failures, but should not answer a measured trial after seeing its answer key.

[Cognee documents MCP sampling](https://docs.cognee.ai/setup-configuration/llm-providers): a server can
request completions from a host that explicitly grants that capability. This could reuse a host's
model, but host support has not been verified here, embeddings are still required, and it would be
a separately recorded configuration. It is not evidence that Hindsight or Graphiti can use a chat
subscription in place of their configured model clients.
