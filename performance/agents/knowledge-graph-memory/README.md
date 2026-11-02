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

## OpenClaw configurations (2 November 2026)

**Why it was run.** The competitive test plan asks whether OpenClaw, an agent people already use, answers
these questions well enough on its own, and whether connecting WireCat makes a difference. Two configurations
get the same 50 questions and the same answer model:

1. **OpenClaw alone.** Each record is a file in the agent's workspace (`memory/r0001.md` … `r2000.md`), indexed by
   OpenClaw's own memory search. The agent also has its normal file and shell tools.
2. **OpenClaw + WireCat.** The records are in a throwaway Memo store, seeded the same way as the
   [Memo retrieval baseline](#memo-retrieval-baseline-2-november-2026). OpenClaw runs the `memo` CLI and finds
   it through the `cli-memo` skill. It has no records in its own memory.

Answering waits for the owner's ChatGPT sign-in. What ran so far is OpenClaw's memory search on its own, with no
answer model, and a dry run of the answer path.

### How OpenClaw remembers

OpenClaw's memory is Markdown files in the agent's workspace: `MEMORY.md` for lasting facts, loaded at the start
of a session, and `memory/*.md` notes, which are indexed but not loaded
([Memory](https://docs.openclaw.ai/concepts/memory)). The agent writes them when asked to remember, before it
compacts a long session, and in a background "dreaming" pass. It reads them through two tools: `memory_search`
and `memory_get`. The built-in engine keeps a SQLite index with word search (FTS) and vectors, and merges both
("hybrid") ([Memory search](https://docs.openclaw.ai/concepts/memory-search)). Embeddings come from OpenAI by
default. Gemini, Voyage, Ollama and a local GGUF model through the llama.cpp plugin are the other choices. Dated
daily notes lose rank with age (30-day half-life). Session transcripts become searchable too when
"remember across conversations" is on.

### Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux 7.0, Python 3.14.4.
- OpenClaw **2026.10.9** (`8b18b55`), the npm `latest` tag on 2 November 2026. It needs Node 24.22.1 or later.
  The system Node is 24.19.0, so Node **v24.22.2** was downloaded from nodejs.org and checked against
  `SHASUMS256.txt` (sha256 `48cc0e21…aaf75`).
- Embeddings: the `@openclaw/llama-cpp-provider` plugin 2026.10.9. Its managed `llama-server` (build
  `b10809-5266f24da`) runs EmbeddingGemma 300M (`embeddinggemma-300m-qat-Q8_0.gguf`, 768 dimensions) on the CPU.
  `memory.search.provider` is `local` with `fallback: none`, so a broken embedder fails instead of silently
  turning into word search. `openclaw memory status --deep` reported `searchMode: hybrid`, vector index complete,
  2,000 files, 2,000 chunks. OpenAI embeddings, OpenClaw's default, were not used: they bill the OpenAI API.
- `memo` 0.131.13 for configuration 2, with no embedding model (word search only).
- The fixture from `run.py --self-check`, corpus sha256 `1d36697c…5e8802`.

Disk: Node 208 MB, the OpenClaw package 617 MB, llama.cpp runtime 67 MB, embedding model 314 MB.

**Steps a user takes**, counted for section 5 of the test plan:

| # | OpenClaw alone | Extra for OpenClaw + WireCat |
|---|---|---|
| 1 | Node 24.22.1 or later (here a separate download) | install `@wirecat/cli-memo` |
| 2 | `npm install openclaw` | add the notes folder, configure the mail account |
| 3 | `openclaw plugins install @openclaw/llama-cpp-provider` | `memo sync` (notes, then mail) |
| 4 | `openclaw config set memory.search.provider local` | `memo skill install` |
| 5 | `openclaw models auth login --provider llama-cpp --method local`: two questions; say **No** to the 5.7 GB chat model, **Yes** to the 0.3 GB embedding model | — |
| 6 | sign in with ChatGPT (`openclaw models auth login --provider openai --device-code`) | — |
| 7 | put the records in `memory/` and run `openclaw memory index` | — |

Seven steps for OpenClaw alone, six if Node is new enough. Configuration 2 adds four steps.

### Isolation

- Everything lives in `~/.cache/wirecat-bench/openclaw/`. Each OpenClaw command runs under `env -i` with
  `HOME` and `OPENCLAW_HOME` set to `<root>/home`. `OPENCLAW_HOME` replaces the home folder for all of
  OpenClaw's own paths: state, config, agents, credentials
  ([Environment](https://docs.openclaw.ai/help/environment)). `HOME` covers `~/.agents/skills`, which OpenClaw
  also reads. `TMPDIR` points inside the root, and `DBUS_SESSION_BUS_ADDRESS=disabled:` keeps the keyring out of
  reach.
- OpenClaw keeps its sign-ins in its own SQLite store (`state/openclaw.sqlite`), not in the keyring. The Codex
  sign-in reads nothing from `~/.codex`: onboarding no longer imports it, and the throwaway `HOME` hides it.
- **Log folder.** OpenClaw writes its log to `/tmp/openclaw/` unless `logging.file` is set. That is true even
  for the `config set` command that sets it. The runner therefore writes `logging.file` into `openclaw.json`
  before OpenClaw's first command. `openclaw plugins install` still unpacks the plugin download in
  `/tmp/openclaw/` and deletes the file. It leaves an empty folder there, whatever `TMPDIR` says (seen in a fresh
  `install` run).
- No gateway and no service. Answers use `openclaw agent --local`, which runs the agent inside the command.
  `llama-server` is a child process that OpenClaw starts on demand and stops when the command exits (the
  index log shows `stopping local model service: reason=host-shutdown`). No `llama-server` was left running
  after any step.
- **Proof.** `~/.openclaw`, `~/.agents`, `~/.codex`, `~/.config/openclaw`, `~/.local/share/openclaw` and
  `~/.cache/openclaw` were listed with modification times before installing, then again after prepare,
  retrieval and the dry run. Nothing under `~/.openclaw` or `~/.codex` changed. Two files under `~/.agents/skills`
  changed at 18:49: `max-cli` and `whatsapp-cli`. No command of this run calls `max` or `wa`. The `memo skill
  install` here ran with a throwaway `HOME` and wrote only `cli-memo` inside the root.
- `memo` runs only through a wrapper on the agent's `PATH`. The wrapper starts the real CLI under `env -i`, with
  the same throwaway `HOME`, `XDG_*`, `MEMO_*` and `WIRECAT_*` folders as `memo_baseline.py`, and
  `DBUS_SESSION_BUS_ADDRESS=disabled:`. `openclaw skills list` shows `cli-memo` as eligible for the memo agent
  and not eligible for the files agent: there `memo` is not on `PATH`.

### Fairness settings

- **Two agents in one OpenClaw home**: `files` (workspace with the records) and `memo` (an empty `memory/`).
  Each has its own memory index. The owner signs in once; the `memo` agent reads that sign-in through
  `agents.defaults.authInheritance`.
- **Memory of earlier questions is off.** Each question runs in a new session. `memory.search.sources` is
  `["memory"]` and `rememberAcrossConversations` is `false`, so the transcript of one question is never
  searchable from the next. Before this setting, `memory index --verbose` listed session transcripts as a source.
- **OpenClaw's own agent loop.** For an `openai/*` model OpenClaw may hand the turn to the Codex app-server, with
  Codex's own tools. The runner pins `agentRuntime.id: "openclaw"` for the chosen model. Then `memory_search` and
  the skills are OpenClaw's, and the Codex sign-in is only the transport
  ([Agent runtimes](https://docs.openclaw.ai/concepts/agent-runtimes)).
- **The same first run for both.** A brand-new workspace gets `BOOTSTRAP.md`, a first-run "introduce yourself"
  ritual. Both workspaces exist before OpenClaw first sees them, so neither gets it.
- **One prompt** for both, with one sentence that says where the records are ([`openclaw_runner.py`](openclaw_runner.py),
  `PROMPT` and `WHERE`). It asks for one JSON object `{"answer", "citations"}`, dates as `YYYY-MM-DD`, and
  `unknown` with no citations. Records are cited by name (`r0042`); both configurations use the same name table
  to turn names into corpus ids. The parser was fixed before any answer was seen: it takes the last JSON object
  in the reply, strips quotes and a trailing full stop, and nothing more.
- Each record file starts with a `date:` line (the record's timestamp). Memo gets the same date as the note's
  modification time or the email's `Date`.
- **After each run** the runner counts the words `oracle`, `run.py`, `fixture` and `knowledge-graph-memory` in
  the agent's transcript store. It also counts the `memory/` files and checks for a new `MEMORY.md`. The
  answer key is kept outside the OpenClaw folder, but the agent's shell can still reach any file of the user.
  A non-zero count means the run must be read before it is trusted.
- A question that runs past `--timeout` plus two minutes is stopped with its whole process group and recorded as
  `timeout` and `unknown`. Predictions are written after every question. After the run, any `llama-server` left
  from the throwaway root is stopped by its PID.

### Commands

```sh
cd performance/agents/knowledge-graph-memory
python3 run.py --self-check --output ~/.cache/wirecat-bench/kg-fixture-openclaw  # outside the OpenClaw root
python3 openclaw_runner.py install          # Node, OpenClaw, the llama.cpp plugin; prints the step-5 command
# step 5 once, in a terminal: answer No, then Yes
python3 openclaw_runner.py prepare --fixture ~/.cache/wirecat-bench/kg-fixture-openclaw
python3 openclaw_runner.py retrieval --fixture ~/.cache/wirecat-bench/kg-fixture-openclaw --output /tmp/oc-retrieval
./openclaw-signin.sh                        # the owner: ChatGPT sign-in; lists the models and both agents' sign-ins
python3 openclaw_runner.py answer --fixture ~/.cache/wirecat-bench/kg-fixture-openclaw --agent files \
  --model openai/<model> --thinking <level> --only q01 --output /tmp/oc-check-files   # then the same for memo
python3 openclaw_runner.py answer --fixture ~/.cache/wirecat-bench/kg-fixture-openclaw --agent files \
  --model openai/<model> --thinking <level> --output /tmp/oc-files
python3 openclaw_runner.py answer --fixture ~/.cache/wirecat-bench/kg-fixture-openclaw --agent memo \
  --model openai/<model> --thinking <level> --output /tmp/oc-memo
python3 run.py --predictions /tmp/oc-files/predictions.json --engine "OpenClaw 2026.10.9 alone, <model>" \
  --output /tmp/oc-files-score
```

Before the full runs, answer q01 with each agent and read `per-question.json`. `final_text` must not be empty and
`usage` must not be null. The files agent's `tools` should include `memory_search`; the memo agent's should
include a shell call that ran `memo`. The reply shape was taken from OpenClaw's source (`agent exec` builds its
`final` field from `payloads` the same way); a successful reply has not been seen yet.

Use the same model and thinking level as the Hermes runs. `answer` keeps every raw reply under `raw/`, and
`per-question.json` holds the parsed answer, the tools the agent called, token usage and OpenClaw's list-price
cost estimate. A ChatGPT sign-in bills no API, so that estimate is not money spent.

### Results: OpenClaw's memory search, no answer model

`openclaw memory search <query> --agent files --json --max-results 10`, one process per question, scored like the
Memo retrieval baseline: is the expected record in the top k? 40 questions have one expected record; the 10
budget questions have none.

| Query | Questions scored | Recall@1 | Recall@5 | Recall@10 | p50 s | p95 s | Empty replies |
|---|---:|---:|---:|---:|---:|---:|---:|
| Question verbatim | 40 | 0.35 | 1.00 | 1.00 | 6.15 | 7.09 | 0 |
| Content words joined by OR | 40 | 0.35 | 0.97 | 1.00 | 5.99 | 6.59 | 0 |

Rank of the expected record, per question group (10 questions each):

| Group | Expected record | Verbatim | OR |
|---|---|---|---|
| current date | the confirming email | 3 in all 10 | 3–5 |
| original date | the first chat message | 1 in 9, 5 in 1 | 1 in 8, 2, 6 |
| owner | the owner note | 1 or 2 | 1 or 3 |
| commitment | the meeting passage | 2 or 3 | 2–4 |

### What it showed

- **OpenClaw's hybrid search finds every record from the question as typed.** Recall@5 is 1.00 for the verbatim
  question. Memo's word search found nothing from the same sentences (recall 0.00) and needed the OR rewrite to
  reach recall@5 0.75. It is not only meaning search: the word scores of the top hits are about 0.85 for the
  verbatim question, so OpenClaw's word search does not need every word in one record, as Memo's does.
- **The current answer never comes first.** For every "current date" question the email that confirms the new
  date is third. Ahead of it are the original chat message and the project's reference note about "the original
  delivery date", in either order. An agent that trusts the top hit gives the stale date. The answering run will
  show whether the model reads past it.
- **Each search costs 6 seconds as a command**, mostly OpenClaw's start and the embedding server's start. Inside
  a running agent the server stays up, so this is not the agent's search time.
- These are 2,000 one-line files. Each one is a single chunk, so chunking never splits a record. Real notes are
  longer.

### Dry run (no sign-in)

`answer` for q01 and q03 on both agents, before the owner signed in, with `--model openai/gpt-5.5` as a
placeholder. Both questions failed cleanly ("No route-compatible authentication source is configured for
openai", exit 1). They were kept raw, written as `unknown`, padded to 50 ids, and the scorer accepted the file.
Such a file scores 10 correct (the ten budget questions) and 0 stale. **A run that answers nothing scores
10/50**, so read the totals against 10, not 0.

### Results: answers with Claude Sonnet (2 November 2026)

Both agents answered all 50 questions with `anthropic/claude-sonnet-5-5` through the owner's API key, one agent at a
time (the two agents share one OpenClaw state database, and a second run at the same time fails at once with
"OpenClaw state database is busy"). The machine restarted during the memo agent's run after question 21; questions
22–50 ran again with `--only` and the two prediction files were joined before scoring. Scored with `run.py`.

| Configuration | Correct | Correct with sources | Stale answers | Median time | Tokens per question | Cost at list price |
|---|---:|---:|---:|---:|---:|---:|
| OpenClaw alone (files + its memory search) | 50/50 | 34/50 | 0 | 27.5 s | 97,800 | $1.33 |
| OpenClaw + WireCat (memo CLI through its skill) | 50/50 | 40/50 | 0 | 33.3 s | 113,400 | $2.35 |

Most source misses are extra sources: for "original date" questions the agents also cite the email that moved the
date, and the scorer accepts only the exact expected set. With Sonnet, OpenClaw alone mostly searched the files with
shell commands rather than its `memory_search` tool.

What it showed: on 2,000 short records a strong model with plain file access already answers everything. WireCat
added six exactly-cited answers at about 1.8 times the cost and 20 % more time per question. This corpus is too small
to show whether a context layer is worth having; a run at archive scale (about 100,000 records) is the next test.

### What was not measured

- **Answer accuracy, citations, stale answers, tokens and time per answer for both configurations**: they wait
  for the owner's sign-in. No answering model has run. Not seen yet either: the sign-in itself, the memo agent
  using the files agent's sign-in, whether `agentRuntime: "openclaw"` takes effect, and a successful reply.
- No paid path was open: every command runs under `env -i`, so no `OPENAI_API_KEY` reaches OpenClaw, and
  embeddings are local with `fallback: none`.
- OpenAI embeddings, OpenClaw's default and probably its strongest. They bill the API. Ollama, Gemini and the
  others were not tried either.
- Active Memory, dreaming and the session-memory hook. They act on conversations, and this test has none to
  remember. No `MEMORY.md` was written.
- The Codex app-server runtime, which OpenClaw may pick on its own for `openai/*` models.
- OpenClaw through MCP (`memo mcp`) in place of the CLI.
- The other OpenClaw memory engines: QMD, Honcho, LanceDB, memory-wiki.
- macOS and Windows.
