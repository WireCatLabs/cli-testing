# Knowledge graph memory benchmark preparation

Memo searches stored notes, mail and messages, but that does not tell us whether a graph memory engine
answers changing agreements more accurately. This fixture prepares a comparison with Hindsight first,
Graphiti second and Cognee third. It asks whether better answers and citations justify another index,
provider costs and setup. Engine runs are pending a provider/model decision; the table below validates
only the fixture and scorer and makes no claim about engine quality. A Memo retrieval-only baseline, with
no answer model, is [below](#memo-retrieval-baseline-2-november-2026).

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

## Memo retrieval baseline (2 November 2026)

**Why it was run.** This is the first step of the WireCat comparison with Hermes, OpenClaw and Hindsight. It
needs no model API and no money. The question: does Memo's own search put the record that answers each
question near the top? Any answer model built on Memo can only cite what this search returns. The run
measures retrieval only. It has no answer model, so it makes no claim about answer accuracy. The Memo row
in the harness table above stays "not run".

### Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0, Python 3.14.4, Node 24.19.0.
- `@wirecat/cli-memo` 0.131.13, the published package installed globally, driven as the `memo` binary.
- The fixture from `run.py --self-check`, corpus sha256 `1d36697c…5e8802`.
- Embedding model for the hybrid rows: `e5-small` (multilingual-e5-small, 8-bit ONNX, 135 MB), downloaded
  with `memo models download`. It runs on this computer; no paid API.

```sh
python3 performance/agents/knowledge-graph-memory/run.py --self-check --output /tmp/kg-fixture
python3 performance/agents/knowledge-graph-memory/memo_baseline.py --fixture /tmp/kg-fixture --output /tmp/kg-memo
```

[`memo_baseline.py`](memo_baseline.py) is standard-library Python. It runs memo in a new directory with
its own `HOME`, `XDG_*`, `MEMO_CONFIG_DIR`, `MEMO_STATE_DIR`, `MEMO_CACHE_DIR`, `WIRECAT_STATE_DIR` and
`WIRECAT_CONFIG_DIR`. It also sets `DBUS_SESSION_BUS_ADDRESS=disabled:`, so memo cannot reach the keyring.
`memo store info` reported the store inside that directory. Nothing signs in.

**How the corpus gets in.** Only public commands are used:

| Corpus kind | Records | How it is ingested | Native? |
|---|---:|---|---|
| mail | 500 | A Google Takeout-style mbox file and a `mail.accounts` entry with `"mode": "mbox"`, then `memo sync --source email:synthetic --since-time 2000-01-01 --limit 5000` | yes, stored as mail |
| notes | 500 | Markdown files, `memo folders add <dir> --format markdown`, then `memo sync --only notes` | yes |
| telegram | 500 | Markdown notes in the same folder | **no** |
| meetings | 500 | Markdown notes in the same folder | **no** |

- **Telegram cannot be ingested from a file.** `tg`, `max` and `wa` have no command that imports an
  exported chat. They only sync from a signed-in account. So WireCat cannot take in outside chat data yet.
- **Meetings are not imported natively.** `zm <profile> meetings import <folder>` reads VTT files. But it
  needs a zm profile, and `memo search all` does not search meetings at all: its help lists messages, mail,
  notes and calendar events. Native meeting records would be invisible to this metric.
- **The mbox reader takes only Gmail Takeout's shape.** Each email needs `From <digits>@xxx <date>` and
  `X-GM-THRID`. The adapter writes that shape with invented ids.
- **How a hit maps back to the corpus.** Each record is named `r0001`…`r2000`: the note's file name or the
  email's subject. Memo returns that name as the hit's `title`. The adapter keeps a table from name to corpus
  id. The ids themselves never enter the text, because words like "telegram" would become searchable.
  Each note file's modification time is set to the record's timestamp.

**What is measured.** The adapter runs each question through `memo search all <query> --limit 10 --json`,
one process per query, after one warm-up search that is not counted. It reads `oracle.json` only when it
scores. 10 of the 50 questions are "unknown budget" questions with no source to find. Recall is scored over
the other 40. Each of those has exactly one expected source, so recall@k is "the source is in the top k".

Four runs on one store:

1. **Lexical, verbatim:** the question as written, `--exact` (word search, no meaning search).
2. **Lexical, OR:** the question's words minus a fixed list of English function words, quoted and joined
   with `OR`, `--exact`. This rewrite is deterministic and does not look at the answer key.
3. **Hybrid, verbatim:** the question as written, with meaning search, after embedding with `e5-small`.
4. **Hybrid, OR:** the OR query with meaning search.

### Results

| Run | Questions scored | Recall@1 | Recall@5 | Recall@10 | p50 s | p95 s | Empty replies |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lexical, question verbatim | 40 | 0.00 | 0.00 | 0.00 | 0.27 | 0.32 | 50 of 50 |
| Lexical, content words joined by OR | 40 | 0.25 | 0.75 | 1.00 | 0.30 | 0.35 | 0 |
| Hybrid (e5-small), question verbatim | 40 | 0.25 | 0.30 | 0.30 | 1.05 | 1.19 | 0 |
| Hybrid (e5-small), content words joined by OR | 40 | 0.25 | 0.55 | 0.55 | 1.07 | 1.23 | 0 |

The times are the wall time of one `memo search all` process. `memo --version` alone takes 0.04 s at p50
and 0.05 s at p95.

| Step | Time |
|---|---:|
| `folders add` | 0.33 s |
| Notes sync, 1,500 files, no embedding | 1.14 s |
| Mail sync, 500 emails from mbox, no embedding | 1.97 s |
| Model download (`e5-small`, plus ONNX Runtime) | 14.9 s |
| Embedding sync, 2,000 records | 9.4 s |

The store (`wirecat.db` and its write-ahead files) holds 3.5 MB after the sync without embedding and
11.3 MB after embedding, measured in a fourth run. Four full runs from new folders gave the same recall.
Comparing two runs reply by reply, 3 of 200 replies differed: hits with equal scores swapped places below
the expected source. The tables show the second run. Query times move between runs: in the fourth run the
hybrid verbatim p50/p95 was 1.63/2.72 s, while other work ran on the same computer.

Rank of the expected source in each question's top 10 ("—" means not in the top 10):

| Question | Asks for | Source kind | Lexical verbatim | Lexical OR | Hybrid verbatim | Hybrid OR |
|---|---|---|---:|---:|---:|---:|
| q01 | current date | mail | — | 1 | — | 1 |
| q02 | original date | telegram | — | 2 | — | — |
| q03 | owner | notes | — | 2 | 1 | 2 |
| q04 | commitment | meetings | — | 6 | 2 | 2 |
| q06 | current date | mail | — | 1 | — | 1 |
| q07 | original date | telegram | — | 2 | — | — |
| q08 | owner | notes | — | 2 | — | — |
| q09 | commitment | meetings | — | 6 | 1 | 2 |
| q11 | current date | mail | — | 1 | — | 1 |
| q12 | original date | telegram | — | 2 | — | — |
| q13 | owner | notes | — | 2 | 1 | 2 |
| q14 | commitment | meetings | — | 6 | — | — |
| q16 | current date | mail | — | 1 | — | 1 |
| q17 | original date | telegram | — | 2 | 2 | 4 |
| q18 | owner | notes | — | 2 | 1 | 2 |
| q19 | commitment | meetings | — | 6 | — | — |
| q21 | current date | mail | — | 1 | — | 1 |
| q22 | original date | telegram | — | 2 | — | — |
| q23 | owner | notes | — | 2 | 1 | 2 |
| q24 | commitment | meetings | — | 6 | — | — |
| q26 | current date | mail | — | 1 | — | 1 |
| q27 | original date | telegram | — | 2 | — | — |
| q28 | owner | notes | — | 2 | 1 | 2 |
| q29 | commitment | meetings | — | 6 | — | — |
| q31 | current date | mail | — | 1 | — | 1 |
| q32 | original date | telegram | — | 2 | 1 | 2 |
| q33 | owner | notes | — | 2 | 1 | 2 |
| q34 | commitment | meetings | — | 6 | — | — |
| q36 | current date | mail | — | 1 | — | 1 |
| q37 | original date | telegram | — | 2 | — | — |
| q38 | owner | notes | — | 2 | — | — |
| q39 | commitment | meetings | — | 6 | — | — |
| q41 | current date | mail | — | 1 | — | 1 |
| q42 | original date | telegram | — | 2 | — | — |
| q43 | owner | notes | — | 2 | — | — |
| q44 | commitment | meetings | — | 6 | — | — |
| q46 | current date | mail | — | 1 | — | 1 |
| q47 | original date | telegram | — | 2 | 1 | 4 |
| q48 | owner | notes | — | 2 | 1 | 2 |
| q49 | commitment | meetings | — | 6 | — | — |

The adapter writes every raw reply under `raw/<run>/<question>.json`, plus `per-query.json` and
`results.json`.

### What it showed

- **A question typed as a sentence finds nothing by words.** Word search needs every word in one record.
  No record holds "what", "is", "current" and the project name together, so all 50 replies were empty.
  The question mark is not the cause: "Who is the confirmed delivery owner of Amber Kite" without it also
  returned nothing, while "Amber Kite delivery owner" found the owner note.
- **The same words joined by OR find every source in the top 10.** Recall@10 is 1.00 and recall@5 is 0.75.
  An agent that sends keywords with OR gets the evidence. An agent that sends the question does not.
- **`search all` alternates sources and does not rank them together.** In every OR reply the 10 hits went
  mail, note, mail, note… (250 mail and 250 notes over 50 queries). So a note can never be first while any
  email matches. Recall@1 is 0.25 in every row that returns mail: only the mail questions (the current
  date) get rank 1. Every telegram or notes source sits at rank 2, and every meeting source at rank 6.
- **Meaning search never returned an email.** Sync reported 500 mail chunks embedded. Still, all 413 hits
  of the hybrid verbatim run were notes found by meaning. In the hybrid OR run, all 250 mail hits were found
  by words only. `memo search mail` with a paraphrase also returned nothing. So the hybrid verbatim run
  cannot find any mail source (0 of 10). The cause is not known. It is probably a Memo bug, but the mail
  account's optional `embed` setting was left unset and has not been ruled out.
- **Meaning search alone ranks notes well, but only some.** In the hybrid verbatim run, 7 of 10 owner notes
  were first. Only 3 of 10 telegram and 2 of 10 meeting sources were in the top 10. The archive filler names
  the same people, and that pulls it close.
- **Adding meaning search to the OR query made recall@10 worse** (1.00 to 0.55). Meaning reordered the
  five note slots, and the expected note dropped out of them in 18 of 30 questions.

### What was not measured

- Answer accuracy, citations in answers, and stale answers: there is no answer model and no `memo answers`
  run. No predictions file was written. A rule that pulls answers from these question templates would be a
  hand-made answer model that knows the questions.
- Telegram and meeting records as their own kinds. Here they are notes, so they show how notes rank, not
  how messages or meetings rank.
- `--limit` above 10, `--project`, `--plain-order` and other options of `search all`, and the other
  embedding model (`embeddinggemma`).
- Variance across machines, a cold disk cache, and a larger or multilingual corpus. The corpus is 2,000
  short English template records.
- Token use and cost: none, since no model API was called.

## What remains unmeasured

The Memo retrieval baseline above measures Memo's search only. No engine answer accuracy, token usage,
cost, installation size or offline behavior has been measured, and no other engine has been run. Record these during engine runs, with p50/p95 query times and
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
