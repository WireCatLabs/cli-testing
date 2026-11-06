# Knowledge graph memory benchmark preparation

**Results so far, explained for a reader new to the test: [RESULTS.md](RESULTS.md).**

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

`--records 10000` (any size from 3,000) writes the harder archive corpus instead; the default stays this
2,000-record fixture, byte for byte. See [the 10K archive corpus](#the-10k-archive-corpus-5-november-2026).

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

## Hermes configurations (2 November 2026)

**Why it was built.** The WireCat comparison asks a plain question: a user who already runs Hermes Agent with a
memory provider, does that user still need WireCat? (Competitive test plan, section 0, in cli-private
`plans/2026-11-02-competitive-test-plan.md`.) To answer it, every configuration gets the same 2,000 records and the
same 50 questions, and the same scorer counts the answers. This section adds the runners for four Hermes
configurations, and a retrieval-only run of Supermemory and Mem0 that needs no answer model. The retrieval run
uses the Memo baseline's questions and scoring; how far each service had processed the records when it was
searched is stated with the results. The Hermes answer runs (3 November 2026) are in [RESULTS.md](RESULTS.md).
Nothing in this section has measured answer accuracy yet.

| Configuration | How the records reach it | Hermes toolsets | Status |
|---|---|---|---|
| Hermes alone | 2,000 files `corpus/r0001.md`… in the working folder, modification time = record time; built-in memory on | `file,terminal,memory` | runner ready, waits for the key |
| Hermes + WireCat | a throwaway Memo store seeded as in the baseline above (notes, mbox, `e5-small` vectors); a `memo` wrapper on `PATH` and the `cli-memo` skill from `memo skill show` | `terminal,skills,memory` | runner ready, store seeded, waits for the key |
| Hermes + Supermemory | the records as Supermemory documents in one container tag, then Hermes's `supermemory` provider on that tag | `memory` | records ingested; waits for the key |
| Hermes + Mem0 | the records as Mem0 memories under one user id, then Hermes's `mem0` provider on that user id | `memory` | records ingested; waits for the key |
| Hermes + Hindsight | design note only, [below](#hindsight-design-note) | — | not installed |

### Isolation

- **The owner's Hermes is never used.** Every Hermes process gets its own `HERMES_HOME` and `HOME` under
  `~/.cache/wirecat-bench/hermes/<configuration>/`. `--ignore-user-config` is not passed: it makes Hermes skip
  `$HERMES_HOME/config.yaml`, which is the benchmark's own configuration here
  ([`cli.py` in Hermes 0.21.0](https://github.com/NousResearch/hermes-agent/blob/b20cc5f7/cli.py#L425)).
  `hermes_runner.py answer` compares the modification times of `~/.hermes/config.yaml`, `auth.json`, `SOUL.md`,
  `state.db`, `memories/` and `.hermes_history` before and after the run, and fails if one changed.
- **`CODEX_HOME` points to an empty folder.** Otherwise Hermes offers to import `~/.codex/auth.json` at sign-in, and
  takes its token when its own refresh fails (`hermes_cli/auth.py`, `_import_codex_cli_tokens` and the
  self-heal in `refresh_codex_oauth`).
- **`DBUS_SESSION_BUS_ADDRESS=disabled:` on every Hermes process.** Found in this run: with only a throwaway
  `HOME`, the first `hermes auth list` ran `gh auth token`, which reached the keyring over D-Bus, and saved the
  owner's GitHub token in the benchmark's `auth.json` as a Copilot credential (`hermes_cli/copilot_auth.py`). That
  file was deleted and recreated; with D-Bus disabled, `auth list` shows nothing.
- **The child gets a clean environment**, not the caller's: no `OPENAI_API_KEY` or other key can reach Hermes.
  Supermemory and Mem0 keys are read from the keyring (`secret-tool`, service `supermemory` / `mem0`, account
  `wirecat`) into the child's environment only.
- **The provider SDKs are not installed into Hermes.** Hermes 0.21.0's venv has neither `supermemory` nor
  `mem0ai`; installing them there would change `~/.hermes`. They live in `~/.cache/wirecat-bench/pydeps`,
  pinned to the venv's own versions, and the runner calls the venv's Python with `PYTHONPATH` set (the
  `~/.local/bin/hermes` wrapper unsets `PYTHONPATH`):

  ```sh
  uv pip freeze --python ~/.hermes/hermes-agent/venv/bin/python | grep -v '^-e\|@ file' > ~/.cache/wirecat-bench/hermes-venv-constraints.txt
  uv pip install --python ~/.hermes/hermes-agent/venv/bin/python --target ~/.cache/wirecat-bench/pydeps \
    -c ~/.cache/wirecat-bench/hermes-venv-constraints.txt supermemory==3.50.0 mem0ai==2.0.10
  ```

- **The answer key can be reached by the terminal tool.** Hermes's terminal tool is auto-approved in `-z` mode
  and is not sandboxed, so it could read `oracle.json` anywhere on disk. The prompt names only the data. After a
  run, `results.json` records `oracle_seen_in_sessions`: whether any file in the configuration's `HERMES_HOME`
  holds `oracle.json`, `required_citations` or `stale_answers` (the last two keys exist only in the answer key).
- **The owner's `~/.hermes` is compared before and after.** A change to `config.yaml`, `SOUL.md`, `state.db`,
  `memories/` or `.hermes_history` fails the run. `auth.json` is listed but does not fail it: the owner's own
  running gateway refreshes its token there (it last changed at 07:49 on the day of this work).
- **Memory carries over, on purpose.** Built-in memory and the provider's automatic capture stay at their defaults,
  as a user would have them. So each answered question can be written to memory and seen by later questions, and
  a second run starts with the first run's memory. Hermes's Mem0 provider has no switch for this: every turn is
  added with `infer: true` to the same user id (`plugins/memory/mem0/__init__.py`, `sync_turn`). A clean repeat
  needs a fresh `HERMES_HOME` and a fresh provider ingest.

### Setup

The answering model is Claude Sonnet, `claude-sonnet-5-5`, through Hermes's `anthropic` provider and the owner's
Anthropic API key (the owner's decision of 2 November 2026; the same model answers in the OpenClaw runs). The key
is in the OS keyring (service `cli-memo`, account `anthropic`). One command stores it in each configuration's own
throwaway auth store:

```sh
performance/agents/knowledge-graph-memory/hermes-anthropic-key.sh     # all four; or name some: ... alone wirecat
```

It pipes `secret-tool lookup` into `hermes auth add anthropic --type api-key`, run under `setsid` so Hermes's
`getpass` reads the pipe instead of the terminal: the key never reaches a command line, the screen or a log. A
configuration that already has a key is skipped. Checked with a fake `secret-tool` printing a fake key: the key
landed in `hermes-home/auth.json` (mode 600) and nothing was echoed.

The ChatGPT subscription through Hermes's `openai-codex` provider is kept as a fallback: `hermes-signin.sh` runs
a device-code sign-in per configuration (open the link, enter the code), and `answer --provider openai-codex
--model gpt-5.6-terra` uses it.

Then, per configuration (the fixture from `run.py --self-check`; the tags are the ones the provider runs below
printed):

```sh
B=~/.cache/wirecat-bench
python3 performance/agents/knowledge-graph-memory/hermes_runner.py prepare --config alone --fixture $B/fixture
python3 performance/agents/knowledge-graph-memory/hermes_runner.py prepare --config wirecat --fixture $B/fixture
python3 performance/agents/knowledge-graph-memory/hermes_runner.py prepare --config supermemory --fixture $B/fixture --tag wirecat_bench_20261102_183348
python3 performance/agents/knowledge-graph-memory/hermes_runner.py prepare --config mem0 --fixture $B/fixture --tag wirecat-bench-20261102-175648
python3 performance/agents/knowledge-graph-memory/hermes_runner.py answer --config alone --fixture $B/fixture --output $B/runs/hermes-alone-1 --questions q01,q03
python3 performance/agents/knowledge-graph-memory/hermes_runner.py answer --config alone --fixture $B/fixture --output $B/runs/hermes-alone-2
```

Run the configurations one after another, not in parallel. `answer` runs `hermes -z` once per question, in the configuration's working folder, with `--usage-file`,
`--provider anthropic`, `-m claude-sonnet-5-5` and `--reasoning medium` by default, and a 600 s limit. The
Anthropic calls are paid; run a pilot of two questions first and read its `.usage.json`. The prompt
asks for one JSON object `{"answer", "citations"}` with record names (`r0042`); the runner maps names back to
corpus ids and writes `predictions.json` in the scorer's format, `raw/<question>.stdout.txt`, `.stderr.txt` and
`.usage.json`, `per-query.json`, and `results.json` with the scores of a full 50-question run. A run of some
questions only (`--questions`) is a pilot and is not scored.

### Retrieval only: Supermemory and Mem0

[`provider_retrieval.py`](provider_retrieval.py) is standard-library Python. It ingests the records through each
service's REST API, waits until the service reports them processed, then sends each question to the service's own
search and scores recall@k of the expected source over the same 40 questions as the Memo baseline. No answer
model is involved on our side. Both services run their own models while ingesting (fact extraction).

```sh
python3 performance/agents/knowledge-graph-memory/provider_retrieval.py --service supermemory --fixture $B/fixture --output $B/runs/supermemory-full-2000 --variants default,threshold-0
python3 performance/agents/knowledge-graph-memory/provider_retrieval.py --service mem0 --fixture $B/fixture --output $B/runs/mem0-full-2000 --wait-minutes 90
```

- **An interrupted ingest continues, it does not start over.** Each batch of 100 adds one line to
  `<output>/ledger.jsonl`: the record names sent, the ones the service refused, the seconds. No full replies, so the
  file stays small. `--status --tag <tag>` asks the service what it holds for the tag (Supermemory's document list,
  Mem0's event feed) and writes `<output>/status-<time>.json`; it sends nothing. `--resume --tag <tag>` with the same
  `--output` writes that status first, then sends only the records the service does not hold or marked failed, then
  waits and searches as usual. Supermemory's wait also checks `dreamingStatus` on 50 sampled documents: the list
  shows a document `done` while its memories are still being built, and a search then sees a half-built store.
  `results.json` records what the store held when it was searched (`ingest.at_search`). Mem0 counts every add against its allowance, so it is never re-sent blindly: a record
  whose event is still pending is not missing. The wait lists the tag's state every 5 minutes instead of asking for
  each record (7,800 requests a round before).
- **Record names travel as metadata, never in the text.** Supermemory: `customId` and `metadata.rid` = `r0001`,
  `documentDate` = the record's time. Mem0: `metadata.rid`. A hit maps back to the corpus through that name. A
  Supermemory memory built from several records cites all of them at one rank; the hit list is deduplicated in
  rank order, and recall@k looks at the first k record ids.
- **Supermemory:** `POST /v3/documents/batch` (100 per call), default `dynamic` dreaming, polling
  `GET /v3/documents/{id}` until `status` and `dreamingStatus` are `done`
  ([batch ingest guide](https://supermemory.ai/docs/ingestion/batch-ingest-historical-data)). Search is
  `POST /v4/search` with `searchMode: hybrid`, `limit: 10`, as Hermes's provider sends it, plus
  `include.documents` to get the record names. Row `default` uses the service's default threshold (0.6), which
  Hermes also uses; row `threshold-0` returns every candidate.
- **Mem0:** `POST /v3/memories/add/` per record with `infer: true` (the default: Mem0 extracts facts with its own
  model), four in parallel, polling `GET /v1/event/{id}/` until `SUCCEEDED`
  ([add memories](https://docs.mem0.ai/api-reference/memory/add-memories)). Search is
  `POST /v3/memories/search/` with `filters.user_id` and `top_k: 10`, as Hermes's provider sends it
  ([search memories](https://docs.mem0.ai/api-reference/memory/search-memories)).

**Free-tier limits, checked before ingesting** (pricing pages read on 2 November 2026):

- [Supermemory](https://supermemory.ai/pricing): the free plan includes $5 of credit a month; usage needs an
  available credit balance, and automatic top-ups exist only on paid plans. Memory ingest is $0.005 per 1K
  "SM tokens" ($0.001 as plain documents), search $0.005 per 1K queries. The corpus is about 60,000 tokens
  (`o200k_base`, see the cost plan below), so even at the memory rate it is about $0.30 of the $5. SM tokens are
  not the same unit and the account's usage page was not read, so the real charge is not verified.
- [Mem0](https://docs.mem0.ai/platform/pricing): first 30 days 10,000 adds and 1,000 retrievals a month; past
  the limit calls return an error until the next month, and billing starts only after the owner connects a key
  and turns it on. This work used 2,100 adds (100 pilot + 2,000) and about 155 search or list calls. What
  counts as one add is not defined there.

A 100-record pilot ran first on each service. Its first 100 records are the 80 project records and 20 filler
records, so its recall is inflated and not reported as a result; it served to check limits, errors and that record
names survive.

#### Results

Memo rows are copied from the baseline above (same fixture, same 40 questions, same scoring).

| Run | Records stored | Recall@1 | Recall@5 | Recall@10 | p50 s | p95 s |
|---|---:|---:|---:|---:|---:|---:|
| Memo, lexical, question verbatim | 2,000 | 0.00 | 0.00 | 0.00 | 0.27 | 0.32 |
| Memo, lexical, content words joined by OR | 2,000 | 0.25 | 0.75 | 1.00 | 0.30 | 0.35 |
| Memo, hybrid (e5-small), question verbatim | 2,000 | 0.25 | 0.30 | 0.30 | 1.05 | 1.19 |
| Memo, hybrid (e5-small), OR words | 2,000 | 0.25 | 0.55 | 0.55 | 1.07 | 1.23 |
| Supermemory run 1, question verbatim | 1,900 | 0.15 | 1.00 | 1.00 | 0.80 | 2.66 |
| Supermemory run 1, OR words | 1,900 | 0.28 | 1.00 | 1.00 | 0.52 | 2.93 |
| Mem0, question verbatim | 774 memories from 716 processed adds | 0.47 | 0.95 | 0.95 | 0.86 | 1.01 |
| Mem0, OR words | 774 memories from 716 processed adds | 0.45 | 0.95 | 0.95 | 0.89 | 1.05 |
| Supermemory run 2, question verbatim | 2,000 | 0.47 | 1.00 | 1.00 | 0.53 | 0.78 |
| Supermemory run 2, OR words | 2,000 | 0.50 | 1.00 | 1.00 | 0.57 | 0.88 |

Times are wall time of one HTTPS request from Valencia, so they include the network; Memo's are a local process.
Supermemory's `threshold: 0` rows gave the same recall as the default threshold and are in `results.json` only.

**State of each store when it was searched:**

- **Supermemory run 1** (tag `wirecat-bench-20261102-175043`): 2,000 sent, 1,900 stored. The batch for r0601–r0700
  (filler only) came back as HTTP 200 with one item, `"Failed to save documents"`; the script did not retry it
  then (it does now). Submitting took 29 minutes (about 88 s per batch of 100). It was searched after one status
  pass: every document `done` (chunks indexed), but only 374 of 1,900 past dreaming (memory extraction). So 350 of
  the 500 hits in the verbatim run were raw chunks and 150 were extracted memories. In the pilot, dreaming took
  about 30 minutes for 100 documents.
  Searched again 1 h 45 min and 4.5 h after ingest: identical recall and ranks, with 139–150 memory hits per
  run. A sample of 50 documents was still `dreaming` at 4.5 h.
- **Supermemory run 2** (tag `wirecat_bench_20261102_183348`, the store Hermes + Supermemory uses): the first
  attempt stopped after 736 documents when a batch request timed out (60 s, four times); it was resumed into the
  same tag, so those 736 were sent twice (Supermemory treats a repeated `customId` as an update). All 2,000 are
  stored and `done`. The process that should have searched it ended with the agent session, so it was searched
  about 4.5 h after ingest with `--search-only`; a sample of 50 documents was still `dreaming`. 171 of 500 hits in
  the verbatim run were memories, 329 chunks.
- **Mem0** (user id `wirecat-bench-20261102-175648`): 2,000 adds accepted in 400 s (four at a time), none
  rejected. After 90 minutes 716 events had `SUCCEEDED` and 1,284 were still `PENDING`; the store held 774
  memories. The project records were sent first, and all 80 had succeeded, so the 40 scored sources were all
  processed; most filler was not. In the 100-record pilot, processing took 13 minutes and gave 97 memories.
  Fact extraction rewrites the text ("2026-12-11" became "December 11, 2026" in the pilot) and keeps the record
  name in `metadata.rid`, so every hit mapped back.

**What it showed:**

- **Supermemory finds every source in the top 5 from the question as written.** Memo's word search finds nothing
  from the verbatim question and needs the words joined by OR to reach recall@10 1.00; Memo's meaning search gets
  0.30. A hosted embedding model plus hybrid chunks does what Memo's `e5-small` does not on this corpus.
- **Two ingests of the same records ranked them differently.** In run 1 the confirming email for the 10 "current
  date" questions ranked 4–5 (verbatim) or 3–4 (OR); for q01 the order was the note that mentions "the original
  delivery date", the original Telegram message, the meeting update, the owner note, then the email. An agent
  reading run 1's hits in order meets the stale date first. In run 2 the same email ranked first in 10 of 10
  (verbatim) and 9 of 10 (OR), and recall@1 rose from 0.15 to 0.47. Run 1 gave identical results three times over
  4.5 hours, so the difference is between the stores, not the time of the search. The cause is not known: run 2
  holds 100 more filler records and got its first 736 documents twice. Two runs are not enough to say which is
  typical.
- Memo's recall@1 is 0.25 in every row because `search all` alternates mail and notes; its OR word search puts the
  confirming email first, though only because mail comes first.
- **Mem0 drops some changes and keeps the stale date.** It missed 2 of 40 sources, both "current date"
  questions (q11 Cedar Lantern, q16 Dune Harbor). Their confirming emails (r0018, r0026) were processed
  (`SUCCEEDED`) but produced no memory: listing memories with `metadata.rid` r0018 or r0026 returns 0, while r0002
  returns its memory. For those two projects the top hit is "Cy Moss recorded that Cedar Lantern delivery date is
  2026-11-03", the stale date, and nothing in memory holds the confirmed one. Where Mem0 did keep the change, it
  ranks it first (8 of 10 with OR words). An agent on Hermes + Mem0 can only answer those two from the stale fact.
- Mem0's recall@1 (0.45–0.47) is close to Supermemory run 2 (0.47–0.50) and above Memo (0.25). Probably because it
  stores one short fact per record, and the owner and change facts match the question's words closely.

**What Hermes's providers show the model** (read in the provider code, Hermes 0.21.0):

- Supermemory's `supermemory-search` tool returns `id`, `content` and `similarity` per hit, where `content` is the
  hit's `memory` field (`plugins/memory/supermemory/__init__.py`, `_tool_search`). Chunk hits have no `memory`
  field, so in the default `hybrid` mode their text reaches the model empty. Record metadata never reaches it.
- Mem0's `mem0_search` tool returns `id`, `memory` and `score` (`plugins/memory/mem0/__init__.py`, the
  `mem0_search` branch of `handle_tool_call`). Metadata never reaches the model.
- So in Hermes + Supermemory and Hermes + Mem0 the model cannot cite a record name: "correct with sources" will be
  0 for both by construction, unless the model guesses. That is a property of the providers, not of the records:
  the record names are stored (this run mapped every hit back through them).

### What was not measured

- Hermes + WireCat answers: they wait for memo's search fixes. The other three Hermes answer runs are in [RESULTS.md](RESULTS.md).
- Supermemory and Mem0 credit actually used: the services' usage pages were not read. The account holds 4,000
  Supermemory documents of this work (100 pilot, 1,900 run 1, 2,000 run 2, of which 736 sent twice) and 2,100
  Mem0 adds.
- Mem0 without fact extraction (`infer: false`), Supermemory's `instant` dreaming, `rerank`, and limits above 10.
- Records' dates in Mem0: its v3 add endpoint has no date field, so Mem0 got text only; Supermemory got
  `documentDate`, Memo the mail date and the note's modification time.
- Hindsight: not installed.

### Setup steps a user takes

Counted from what these runs needed, for the comparison's setup-effort score. An account and an API key are
assumed to exist.

| Configuration | Steps | What they are |
|---|---:|---|
| Hermes alone | 2 | put the files in a folder; sign in to a model provider |
| Hermes + WireCat | 7 | install memo; add the notes folder; add an mbox mail account by editing `config.json`; sync; download the embedding model; embed; install the skill. Telegram and meeting records cannot be imported from files (baseline above) |
| Hermes + Supermemory | 4 | install the SDK into Hermes; set the provider and key; import through the API (no importer command: a script); wait for processing |
| Hermes + Mem0 | 4 | the same four. `mem0ai` pulls `qdrant-client`, `grpcio`, `numpy` and `posthog` even for the hosted platform; installing it without dependencies failed on import |

### Hindsight design note

Not installed or run. Hermes 0.21.0 ships a `hindsight` memory provider with three modes: cloud,
`local_embedded` (Hermes starts a Hindsight daemon with its own PostgreSQL) and `local_external` (a Hindsight
already running, for example in Docker) — see `plugins/memory/hindsight/README.md` in Hermes. Fact extraction
needs a language model in every mode. The docs describe two ways to keep it off the paid API:

- **A local model.** Hindsight's [configuration page](https://hindsight.vectorize.io/developer/configuration)
  lists `HINDSIGHT_API_LLM_PROVIDER` values `ollama`, `lmstudio` and `llamacpp`, with
  `HINDSIGHT_API_LLM_BASE_URL=http://localhost:11434/v1` for Ollama. Embeddings and reranking run locally by
  default (`BAAI/bge-small-en-v1.5`). The page warns that weaker local models may return prose or invalid JSON,
  which breaks retain, and that Ollama skips JSON mode unless `HINDSIGHT_API_LLM_STRICT_SCHEMA` is on. The
  [models page](https://hindsight.vectorize.io/developer/models) lists no Ollama model as tested, mentions a
  minimum of 65,000 output tokens for reliable fact extraction (it was not clear which models that applies to),
  and offers `llamacpp`, which downloads a Gemma GGUF of about
  3.5 GB. Hermes's provider defaults Ollama to `gemma3:12b`. This computer has Ollama installed but no NVIDIA
  GPU, so a 12B model would run on the CPU; 2,000 retain calls would probably take hours. Not measured.
- **The ChatGPT subscription.** The same page lists an `openai-codex` provider: "No API key needed - uses OAuth
  tokens from ~/.codex/auth.json", with `CODEX_HOME` (or `HINDSIGHT_API_LLM_CODEX_HOME`) for a separate folder,
  and the note "For personal development use only". This contradicts the plan's statement that Hindsight's
  extraction cannot use the owner's subscription: it can, through its own Codex CLI sign-in (`codex auth login`
  with `CODEX_HOME` set to a throwaway folder), not through Hermes's. Hermes's setup wizard does not offer
  `openai-codex`, but the provider passes `llm_provider` from `hindsight/config.json` to the daemon unchanged
  (`_build_embedded_profile_env`); whether the daemon accepts it there is not verified.

A third way is the same paid `anthropic` provider the Hermes answers now use (on the configuration page, and offered by Hermes's setup);
that is API spend, metered separately from answering.

Proposed run, after the Hermes runs above: `local_embedded` in the benchmark's `HERMES_HOME`, `HOME` set to the
throwaway home (the daemon writes `~/.hindsight/profiles/`), `recall_types: observation,world,experience` (the
provider now recalls only consolidated observations by default), retain the corpus through Hindsight's own API
with the record name as metadata, then a 100-record pilot with `openai-codex` and one with `ollama`, each timed.

## Memo retrieval after MEMO-36: a question as typed (3 November 2026)

**Why it was run.** The baseline above showed that a question typed as a sentence finds nothing in
`memo search all`: word search needs every word in one record. Backlog item MEMO-36 (owner decision NEED-2201 A)
makes `search all` treat a question the way `search messages --discover` does, so any of the question's content
words can find a record. The question: does the question as typed now reach the source? The plan's target was
recall@10 of at least 0.95 for the question as typed, with the meaning model on. The result decides whether
MEMO-36 is done.

### Setup

- Same machine, fixture (corpus sha256 `1d36697c…5e8802`) and `memo_baseline.py`, with one new row (below).
- Memo built from source, not the published package: cli-memo `main` at `ab05df6` (0.131.20), with
  `@wirecat/cli-core` linked to the change ([cli-core #2455](https://github.com/WireCatLabs/cli-core/pull/2455),
  commits `102d9a53a` and `2443c68f5`). The binary was a two-line shell script running `node dist/bin/memo.js`,
  passed as `--memo`.
- New row **words, question verbatim (no model)**: the question as written, no `--exact`, run before
  `memo models download`. This is what an owner who never downloaded the model gets.

```sh
python3 performance/agents/knowledge-graph-memory/run.py --self-check --output /tmp/kg-fixture
python3 performance/agents/knowledge-graph-memory/memo_baseline.py --fixture /tmp/kg-fixture --output /tmp/kg-memo \
  --memo /path/to/memo-wrapper
```

### Results

Final build (`2443c68f5`), one full run from new folders:

| Run | Before (0.131.13) R@1 / R@5 / R@10 | After R@1 / R@5 / R@10 | Empty replies after |
|---|---|---|---:|
| Lexical, question verbatim (`--exact`) | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 50 of 50 |
| Lexical, content words joined by OR (`--exact`) | 0.25 / 0.75 / 1.00 | 0.25 / 0.75 / 1.00 | 0 |
| **Words, question verbatim (no model)** | not run (0 / 0 / 0 expected: every word in one record) | **0.25 / 1.00 / 1.00** | 0 |
| **Hybrid (e5-small), question verbatim** | 0.25 / 0.30 / 0.30 | **0.25 / 1.00 / 1.00** | 0 |
| Hybrid (e5-small), content words joined by OR | 0.25 / 0.55 / 0.55 | 0.25 / 0.55 / 0.55 | 0 |

No reply was incomplete. Times are left out: this build runs unbundled through `node` and a wrapper
(`memo --version` p50 0.08 s against 0.04 s for the published package), and other work shared the computer.

**How the notes merge was chosen.** With the first commit (`102d9a53a`) the hybrid question row was
0.25 / 0.55 / 0.55. Notes merge two ranked lists, any-word and meaning, by reciprocal rank. The any-word list holds
almost every note meaning finds, so those notes got two votes and pushed down the note found by words alone. Each
change below applied only to a question, and was measured on the same embedded store, hybrid question row only:

| Change to the notes merge | R@1 / R@5 / R@10 |
|---|---|
| None (k = 60, equal weights) | 0.25 / 0.55 / 0.55 |
| Meaning weight 0.5 | 0.25 / 0.55 / 0.55 |
| Meaning weight 0.25 | 0.25 / 0.55 / 0.70 |
| Meaning weight 0 (words alone) | 0.25 / 1.00 / 1.00 |
| k = 5 | 0.25 / 0.65 / 0.80 |
| k = 20 | 0.25 / 0.55 / 0.57 |
| **Dedup: a note already found by words gets no vote from meaning; meaning still adds notes words missed** | **0.25 / 1.00 / 1.00** |

Dedup was kept. It matches words alone here, and it keeps meaning for notes that share no word with the question.
This corpus has no such question, so that part is not measured.

### Then MEMO-38 and MEMO-37 (5 November 2026)

Two more fixes from the same plan, each its own cli-core PR stacked on #2455, each measured with one full run of
`memo_baseline.py` from new folders:

- **MEMO-38** ([cli-core #2471](https://github.com/WireCatLabs/cli-core/pull/2471), `831d8f35c`): `search all`
  searches mail by meaning.
- **MEMO-37** ([cli-core #2474](https://github.com/WireCatLabs/cli-core/pull/2474), `cc2e7d165`): hits at the same
  rank in their own source are ordered by cosine, so the sources no longer take turns.

Question as typed, R@1 / R@5 / R@10:

| Build | With e5-small | Words only (no model) | Mail hits found by meaning |
|---|---|---|---:|
| MEMO-36 (`2443c68f5`) | 0.25 / 1.00 / 1.00 | 0.25 / 1.00 / 1.00 | 0 of 250 |
| + MEMO-38 | 0.25 / 1.00 / 1.00 | 0.25 / 1.00 / 1.00 | 222 of 250 |
| + MEMO-37 | **0.40 / 1.00 / 1.00** | 0.25 / 1.00 / 1.00 | 222 of 250 |

The free index experiment ([cli-testing #291](https://github.com/WireCatLabs/cli-testing/pull/291)) reached
0.38 to 0.42 at R@1 with one in-memory list. MEMO-37 is in that range. MEMO-38 does not move recall here because
every mail source was already first by words. The hybrid OR row also rose to 0.40 at R@1 with MEMO-37.

Merges tried for MEMO-37 and dropped (with the model, measured on one embedded store):

| Merge | R@1 / R@5 / R@10 |
|---|---|
| One words order by share of question words, plus one meaning order by cosine, fused by rank | 0.10 / 0.55 / 0.68 |
| The same without the share of words | 0.28 / 0.55 / 0.68 |
| The same, with the e5-small floor (0.80) on mail and messages too | 0.28 / 0.57 / 0.72 |
| Cosine breaks ties within each rank (kept) | 0.40 / 1.00 / 1.00 |
| The kept merge without the floor on mail and messages | 0.40 / 1.00 / 1.00 |

The global merges lose because many expected notes are found by words only. Meaning keeps only notes above the
floor, so hits found both ways outvote them. The share of question words fails because the decoy records repeat
the same words.

### What it showed

- **The question as typed now finds the source with and without the model:** 40 of 40 in the top 5. `--exact`
  stays strict, as intended.
- The hybrid OR row did not change: an explicit `OR` query is query syntax, not a question, and keeps the old merge.
- Recall@1 stays 0.25 in every row. This is the cap from the mail, note, mail… turn-taking of `search all` (MEMO-37).
- Mail is now found by words for a question (all 10 mail sources at rank 1). `search all` never searches mail by
  meaning (MEMO-38).

### What was not measured

- Messenger messages: the corpus has none (telegram records are notes). The change routes a question through
  discovery for messages too; that path is covered by cli-core's tests only.
- Calendar events: the corpus has none.
- A question that shares no word with its source, where meaning alone must find it.
- The published, bundled package: this was a local build.

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

Both configurations answered with Claude Sonnet 5.5 through the owner's Anthropic API key; see the results below.

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

- More than one answer run per configuration, and models other than Claude Sonnet 5.5.
- Memo with its meaning search: the memo agent's store had no embedding model (word search only).
- Embeddings were local with `fallback: none`; no `OPENAI_API_KEY` reached OpenClaw.
- OpenAI embeddings, OpenClaw's default and probably its strongest. They bill the API. Ollama, Gemini and the
  others were not tried either.
- Active Memory, dreaming and the session-memory hook. They act on conversations, and this test has none to
  remember. No `MEMORY.md` was written.
- The Codex app-server runtime, which OpenClaw may pick on its own for `openai/*` models.
- OpenClaw through MCP (`memo mcp`) in place of the CLI.
- The other OpenClaw memory engines: QMD, Honcho, LanceDB, memory-wiki.
- macOS and Windows.

## Index variants (3 November 2026)

**Why it was run.** The owner asked which index design works best. Memo's hybrid search found the right record for
only 0.25 / 0.30 / 0.30 of the questions as typed (recall@1 / @5 / @10, [above](#memo-retrieval-baseline-2-november-2026)).
OpenClaw scored 0.35 / 1.00 / 1.00. The hosted services in the retrieval-only run of
[PR #288](https://github.com/WireCatLabs/cli-testing/pull/288) scored 0.47 / 1.00 / 1.00 (Supermemory) and
0.47 / 0.95 / 0.95 (Mem0). Three causes were found in Memo's code (cli-core `src/services/search-all.ts`):

- mail is never searched by meaning;
- `search all` alternates sources by rank instead of ranking them in one list;
- notes search drops meaning hits below the model's floor, 0.80 for e5-small.

The question: would an index without those three faults reach the hosted numbers, and does a bigger model, word
search or grouping records help more? The answer feeds the decision on what to fix in Memo's search first. This run
needs no paid API and no account.

### Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0, Node 24.19.0, Python 3.14.4.
- `@wirecat/cli-core` 0.562.0 from npm. Its own `downloadTextModel` fetched both models and the native ONNX Runtime
  1.30.0, checked against its pinned sha256 list; the run used the native runtime. EmbeddingGemma comes under the
  Gemma Terms of Use, so the script accepts them, the same as `memo models download embeddinggemma --accept-terms`.
- The fixture from `run.py --self-check`, corpus sha256 `1d36697c…5e8802`, the same as the Memo baseline.
- Isolation: [`index-variants.sh`](index-variants.sh) puts `HOME`, `XDG_*`, `WIRECAT_STATE_DIR`,
  `WIRECAT_CONFIG_DIR` and the npm cache in a new folder and sets `DBUS_SESSION_BUS_ADDRESS=disabled:`.
  Nothing reads the owner's models or keyring, and nothing signs in.

```sh
performance/agents/knowledge-graph-memory/index-variants.sh ~/.cache/wirecat-bench/index-variants/run2
```

The script installs cli-core 0.562.0, writes the fixture and runs [`index_variants.mjs`](index_variants.mjs). That
script builds every index in memory and writes `results/results.json` and `results/per-query.json`. The measured
`results.json` is [`index-variants-results.json`](index-variants-results.json).

**Same keywords, same scorer.** The script calls `memo_baseline.py`'s own `or_query` and `score_run` through Python,
so the keyword string and recall@k are exactly those of the Memo rows. The keywords row gives the meaning search the
whole OR string, quotes and `OR` included, as the Memo hybrid OR row did.

**Arms.** Every arm ranks all four kinds in one list, mail included.

1. **e5-small, one vector per record, no floor.** A second row keeps only hits at 0.80 or above, to see what the
   floor alone costs.
2. **Arm 1 + word search.** SQLite FTS5 with BM25 over the records, always queried with the OR keywords: the
   sentence as typed would need every word in one record and finds nothing, as Memo's word search showed. The two
   lists are merged by reciprocal rank fusion, k = 60, over every vector rank and every word match. Ties break by
   record order. "Typed" and "keywords" say what the meaning side embeds.
3. **EmbeddingGemma 300M** (4-bit, 768 dimensions), arms 1 and 2 again. It has no floor in cli-core.
4. **Grouped records.** Each project's eight records (chat, mail, note and meeting) form one group, as a thread or a
   project page would; the 1,920 archive records are cut into runs of eight in corpus order: 250 groups. A group is
   embedded as its records joined by line breaks (at most 277 e5 tokens, so no group is cut). A group hit stands for
   all its records in corpus order. With word search, the record-level BM25 list is fused with that expanded list.
   **This corpus has one-line records and no real threads, so this arm measures only dilution:** what happens to a
   record's vector when seven others share it. Grouping by kind and day was not used: the fixture gives every project
   the same timestamp per template, so such a group would hold one record of each of the ten projects.
5. **LLM-extracted facts.** Claude Haiku 5.5 rewrites each record into one to three short standalone facts; each
   fact keeps its record, is embedded with both models, with and without BM25 over the facts, and a hit on a fact
   counts as its record, once. Approved by the owner with Claude Haiku only (NEED-2211); results in
   [Arm 5: facts extracted by Claude Haiku](#arm-5-facts-extracted-by-claude-haiku).

### Results

40 questions have one expected record; the 10 budget questions have none.

| Arm | Query | Recall@1 | Recall@5 | Recall@10 |
|---|---|---:|---:|---:|
| Word search alone (BM25) | keywords | 0.50 | 0.97 | 0.97 |
| 1 · e5-small, records, floor 0.80 | typed | 0.38 | 1.00 | 1.00 |
| 1 · e5-small, records, floor 0.80 | keywords | 0.25 | 0.75 | 0.88 |
| 1 · e5-small, records | typed | 0.38 | 1.00 | 1.00 |
| 1 · e5-small, records | keywords | 0.25 | 0.75 | 0.88 |
| 2 · e5-small, records + BM25 | typed | 0.42 | 1.00 | 1.00 |
| 2 · e5-small, records + BM25 | keywords | 0.38 | 0.88 | 0.93 |
| 3 · EmbeddingGemma, records | typed | **0.50** | 1.00 | 1.00 |
| 3 · EmbeddingGemma, records | keywords | 0.15 | 0.97 | 1.00 |
| 3 · EmbeddingGemma, records + BM25 | typed | **0.50** | 1.00 | 1.00 |
| 3 · EmbeddingGemma, records + BM25 | keywords | 0.42 | 0.97 | 1.00 |
| 4 · e5-small, groups of 8 | typed | 0.25 | 1.00 | 1.00 |
| 4 · e5-small, groups of 8 | keywords | 0.20 | 0.93 | 0.93 |
| 4 · e5-small, groups of 8 + BM25 | typed | **0.50** | 1.00 | 1.00 |
| 4 · e5-small, groups of 8 + BM25 | keywords | 0.47 | 1.00 | 1.00 |
| 4 · EmbeddingGemma, groups of 8 | typed | 0.25 | 1.00 | 1.00 |
| 4 · EmbeddingGemma, groups of 8 | keywords | 0.25 | 1.00 | 1.00 |
| 4 · EmbeddingGemma, groups of 8 + BM25 | typed | **0.50** | 1.00 | 1.00 |
| 4 · EmbeddingGemma, groups of 8 + BM25 | keywords | 0.50 | 1.00 | 1.00 |
| 5 · e5-small, facts | typed | 0.25 | 1.00 | 1.00 |
| 5 · e5-small, facts | keywords | 0.10 | 0.20 | 0.20 |
| 5 · e5-small, facts + BM25 | typed | 0.40 | 0.97 | 1.00 |
| 5 · e5-small, facts + BM25 | keywords | 0.10 | 0.25 | 0.63 |
| 5 · EmbeddingGemma, facts | typed | 0.28 | 1.00 | 1.00 |
| 5 · EmbeddingGemma, facts | keywords | 0.25 | 0.95 | 0.97 |
| 5 · EmbeddingGemma, facts + BM25 | typed | 0.42 | 0.90 | 1.00 |
| 5 · EmbeddingGemma, facts + BM25 | keywords | 0.35 | 0.90 | 0.95 |
| *For comparison:* Memo hybrid (e5-small), 0.131.13 | typed | 0.25 | 0.30 | 0.30 |
| *For comparison:* OpenClaw (EmbeddingGemma + words) | typed | 0.35 | 1.00 | 1.00 |
| *For comparison:* Supermemory, hosted ([#288](https://github.com/WireCatLabs/cli-testing/pull/288)) | typed | 0.47 | 1.00 | 1.00 |
| *For comparison:* Mem0, hosted ([#288](https://github.com/WireCatLabs/cli-testing/pull/288)) | typed | 0.47 | 0.95 | 0.95 |

Build time, one run, native ONNX Runtime, 8 threads:

| Index | Items | Build |
|---|---:|---:|
| BM25 (FTS5, in memory) | 2,000 records | 0.03 s |
| e5-small vectors | 2,000 records | 13.0 s |
| e5-small vectors | 250 groups | 6.7 s |
| EmbeddingGemma vectors | 2,000 records | 51.5 s |
| EmbeddingGemma vectors | 250 groups | 44.6 s |

Arm 5 adds 5,531 facts: 22.6 s to embed with e5-small, 131.3 s with EmbeddingGemma, 0.1 s for their BM25 index, and
the extraction calls described below. Opening a model took 1.1 s; embedding the 50 questions took 0.2–0.3 s with e5-small and 0.8–1.1 s with
EmbeddingGemma. Download times are not counted.

Rank of the expected record per question group, question as typed (10 questions each):

| Group | Expected record | e5 records | e5 + BM25 | Gemma records | Gemma + BM25 | e5 groups | e5 groups + BM25 |
|---|---|---|---|---|---|---|---|
| current date | the confirming email | 2–3 | 3 | 3 | 3 | 2 | 2–3 |
| original date | the first chat message | 2–3 | 1–2 | 1 (one 2) | 1 | 1 | 1 |
| owner | the owner note | 1 | 1 | 1 | 1 | 3 | 1 |
| commitment | the meeting passage | 1–2 | 2–3 | 1–2 | 2–3 | 4 | 3 |

### What it showed

- **An index without Memo's three faults reaches the hosted numbers at 5 and 10.** e5-small, one list, mail
  included, scores 0.38 / 1.00 / 1.00 for the question as typed, against Memo's 0.25 / 0.30 / 0.30. It ties
  Supermemory at recall@5 and @10 and beats Mem0 there. At recall@1 it is 0.38 against the hosted 0.47.
  Word search (arm 2) lifts it to 0.42; EmbeddingGemma lifts it to 0.50.
- **The floor is not what hurt Memo here.** With the 0.80 floor the scores are the same in both rows. The floor cut
  some lists to 7 hits, but never an expected record.
  On this corpus the loss comes from leaving mail out of meaning search and from alternating sources.
- **Recall@1 stops at 0.50 for every design.** In every arm the email that confirms the new date is second or third:
  the original chat message and the project's reference note "the original delivery date…" come first. OpenClaw
  showed the same order (the email third), and the hosted services stop at 0.47; their ranks per group were not
  compared here. Finding the record is solved; choosing the current one
  is not, and that is a job for time order or an answer model, not for the index.
- **The OR keywords hurt meaning search.** Embedding `"current" OR "confirmed" OR …` instead of the sentence drops
  e5-small to 0.25 / 0.75 / 0.88 and EmbeddingGemma to 0.15 at recall@1. An agent should send the question as typed
  to meaning search and keywords only to word search.
- **EmbeddingGemma is better at rank 1 and four times slower to build.** 0.50 against 0.38 at recall@1, the same at
  5 and 10; 51.5 s against 13.0 s for 2,000 short records.
- **Facts extracted by Claude Haiku did worse than the records they came from** (arm 5): recall@1 0.25 against
  0.38 with e5-small and 0.28 against 0.50 with EmbeddingGemma, and the keyword queries collapsed to 0.10 / 0.20 / 0.20
  with e5-small. Repeated filler facts, facts without their project and a value copied across records explain it
  ([below](#arm-5-facts-extracted-by-claude-haiku)).
- **Grouping dilutes the vector but hides it in recall@5.** A group occupies eight places, so once the right
  project's group is first, recall@5 and @10 are near 1.00 whatever the order inside it. Recall@1 falls to 0.25: only
  the first record of each group, the original chat message, can be first. Word search then reorders the members
  and brings recall@1 back to 0.50. On this corpus grouping costs nothing at k ≥ 5 only because every group is one
  project, which a real thread is not always.

### Arm 5: facts extracted by Claude Haiku

The owner ran it on 2026-11-03 with one command; the key never passed through an agent:

```sh
performance/agents/knowledge-graph-memory/index-variants-facts.sh
```

[`index-variants-facts.sh`](index-variants-facts.sh) reads the Anthropic key with
`secret-tool lookup service cli-memo account anthropic`, before it turns D-Bus off for the rest of the run. The key goes
only into the environment of [`extract_facts.mjs`](extract_facts.mjs). It is never in argv, a URL or the output, and
the script prints only an error's status code. The work folder is `~/.cache/wirecat-bench/index-variants/facts` with
the same throwaway folders as `index-variants.sh`; `@anthropic-ai/sdk` 1.4.0 is installed beside cli-core 0.562.0.

`extract_facts.mjs` sends 25 records a call, four calls at a time, to `claude-haiku-5-5` with effort `low` and a JSON
schema for the answer. Records go in as `r0001`…`r2000`; a reply must give every name of its batch exactly once with
one to three facts, or the batch is tried once more and the run fails. The prompt: "Rewrite each record into 1–3 short
standalone facts. Keep names, dates and values exactly." Every finished batch is saved to `facts.json` with its
token counts and the cost at list price ($0.10 input and $0.50 output per million tokens for prompts up to 100,000,
[pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-11-03). A second run reuses
`facts.json`, calls nothing, and only scores again. A refused key stops the run after the first four batches.

**Cost, measured.** One extraction took 80 calls, 159,238 input and 143,462 output tokens as the API reported them:
$0.0877 at list price. **The run happened twice by accident:** two copies started at the same time, each found no
`facts.json` and paid for all 80 calls, 159,238 input and 143,587 output tokens the second time. **Real cost: $0.1754.**
The script now takes a lock on its work folder, so a second copy stops before it reads the key or calls anything.
Scoring every arm again took about 5.5 minutes after the extraction.

**The two copies agree except on e5-small's facts rows.** The first copy began scoring 3 seconds before the second
copy last wrote `facts.json`, so it probably scored its own extraction; the file kept is the second copy's. Every
EmbeddingGemma row and every row without facts is the same in both. The e5-small facts rows differ in 67 of 200
hit lists, and in one score: e5-small facts + BM25 with keywords has recall@10 0.60 in the first copy and 0.625 in
the second. The first copy's facts were overwritten, so this was not checked further. The tables show the second
copy, which matches the kept facts: [`index-variants-facts-results.json`](index-variants-facts-results.json) and
[`index-variants-facts.json`](index-variants-facts.json). With that file in a work folder's `facts.json`, the script
scores again without calling the API.

**The facts did not beat plain records at recall@1, and they hurt the keyword queries.** Question as typed, recall@1:
e5-small 0.25 with facts against 0.38 with records, EmbeddingGemma 0.28 against 0.50. With word search, 0.40 against
0.42 and 0.42 against 0.50. With the OR keywords, e5-small falls to 0.10 / 0.20 / 0.20, from 0.25 / 0.75 / 0.88.

Rank of the expected record, question as typed:

| Group | Expected record | e5 records | e5 facts | Gemma records | Gemma facts |
|---|---|---|---|---|---|
| current date | the confirming email | 2–3 | 2–3 | 3 | 2–5 |
| original date | the first chat message | 2–3 | 2 (one 1) | 1 (one 2) | 1–3 |
| owner | the owner note | 1 | 1 (one 2) | 1 | 1 |
| commitment | the meeting passage | 1–2 | 2–3 | 1–2 | 2–3 |

What a sample of `facts.json` shows:

- **Date order and source kind were not lost; they were never there.** The model saw each record's text only, the
  same text every other arm embeds. No timestamp and no kind went in, so the facts cannot order "original" before
  "current" any better than the records.
- **The archive filler became 1,845 near-copies of one fact.** "No delivery decision or budget approval." appears 1,500
  times, and 345 times more with "was made" or "for this item" added. The keyword string holds "delivery",
  "decision", "budget" and "approved", and the OR rows fill with archive records. Probably a short fact made only of
  those words is closer to the string than any project record, while in the records arms the same sentence sits
  beside a person and a topic, which keeps it further away. Distances were not compared.
- **Facts lose their subject.** 51 of the 141 facts from project records do not name the project, such as "No
  decision was made on this date." from the 2027-01-15 suggestion. A fact like that can only match by its other words.
- **Short facts make near-misses as close as the answer.** "Ari Vale committed to deliver the Amber Kite
  accessibility review." and "The Amber Kite accessibility review is still open." differ in a few words. That is
  probably why the meeting passage drops from first to second or third on the commitment questions.
- **The model copied a value across records.** Batches hold 25 records, and for three projects the reference note's
  fact reads "Current plans should use the confirmed replacement date, 2026-12-11.", a date the note does not hold;
  it comes from the confirming email in the same batch. Here it is true, but it is a fact taken from another
  record, and it makes the note compete with the email for the current date.

Checked without a key: with a fake key from a stand-in `secret-tool`, the API answered 401, the run stopped after four
batches with exit 1, and the fake key appeared in no output and no file. With stand-in facts (each record's own text
as its only fact), the facts rows scored the same as the record rows.

### What was not measured

- Memo itself with these fixes: this is an in-memory index with RRF k = 60, not Memo's fusion code, its notes
  search or its store. A fixed Memo has to be measured again with `memo_baseline.py`.
- Arm 5 with the record's time and kind in the prompt, one record a call, another prompt or another model. Only one
  extraction is scored here; two ran, and the first copy's facts were overwritten.
- Query time inside a store, and memory use. The scan here is a loop over vectors in memory.
- Other group sizes, a real thread structure, and longer records that a model would cut.
- Rerankers, other fusion constants, and other word-search settings (Porter stemming, column weights).
- More than one run; build times will vary.
- Variance across machines, a cold disk cache, and a larger or multilingual corpus.

## The 10K archive corpus (5 November 2026)

**Why it was built.** On 2,000 one-line records every strong setup answered all 50 questions
([RESULTS.md](RESULTS.md)): the data was too small and too easy to show whether a context layer helps. The owner
asked (5 November 2026) for the next round to use at least 10,000 records, and for the projects to stay realistic:
about the same ten, each with a long, noisy history, not fifty thin ones, and (same day) 50 questions: one
milestone per real project, the rest of the corpus as distractors. This corpus is that round's data. No engine has
run on it yet.

```sh
python3 performance/agents/knowledge-graph-memory/run.py --self-check --records 10000 --output /tmp/kg-memory-10k
```

| | 2K fixture (unchanged) | 10K archive corpus |
|---|---:|---:|
| Records | 2,000 | 10,000 |
| Telegram / mail / notes / meetings | 500 / 500 / 500 / 500 | 2,116 / 4,149 / 1,780 / 1,955 |
| Mail replies quoting earlier text | 0 | 2,021 |
| Projects | 10 | 12 (the ten, plus look-alikes Amber Kitchen and Hazel Ridge) |
| Milestones | — | 50 (Amber Kite beta, Amber Kite launch, …) |
| Question subjects | 10 projects | 10 milestones, one per real project |
| Questions | 50 | 50 |
| Records naming one project (median) | 8 | 766 |
| Records naming one question subject (median) | 8 | 91 |
| Text characters | 296,860 | 995,773 |
| Tokens, record texts one by one (`o200k_base`) | 60,175 | 237,593 |
| Tokens, whole JSONL | 147,426 | 692,168 |
| Corpus sha256 | `1d36697c…5e8802` | `e99e1e52…c1f6b8f0` |

Every number in this table comes from [`corpus_stats.py`](corpus_stats.py)
(`uv run --quiet --no-project --with tiktoken==0.14.0 python corpus_stats.py <fixture>`). Tokens use
`tiktoken==0.14.0`, the method of the [cost plan](#api-cost-plan-24-october-2026), and reproduce its 2K numbers
exactly. Seed 20261105, `fixture_version` 2, Python 3.14.4. Two runs give the same
bytes. Full hash: `e99e1e524875a7ca087f90952f061aac70856bdfbbe56d3915de1bd4c1f6b8f0`.

**The 2K fixture is unchanged.** With no `--records` or `--records 2000`, `corpus.jsonl`, `oracle.json`,
`queries.json`, `self-check.json` and `manifest.json` are byte-identical to `origin/main` (checked with `cmp`), and
so is the mbox that `memo_baseline.py` writes from it.

**What makes it harder**, against the corpus weaknesses listed for the 2K fixture:

- **Long histories.** Each milestone's records spread from January to mid-October 2026 at its own pace; all
  records are sorted by time before ids are given, so an id says nothing about importance.
- **Several date changes**: two to four confirmed changes per milestone, each a mail thread (a proposal, then a reply
  that confirms it and quotes the proposal) or, for the last change of about a third, a meeting decision. 40 % of
  the changes are preceded by a rejected proposal.
- **An "almost moved" date** for every milestone: a suggestion, a mail thread that parks it, and a meeting where it
  comes up again and no one confirms it. It is in the question's stale answers.
- **Meeting recaps that restate superseded facts**: "the plan currently says 2027-02-15" after a date that later
  changed; "X led the delivery in the first months" after a handover.
- **Owners handed over** (22 of 50 milestones, 4 of the 10 asked) and **commitments revised** (25 of 50, 5 of the 10
  asked). The old owner and the old deliverable count as stale answers.
- **Look-alike names across and inside projects.** Amber Kite and Amber Kitchen share milestone names; their leads are
  Ari Vale and Ari Vail. Ten people have a twin one letter away (Bo Reed and Bo Read, Hal Cove and Hal Grove). Every
  milestone has a look-alike or teammate who "is not the delivery owner", "could take over, nothing agreed", or
  offers a deliverable that nobody accepted.
- **Noise about the real projects.** About 90 % of the records name a project, a milestone and its people
  (standups, CI, offsite and demo dates, invoices, mail threads with "thanks, will read it" replies) and decide
  nothing. About 10 % are general office noise. There is no "Archive item N" filler.
- **Unapproved budgets.** Every milestone has a draft budget figure that was never approved and an unanswered
  question about the budget. The right answer stays "unknown".

**Which milestones are asked.** For each of the ten original projects, its hardest milestone: the most confirmed
date changes, then the most rejected proposals, then a handover, then a revised commitment; a tie goes to the
earlier milestone. All ten also have an "almost moved" date. The other 40 milestones and the two look-alike projects
stay in the corpus as distractors and are never asked about. The asked ones:

| Project | Asked milestone | Confirmed changes | Rejected proposals | Stale dates to read past |
|---|---|---:|---:|---:|
| Amber Kite | launch | 4 | 0 | 5 |
| Birch Compass | pilot | 4 | 3 | 8 |
| Cedar Lantern | data migration | 3 | 3 | 7 |
| Dune Harbor | pilot | 2 | 2 | 5 |
| Elm Beacon | partner API | 4 | 1 | 6 |
| Flint Meadow | security hardening | 3 | 1 | 5 |
| Grove Atlas | billing revamp | 4 | 1 | 6 |
| Hazel Bridge | security hardening | 4 | 2 | 7 |
| Iris Summit | security hardening | 4 | 3 | 8 |
| Juniper Valley | launch | 4 | 3 | 8 |

The current date is confirmed in a mail reply for 7 of them and in a meeting for 3. `manifest.json` lists the asked
milestones (`asked_milestones`).

**Same five question kinds, same scorer.** Per asked milestone: current confirmed date (cited: the last confirmation),
original date (the first chat message), current owner (the handover, or the owner note when there was none),
the commitment of the person who made it (the revision, or the original meeting), and the approved budget
("unknown", no citation). Each has one checkable answer, and the current one is found only by reading past stale
or unconfirmed ones. `run.py`'s `score` is unchanged. The self-check makes the same four injected errors and expects
48 correct, 47 cited correctly, 1 stale, 47 strict. Scoring a 10K run needs `--records 10000`, so the scorer builds
the same 50 questions.

**Runners that changed for it:** record names past `r9999` (`r10000`) are parsed, memo syncs allow 50,000 items (the
10K corpus has 5,851 note files, above the old limit of 5,000), replies in the mbox carry `In-Reply-To` and the
thread's `X-GM-THRID`, `provider_retrieval.py` ingests every record unless `--records` asks for a pilot or
`--subset` for the Mem0 subset (below), and `hermes_runner.py` takes `WIRECAT_BENCH`, as `hermes-anthropic-key.sh`
already did, so the 10K configurations live beside the 2K ones instead of on top of them.

### The Mem0 subset

Mem0's free tier has too few adds left this month for 10,000 records (see the estimates below), so the owner chose
(5 November 2026) to give Mem0 a subset, **reported as such in every result**. `run.py --records 10000` writes it as
`subset-mem0.json`: 6,500 record ids in corpus order, with their size and sha256, also in `manifest.json`. It is
built in tiers, each taken whole, in this order:

| Tier | Records |
|---|---:|
| every record naming an asked milestone | 903 |
| records of the asked projects' other milestones and of the look-alike projects that mention a date, owner, commitment, budget, handover or recap | 1,292 |
| quoting replies about the asked or look-alike projects | 1,605 |
| records naming a look-alike twin of an asked milestone's people together with one of those projects | 1,849 |
| noise, the rest in a fixed shuffled order (seed 20261105) | 851 |
| **total** | **6,500** |

Subset sha256 (the records' JSONL lines in corpus order):
`6273370e89cb74e034e6e7e72f683975e3da4d87feae9f3c0fd5b245268cb973`. Every record the answer key cites is in it.
Record names stay those of the whole corpus (`r0042` is the same record in every setup), and
`provider_retrieval.py --subset` refuses a subset that does not match the fixture. 6,500 leaves room under the
estimated 7,850 adds left for Hermes + Mem0's own per-turn adds (50) and a margin. The subset is easier than the
full corpus only in the amount of plain noise: every hard distractor named above is in it.

## Store search on the 10K corpus (5 November 2026)

**Why.** On the 2K fixture every hosted store found every source in its top 5, so search alone could not tell the
setups apart ([RESULTS.md](RESULTS.md)). Before the paid agent runs on the 10K corpus, this asks the cheaper question
first: on 10,000 noisy records with several date changes per milestone, does each store still put the record that
holds the answer near the top, and above the stale ones? The answer tells us which agent runs are worth paying for and
what an agent has to do with the hits. No answer model is involved.

### Setup

- Data: the [10K archive corpus](#the-10k-archive-corpus-5-november-2026), corpus sha256 `e99e1e52…c1f6b8f0`, the
  same 50 questions, 40 scored (the 10 budget questions cite nothing). Mem0 holds the
  [6,500-record subset](#the-mem0-subset), which contains every cited record.
- Harness: [wcatbench](https://github.com/WireCatLabs/wcatbench) 0.1.0 at `4f43086` for SQLite, Supermemory and the
  final Mem0 search; this folder's `provider_retrieval.py` for the provisional Mem0 search and `memo_baseline.py` for
  Memo. Both score the same way: partial credit `|sources ∩ hits[:k]| / |sources|`, as `score_run` here. wcatbench's
  scorer is a copy of it, pinned by tests that rescore the 2K runs and get the published numbers.
- Two forms of each question: **as typed**, and **keywords** (common English words dropped, the rest joined by OR, the
  stop list fixed before any run).
- Stores:
  - **SQLite full text search** on this computer (wcatbench store `fts`): a floor, what plain word search does.
  - **Supermemory**, tag `wirecat_bench_20261105_023737`: all 10,000 records, hybrid search, limit 10. Searched when
    a sample of 50 documents had finished building memories (`dreamingStatus`), at 1,582 memories.
  - **Mem0**, user `wirecat_bench_20261105_023735`: the subset, `infer: true`, `top_k: 10`.
  - **Memo** 0.131.38 with mail CLI 0.16.3, word search and word + meaning search (`e5-small`), on a disposable store
    with no keyring access. From memo 0.131.28 mail is stored by the mail CLI: `memo_baseline.py` writes a throwaway
    mail profile and runs `mail synthetic messages import mail.mbox` (no sign-in), then memo searches it from the
    shared store. One `memo sync` embeds at most 600 chunks of notes and 600 of mail, so the script repeats it until
    nothing is left (9 runs, 104 s here).
- Linux, Python 3.14.4, from Valencia; hosted times include the network.

Reproduce (the hosted builds need the owner's keys in the system keyring, service `supermemory` or `mem0`):

```sh
W="uvx --from git+https://github.com/WireCatLabs/wcatbench@4f43086 wcatbench"
$W dataset build synthetic -p records=10000          # synthetic-10000-e99e1e52, same bytes as run.py --records 10000
$W store build fts -d synthetic-10000-e99e1e52 --space demo
$W store search fts -d synthetic-10000-e99e1e52 --space demo
export WCATBENCH_KEYRING_ACCOUNT=wirecat
$W store build supermemory -d synthetic-10000-e99e1e52 --space <new tag> --wait-minutes 900
$W store search supermemory -d synthetic-10000-e99e1e52 --space <tag>
$W store build mem0 -d synthetic-10000-e99e1e52 --subset mem0 --space <new user id> --wait-minutes 900
$W store search mem0 -d synthetic-10000-e99e1e52 --subset mem0 --space <user id> --rewrite typed
# Memo, from this folder; the fixture is run.py --records 10000
python3 run.py --self-check --records 10000 --output /tmp/kg-fixture-10k
python3 memo_baseline.py --fixture /tmp/kg-fixture-10k --output /tmp/memo-10k   # memo and mail on PATH
```

A stopped hosted build continues with `--resume` and sends only what the store does not hold; `store status` checks
without sending. Each build writes `build.json`, `ledger.jsonl`, `status-*.json` and `manifest.json` under
`~/.local/share/wcatbench/builds/<store>/<dataset>/<space>/`, and each search a folder with `typed.jsonl`,
`keywords.jsonl` (one line per question, the record ids in rank order) and `results.json`.

### Results

| Store | Records | As typed: top 1 / 5 / 10 | Keywords: top 1 / 5 / 10 | Half the searches under |
|---|---:|---|---|---:|
| SQLite word search (floor) | 10,000 | 0.25 / 0.62 / 0.80 | **0.47** / 0.62 / 0.75 | 0.002 s |
| **Memo 0.131.38, word + meaning** | 10,000 | **0.72** / **1.00** / **1.00** | **0.68** / **0.97** / **1.00** | 1.59 s |
| Memo 0.131.38, word search only (no model) | 10,000 | 0.17 / 0.97 / 1.00 | 0.17 / 0.70 / 0.75 | 0.40 s |
| Supermemory | 10,000 | 0.20 / 0.70 / 0.90 | 0.25 / **0.78** / **0.93** | 0.49 s |
| Mem0, all 6,500 processed (6,926 memories) | 6,500 | 0.10 / 0.53 / 0.70 | not run | 0.54 s |
| Mem0, provisional (5,932 of 6,500 processed) | 6,500 | 0.10 / 0.50 / 0.72 | not run | 0.92 s |

**Where the cited record ranked, by question kind** (10 questions each; rank 1 = first, — = not in the top 10):

| Store, question form | Current date | Original date | Owner | Commitment |
|---|---|---|---|---|
| SQLite, keywords | 3 first, 10 in top 10 | 10 first | 6 first, 10 in top 10 | 0 in top 10 |
| Supermemory, as typed | 1 first, 6 in top 10 | 1 first, 10 in top 10 | 6 first, 10 in top 10 | 0 first, 10 in top 10 |
| Supermemory, keywords | 0 first, 8 in top 10 | 4 first, 10 in top 10 | 6 first, 9 in top 10 | 0 first, 10 in top 10 |
| Mem0, as typed | 0 first, 10 in top 10 | 2 first, 7 in top 10 | 2 first, 8 in top 10 | 0 first, 3 in top 10 |
| **Memo word + meaning, as typed** | 3 first, the rest at rank 2 | **10 first** | 6 first, 10 in top 10 | **10 first** |
| Memo word search only, as typed | **7 first**, the rest at rank 2 | 0 first, all at rank 2 | 0 first, 10 in top 10 | 0 first, all at rank 2 |

**Time to build each store:**

| Store | Sending | Until searchable as intended |
|---|---|---|
| SQLite | 7 s | at once |
| Memo 0.131.38 | 38 s for 5,851 note files and 4,149 mails | 104 s more to embed everything for meaning search |
| Supermemory | 31 min (100 per batch, about 85 s per batch) | about 14 h until the sampled documents finished building memories (02:37 to about 16:50 UTC) |
| Mem0 | 80 s to accept 6,500 adds | 19 h: every add processed by 21:40 UTC (sent 02:37); about 250 an hour in the afternoon |

### What it showed

- **Memo finds the most and ranks it best.** Word + meaning search of the question as typed puts the source first in
  72 % of questions and in the top 5 in all 40; Supermemory 20 % and 70 %, Mem0 10 % and 53 %. It ranks every original
  date and every commitment first, and 6 of 10 owners.
- **The current date is the one kind no store ranks first reliably.** Memo's meaning search puts it first in 3 of 10
  and second in the other 7, Supermemory first in 1, Mem0 in 0. Memo's word search alone does better on it (7 of 10
  first: the confirming mail reply) but worse on everything else, because `search all` without a model takes turns
  between mail and notes (MEMO-37) and puts every note source at rank 2. Combining the two orders is the gain left
  in this test.
- **Memo's meaning search must be complete to count.** The first Memo run embedded one batch of 600 chunks and left
  the rest: its word + meaning row (0.20 / 0.97 / 1.00) was word search. Embedded fully it rose to 0.72 at rank 1. A
  user whose sync stops after one batch gets the low number; this is worth a fix in memo (embed all by default, or
  say how much is left).
- **The other stores rank stale records above the current date.** Supermemory put the confirmation first 10 of 10
  times on the 2K fixture and 1 of 10 here: with several date changes per milestone, older records match the question
  just as well. An agent on those stores that takes the top hit answers with an old date; it has to read several hits
  and compare their dates. This is what the agent runs must measure.
- **Supermemory is second, Mem0 last.** Supermemory finds every commitment, which plain SQLite word search misses (the
  revised commitment does not repeat the question's words). Mem0, even with all cited records sent, loses most
  commitments and two owners: fact extraction rewrote or dropped them, as on the 2K fixture.
- **Plain word search beats both hosted services at rank 1.** SQLite with keywords puts the source first in 47 % of
  questions, Supermemory in 25 %, Mem0 in 10 %. Its strength is the original date (the first chat message, 10 of 10
  first), its gap the commitments. Memo's strict word search of the sentence (`--exact`, the mode before MEMO-36)
  still finds nothing (50 empty replies).
- **Waiting for Supermemory's memories changed little.** A search at 1,229 memories gave 0.225 / 0.675 / 0.875 as
  typed; at 1,582 memories 0.20 / 0.70 / 0.90.
- **Mem0 did not improve when it finished.** The provisional search (5,932 processed) and the final one (all 6,500)
  differ by one source: one original date dropped out of the top 10, and recall@5 rose 0.03.
- **Hosted stores take most of a day to build at this size** on the plans used (Supermemory free credit, Mem0 free
  tier). A user importing a year of history waits that long before the memory answers well. Mem0's pricing page and
  docs (read 5 November 2026) say nothing about processing speed or queue priority per plan; an SLA is listed only
  for the Custom plan. Whether a paid plan is faster was not measured.

### What was not measured

- Memo with a model other than `e5-small`.
- Mem0 keywords form (to keep retrievals for the agent runs), Mem0 on all 10,000 records, Supermemory's `rerank`,
  thresholds, limits above 10.
- How an agent uses these hits: that is the agent round.
- Paid plans' processing speed.

## Agent answers on the 10K corpus (6 November 2026)

**Why.** The store search above says which store finds the record; this asks whether an agent with that store
answers correctly. Same 50 questions, Claude Sonnet 5.5, one question per fresh session, scored by `run.py
--records 10000` (exact match after normalisation, no judge model).

**Setup.** OpenClaw 2026.10.9 and Hermes 0.21.0 as in the 2K round. WireCat setups: memo 0.131.38 (pinned
`~/.cache/wirecat-bench/memo-0.131.38`), mail imported with mail CLI 0.16.3, meaning index complete. Plugins:
`@supermemory/openclaw-supermemory` 2.1.19 and `@mem0/openclaw-mem0` 1.2.1 on the stores searched above; OpenClaw's
plugin homes run with Code Mode and Tool Search off (see [isolation](#isolation-and-fairness)). Commands: the
[paid steps](#paid-steps-in-order), steps 3 to 6. OpenClaw alone was run in two parts (q01–q23, then q24–q50 after
the agent session that ran it ended) and joined by question id; every other setup is one run.

| Setup | Correct | Correct with sources | Stale answers | Median s / question | Cost for 50 |
|---|---:|---:|---:|---:|---:|
| OpenClaw alone (files) | **50** | **47** | 0 | 24.0 | $2.30 |
| OpenClaw + WireCat | **50** | 45 | 0 | 23.7 | $2.03 |
| OpenClaw + Supermemory | 17 | 10 | 6 | 27.8 | $1.54 |
| OpenClaw + Mem0 | not valid, rerun pending | | | | |
| Hermes alone | 49 | 28 | 1 | 8.7 | 3.39M tokens |
| Hermes + WireCat | 45 | 32 | 0 | 13.2 | 2.13M tokens |
| Hermes + Supermemory | 16 | 10 | 7 | | |
| Hermes + Mem0 | not run: API limit | | | | |

OpenClaw's cost is its own per-call report; Hermes reports tokens and no price. The 10 budget questions are
answered "unknown" correctly by every setup, so 10 of each "correct" are those.

**What it showed:**

- **Supermemory makes both agents worse than no memory**: 17 and 16 correct, of which 10 are the "unknown" budget
  questions, against 49–50 with no memory. Most other answers are "unknown" (the agent found nothing it trusted) or
  a stale date (6 and 7): the store ranks old dates above the current one, as the search test predicted, and the
  plugin agents have no other source to check.
- **Plain files are still enough for a strong agent at 10,000 records**: OpenClaw searching its workspace with shell
  tools answered all 50. WireCat matched it at 12 % less cost; Hermes + WireCat used 37 % fewer tokens than Hermes
  alone and cited the right records more often (32 against 28).
- **Hermes + WireCat's 5 misses are mostly format**: 4 are the right commitment with a note in parentheses
  ("the rollback plan (revised from the usability study)"), which exact matching counts as wrong; one (q29) gave a
  date for a commitment.
- **OpenClaw + Mem0 was not tested**: with Tool Search on, the agent asked for `memory_search` and got "Tool
  memory_search not found" on every question (the plugin's tool is `openclaw:openclaw-mem0:memory_search`), so all
  40 project questions came back "unknown". Tool Search is now off in the plugin homes; the run is to be repeated.
- **The owner's Anthropic key reached its monthly usage limit** during OpenClaw + Mem0's last 4 questions
  ("The AI service needs a short break") and for all of Hermes + Mem0 (`HTTP 400: You have reached your specified
  API usage limits`). Both Mem0 setups wait for the limit.

## OpenClaw + Supermemory and OpenClaw + Mem0 (5 November 2026)

**Why.** The owner asked (5 November 2026) to compare these as setups of their own: a user who runs OpenClaw with a
hosted memory plugin, does that user still need WireCat? Hermes + Supermemory and Hermes + Mem0 already ran
([RESULTS.md](RESULTS.md)). Nothing was ingested and no paid call was made for this section.

**The plugins are official.** `npm view <package> maintainers repository.url dist.attestations _npmUser` (5 November
2026) shows both published by GitHub Actions with SLSA provenance from the vendor organization's repository:

| | Supermemory | Mem0 |
|---|---|---|
| Package | [`@supermemory/openclaw-supermemory`](https://www.npmjs.com/package/@supermemory/openclaw-supermemory) 2.1.19 | [`@mem0/openclaw-mem0`](https://www.npmjs.com/package/@mem0/openclaw-mem0) 1.2.1 |
| Source | [supermemoryai/openclaw-supermemory](https://github.com/supermemoryai/openclaw-supermemory), built by `publish.yml` on `main` | [mem0ai/mem0](https://github.com/mem0ai/mem0), `integrations/openclaw`, built by `openclaw-cd.yml` at tag `openclaw-v1.2.1` |
| npm maintainers | `dhravya` | `deshrajdry`, `howard.gil.mem0`, `kartik-mem0` |
| Docs | [Supermemory OpenClaw guide](https://supermemory.ai/docs/integrations/openclaw) | [Mem0 OpenClaw guide](https://docs.mem0.ai/integrations/openclaw) |

### What the agent gets

Read in the installed package code (2.1.19 and 1.2.1), not run against the services:

| | Supermemory | Mem0 |
|---|---|---|
| Search tool | `supermemory_search` (also `supermemory-search`): `query`, `limit` (5) | `memory_search`: `query`, `limit` (5), `scope` (`all`), `userId`, `agentId`, `categories`, `filters` |
| What a hit shows the model | `1. <memory text> (NN%)`: no id, no metadata, no date (`tools/search.ts`) | `1. <memory text> (score: NN%, id: <Mem0 memory id>)`: no metadata (`dist/index.js`, `memory_search`) |
| Request | `POST /ns/{tag}/search` (API v5, the default), `searchMode: "memories"`, `threshold: 0.6` (`client.ts`) | `POST /v3/memories/search/` filtered by `user_id`; `scope: all` adds a second search with the session's `run_id` |
| Other read tools | `supermemory_profile` | `memory_get` (adds created and updated dates), `memory_list`, `memory_event_list`, `memory_event_status` |
| Write tools (denied here) | `supermemory_store`, `supermemory-save`, `supermemory_forget`, `supermemory-forget` | `memory_add`, `memory_update`, `memory_delete` |
| Auto-recall and auto-capture | on by default (`config.ts`) | on by default, though the manifest calls them opt-in |

- **No setup can cite a record.** Our record name is stored on every memory (`metadata.rid`, and Supermemory's
  `customId`), but neither plugin shows it to the model. As with Hermes, "correct with sources" can score only the
  budget questions, where the right citation is none.
- **The existing stores can be searched as they are.** Supermemory uses `containerTag` unchanged (only characters
  outside `[A-Za-z0-9_]` become `_`) and lets the model pick another tag only with `enableCustomContainerTags`, off by
  default and off here. Mem0 filters by `user_id` only, but **changes the user id for any agent not named `main`**
  to `<userId>:agent:<agentId>`, an empty store here; the bench agent is therefore `main`.
- **Supermemory searches only extracted memories**, not raw chunks, with a 0.6 cutoff. The bench store was built
  from documents, and at 4.5 h a sample of it was still being processed. How many of the 2,000 records it holds as
  memories is not known; the retrieval run used `hybrid` mode, which also returns chunks.
- **Mem0's default `scope: all` makes two Mem0 searches per tool call**; that doubles the retrievals counted against
  the free tier (below).
- Both bundle a skill. Mem0's tells the model to save facts with `memory_add` on its own; that tool is denied.

### Isolation and fairness

- **One OpenClaw home per plugin**, `~/.cache/wirecat-bench/openclaw/plugins/<plugin>/home` (`HOME` and
  `OPENCLAW_HOME`), sharing only Node and the OpenClaw package. The memory slot is exclusive per home: installing a
  plugin in the existing home would replace the files agent's memory search
  ([plugins](https://docs.openclaw.ai/tools/plugin)). Both plugins call `os.homedir()` directly (Mem0 writes its
  telemetry id and key fingerprint into `~/.openclaw/openclaw.json`), so only a moved `HOME` keeps them out of the
  owner's folder. `~/.openclaw` was listed before and after both installs, the dry runs and the key test: unchanged.
- **Writes are off three ways**, so the store is the same for every question: `autoCapture` and `autoRecall` are
  false; `hooks.allowConversationAccess` is not granted, so OpenClaw would not run a plugin's turn hooks anyway
  (`plugins inspect --runtime` reports `hookCount: 0` for both, read with a fake key in place, when both had
  registered their tools); the write tools are denied; and `compaction.memoryFlush` is off.
- **Memory tools only, like Hermes + Supermemory and + Mem0.** The agent's tool policy denies `group:fs`,
  `group:runtime`, `group:web`, `group:ui`, `group:sessions`, `group:automation`, `group:nodes`, `ls` and
  `view_image`, so it cannot read the files agent's workspace. Whether OpenClaw removes every one of them could not
  be seen without a model call: the runner fails a run in which any denied tool ran (`denied_tools_used`).
- **Code Mode off in the plugin homes** (`tools.codeMode: false`). The 10K pilot (6 November 2026) failed that
  check twice: with the setting unset, OpenClaw turned Code Mode on for Claude Sonnet 5.5 and the model saw one
  JavaScript tool named `exec` that calls the hidden tools. The transcripts show it called only `supermemory_search`,
  `memory_search` and `memory_list`, but the check cannot tell that `exec` from a shell. With Code Mode off the agent
  reaches the memory tools directly or through OpenClaw's tool search (`tool_search`, `tool_call`); the pilot's
  `tool_call` targets were memory tools only. The files and memo agents keep OpenClaw's default, as in the 2K round,
  so this is one difference between the OpenClaw setups. The check reads tool names, not `tool_call` targets.
- `MEM0_TELEMETRY=false` for Mem0 (the plugin and its SDK send usage events to PostHog otherwise).
  `DBUS_SESSION_BUS_ADDRESS=disabled:` as for every run here.
- Install accepts the plugins' capability consent (`--accept-capabilities`) after reading both manifests: the memory
  slot, the listed tools, one skill, one CLI command. OpenClaw warns that npm sources are outside its review.
- **The two Mem0 setups differ by design.** Hermes's Mem0 provider adds every turn to the store and has no switch
  for it (above); OpenClaw + Mem0 here writes nothing. Hermes + Supermemory kept its provider's default too.
- Auto-recall off is a choice: a user's default would put memories in every prompt and spend a search per turn. It
  could be a second, labelled variant.

### Commands

```sh
cd performance/agents/knowledge-graph-memory
python3 openclaw_runner.py install-plugin --plugin supermemory --store wirecat_bench_20261102_183348 \
  --fixture ~/.cache/wirecat-bench/fixture
python3 openclaw_runner.py install-plugin --plugin mem0 --store wirecat-bench-20261102-175648 \
  --fixture ~/.cache/wirecat-bench/fixture
./openclaw-memory-keys.sh                    # the owner, once: Anthropic key and the plugin key per home
python3 openclaw_runner.py answer --fixture ~/.cache/wirecat-bench/fixture --agent supermemory \
  --model anthropic/claude-sonnet-5-5 --only q01 --output /tmp/oc-sm-pilot      # then mem0
```

Both installs ran on 5 November 2026 and the plugins load (`plugins inspect --runtime`: `status: loaded`, memory slot
selected). `openclaw-memory-keys.sh` pipes `secret-tool` into `models auth paste-api-key --agent main`, and writes
`SUPERMEMORY_OPENCLAW_API_KEY` or `MEM0_API_KEY` to `<home>/.openclaw/.env` (mode 600), which OpenClaw loads and
substitutes into the plugin's `"${KEY}"` config value. **Checked with a fake `secret-tool`** in a copy of both homes:
no key was printed, both `.env` files are mode 600, Supermemory registered its eight tools only once its key was
there, `openclaw mem0 status` answered "Authentication failed" (so the fake key reached Mem0), the runner's check
found the key in no other file, and an `answer` dry run of q01 on each agent ended at the
Anthropic sign-in with a clean record. `answer` refuses to start without the key file, and after a run it fails if
the key appears in any other file of the home (`key_copied_to`). Each home's `store.json` records the corpus
sha256 of the fixture its store was ingested from (`install-plugin --fixture`, and `--subset` for Mem0's subset), and
`answer` refuses another fixture: the 2 November stores hold the 2K corpus. The 10K stores and their homes are set up
by the [paid steps](#paid-steps-in-order) below.

### What was not measured

- Any search or answer through the plugins (no key here). The first paid question per agent shows the tools the agent
  really had.
- Whether Supermemory's v5 `ns/{tag}` search finds documents ingested through `/v3/documents/batch` with that
  `containerTag`; the plugin's `apiVersion: "legacy"` is the fallback to try.
- How many memories the Supermemory store holds after processing.

## Cost and limits for the 10K round (estimates, 5 November 2026)

Nothing here was spent. **Measured** marks numbers from runs recorded above; everything else is an estimate.
Prices from [Supermemory pricing](https://supermemory.ai/pricing) and [Mem0 pricing](https://docs.mem0.ai/platform/pricing),
read 5 November 2026. The round is 50 questions; Supermemory gets all 10,000 records, Mem0 the 6,500-record subset.

### Ingest

| | Supermemory, 10,000 records | Mem0, 6,500-record subset |
|---|---|---|
| Measured on 2,000 | submit 88 s per batch of 100 (29 min for 1,900); memories still processing at 4.5 h | 2,000 adds submitted in 400 s; 716 processed after 90 min (pilot: 100 in 13 min) |
| Submit (estimate) | about 2.5 h, 100 batches | about 22 min |
| Until processed (estimate) | a day or more, if processing scales with records | about 13–14 h at the measured 8 per minute |
| Price | $0.005 per 1K tokens as memories, $0.001 as plain documents; $5 free credit a month | free tier with Mem0's model: 10,000 adds and 1,000 retrievals a month |
| Cost (estimate) | 237,593 tokens: about $1.20 as memories, $0.24 as documents ("SM tokens" are their own unit) | $0, if it fits the allowance (below) |

**Mem0 allowance this month (estimate).** Already used: about 2,150 adds or more (100 pilot, 2,000 full, and the
Hermes + Mem0 run, whose provider adds every turn) and about 250–300 retrievals (about 155 on 2 November, 91
`mem0_search` calls on 3 November in 51 Hermes sessions, and Hermes's own lookups). Past the limit "calls return an
error until your limits reset next month". The free period ends on 25 November 2026 for accounts created before
26 October, otherwise 30 days after sign-up; the account's sign-up date was not checked.

| Mem0 use in this round | Adds | Retrievals | Based on |
|---|---:|---:|---|
| Subset ingest | 6,500 | 0 | |
| `provider_retrieval.py`, question as typed | 0 | 50 | one search per question (add the OR words row for another 50) |
| OpenClaw + Mem0, 50 questions | 0 | about 180 | Hermes + Mem0 searched 1.8 times per question (**measured**); the plugin's `scope: all` doubles each |
| Hermes + Mem0, 50 questions | 50 | about 90–140 | 1.8 tool searches per question, plus the provider's lookup each turn if it counts |
| **Total** | **about 6,550** | **about 320–370** | against about 7,850 adds and 750 retrievals left |

Harder questions may take more searches: at 1.5 times as many, retrievals reach about 550, still under 750. Pilot
questions count too.

Supermemory fits: about $1.20 for ingest; searches cost $0.005 per 1,000, and an answer run makes about 235 at the
measured 4.7 per question. This month's earlier ingests (about 4,000 documents of 30 tokens) are roughly $0.60 at
the memory rate. The account's usage page was not read.

### Sonnet answers for 50 questions

At the list price ($2 / $10 per million input / output, $0.20 re-read, $2.50 cache write). "2K, measured" is the
cost of the 50-question runs in [RESULTS.md](RESULTS.md); the 10K column is an estimate.

| Setup | 2K, measured | 10K (estimate) |
|---|---:|---:|
| OpenClaw alone | $1.33 | $1.60–4.00 |
| OpenClaw + WireCat (memo 0.131.24) | $2.73 | $3.30–8.20 |
| OpenClaw + Supermemory | not run | $1.60–3.40 |
| OpenClaw + Mem0 (subset) | not run | $1.20–2.40 |
| Hermes alone | $0.88 | $1.05–2.65 |
| Hermes + WireCat (memo 0.131.24) | $2.07 | $2.50–6.20 |
| Hermes + Supermemory | $3.34 | $3.35–5.00 |
| Hermes + Mem0 (subset) | $0.78 | $0.80–1.20 |
| **All eight** | **$11.13 for the six measured** | **about $15–33** |

How the estimates were made:

- **Files and memo agents scale with what a search returns, not with the record count.** On 2K a project name
  matched 8 records; on 10K it matches a median of 766, and an asked milestone's name 91 (a grep for it returns about
  2,000 tokens instead of 200). Most of a question's tokens today are the fixed prompt (OpenClaw alone: 97,800 per
  question), so a targeted search adds about 20 %; broad greps, more steps and re-reads into the cache could triple
  it. Hence 1.2–3 times the 2K cost.
- **Hosted memory agents get a fixed top 5 or 10**, so their cost hardly grows with the store: 1–1.5 times.
- **OpenClaw + plugins have no measurement.** The range takes Hermes + Supermemory and Hermes + Mem0 as the floor and
  OpenClaw's larger prompt (3.3 times Hermes's tokens, alone against alone) as the ceiling, minus the file and shell
  tools that are denied.
- Time: about 25 minutes per OpenClaw setup at the measured median of 27–33 s per question, under 15 minutes per
  Hermes setup.

### Paid steps, in order

Free preparation first; then each step that spends money or a free-tier allowance is marked. Run one heavy step at a
time; the 10K setups live in their own folders, beside the 2K ones.

```sh
K=performance/agents/knowledge-graph-memory
F=~/.cache/wirecat-bench/kg-fixture-10k
python3 $K/run.py --self-check --records 10000 --output $F                         # free
# 1. Supermemory ingest, all 10,000 (about $1.20 of credit); prints the new tag
python3 $K/provider_retrieval.py --service supermemory --fixture $F --output ~/.cache/wirecat-bench/runs/supermemory-10k \
  --variants default --rewrites verbatim --wait-minutes 240
# 2. Mem0 ingest, the subset (6,500 adds, 50 retrievals); prints the new user id
python3 $K/provider_retrieval.py --service mem0 --fixture $F --subset $F/subset-mem0.json \
  --output ~/.cache/wirecat-bench/runs/mem0-10k-subset --rewrites verbatim --wait-minutes 900
# 1–2 interrupted? Check, then continue in the same folder with the printed tag (sends only what is missing)
python3 $K/provider_retrieval.py --service supermemory --fixture $F --output ~/.cache/wirecat-bench/runs/supermemory-10k \
  --tag <tag> --status
python3 $K/provider_retrieval.py --service supermemory --fixture $F --output ~/.cache/wirecat-bench/runs/supermemory-10k \
  --tag <tag> --resume --variants default --rewrites verbatim --wait-minutes 240 > ~/.cache/wirecat-bench/runs/supermemory-10k/run.log 2>&1
# 3. OpenClaw for 10K (free): its own root; step 5 of the OpenClaw setup once, then prepare and the plugins
R=~/.cache/wirecat-bench/openclaw-10k
python3 $K/openclaw_runner.py --root $R install
python3 $K/openclaw_runner.py --root $R prepare --fixture $F
python3 $K/openclaw_runner.py --root $R install-plugin --plugin supermemory --store <tag from 1> --fixture $F
python3 $K/openclaw_runner.py --root $R install-plugin --plugin mem0 --store <user id from 2> --fixture $F \
  --subset $F/subset-mem0.json
# the owner, once, after steps 3 and 4: every 10K setup's keys from the keyring (the three scripts below in one)
$K/owner-10k-keys.sh
# 4. Hermes for 10K (free): its own folder
export WIRECAT_BENCH=~/.cache/wirecat-bench-10k
python3 $K/hermes_runner.py prepare --config alone --fixture $F
python3 $K/hermes_runner.py prepare --config wirecat --fixture $F
python3 $K/hermes_runner.py prepare --config supermemory --fixture $F --tag <tag from 1>
python3 $K/hermes_runner.py prepare --config mem0 --fixture $F --tag <user id from 2>
# 5. Pilots, one question each (Sonnet, a few cents each; Mem0 retrievals count)
for a in files memo supermemory mem0; do
  python3 $K/openclaw_runner.py --root $R answer --fixture $F --agent $a --model anthropic/claude-sonnet-5-5 \
    --only q01 --output ~/.cache/wirecat-bench/runs/oc10k-pilot-$a; done
for c in alone wirecat supermemory mem0; do
  python3 $K/hermes_runner.py answer --config $c --fixture $F --questions q01 \
    --output $WIRECAT_BENCH/runs/hermes10k-pilot-$c; done
# 6. Full runs, one setup at a time (about $15–33 in all), then score each with the 10K questions
python3 $K/openclaw_runner.py --root $R answer --fixture $F --agent files --model anthropic/claude-sonnet-5-5 \
  --output ~/.cache/wirecat-bench/runs/oc10k-files                                  # then memo, supermemory, mem0
python3 $K/hermes_runner.py answer --config alone --fixture $F --output $WIRECAT_BENCH/runs/hermes10k-alone
python3 $K/run.py --records 10000 --predictions ~/.cache/wirecat-bench/runs/oc10k-files/predictions.json \
  --engine "OpenClaw 2026.10.9 alone, claude-sonnet-5-5, 10K" --output ~/.cache/wirecat-bench/runs/oc10k-files-score
```

After each pilot, read its `per-question.json` (OpenClaw) or `.usage.json` (Hermes): the plugin agents' `tools` must
show only memory tools, and `run.json` must show `denied_tools_used: []` and `key_copied_to: []`.
