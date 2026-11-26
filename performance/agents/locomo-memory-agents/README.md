# LoCoMo: do memory engines beat plain files for an agent?

## Why it was run

The first post of the series, [memory for agents](https://wirecat.dev/ru/blog/memory-for-agents-benchmark), asked one
question: an agent has to answer from a long chat history; does a memory engine help it more than the same chat saved
as plain text files? This round asks it again with more agents, more engines and the public LoCoMo set, so that anyone
can rerun it. The answer decides what WireCat claims: that memo is better than files, or that it is as good and does
other things files cannot.

The question: on 50 LoCoMo questions, with the same agent and model, does each memory engine (WireCat memo,
Hindsight, Honcho, Mem0, Supermemory) answer more questions correctly than plain files? A third part (post 3 of the
series) keeps the agent and memo and changes only the model.

The data is LoCoMo, a public synthetic set. No real person's data was used.

## Short answer

- **No engine beat plain files.** In every agent and model, files scored highest or tied.
- **WireCat memo ties with files** in every arm: the paired difference is within noise each time (−1.3 at worst, with
  an interval that crosses 0).
- **Hermes + DeepSeek Flash:** Hindsight (−5.0), Honcho (−3.0) and Mem0 (−6.7) are below files by the paired test.
  Their intervals stay below 0. Supermemory is far below (−34), for reasons in [Known issues](#known-issues-found-and-fixed).
- **Claude Code + Claude Sonnet:** every engine is within noise of files (files 42, WireCat 42, Hindsight 41, Honcho
  40, Mem0 and Supermemory 38).
- **Scope:** each LoCoMo conversation has 19 to 32 sessions, 370 to 690 turns, 44,000 to 90,000 characters of text.
  That is small enough for grep over the files to find most answers, and this favours plain files. A larger history
  may change the result.

## Setup

### Agents, models and memory

| Part | Version |
| --- | --- |
| Hermes Agent | 0.23.3 (git `caafe538`), own venv |
| Hermes memory plugins | supermemory 1.0.1, hindsight 1.2.4, honcho 1.2.0, mem0 1.3.0 |
| OpenClaw | 2026.11.7 (`e31bbf0`), `@openclaw/deepseek-provider` 2026.11.7, llama.cpp EmbeddingGemma for its memory index |
| Claude Code | 2.1.330, `claude -p`, model `claude-sonnet-5-5` |
| WireCat memo (`@wirecat/cli-memo`) | 0.149.0, EmbeddingGemma |
| Hindsight server | 1.2.3 (docker `ghcr.io/vectorize-io/hindsight:1.2.3`), extraction with OpenAI gpt-4o-mini |
| Honcho server | 3.6.1 (docker compose), every model call gpt-4o-mini; its MCP package from the v3.6.1 tag |
| Mem0 | hosted platform; extraction through Mem0's bring-your-own-key option, model `deepseek/deepseek-v4.1-flash` on OpenRouter |
| Supermemory | hosted platform |

Arms (agent + model):

- **Hermes + DeepSeek Flash** (`deepseek-flash`, DeepSeek's API): every setup, 3 runs of 50 questions (Mem0: 1 run).
- **OpenClaw + DeepSeek Flash:** files and WireCat, 3 runs of 50.
- **Claude Code + Claude Sonnet 5.5:** every setup, 1 run of 50. It ran on a subscription, so its costs below are list
  prices, not money spent.
- **Hermes and OpenClaw + DeepSeek V4 Pro:** 1 run of the 20 questions in
  [data/strong-subset-ids.txt](data/strong-subset-ids.txt). This keeps the agent fixed and changes only the model.
- **No memory:** Claude Code with no tools, and DeepSeek Flash called directly with no agent, both told to answer only
  what they already know. This checks that the model does not know LoCoMo by heart.

Setups:

- **files:** one Markdown file per session in the agent's folder, read with the agent's own file tools (Hermes:
  `search_files`, `read_file`; OpenClaw: its memory folder and `memory_search`; Claude Code: `Bash` and `Read`).
- **wirecat:** one memo store per conversation, one note per session, the `cli-memo` skill, `memo` on `PATH`.
- **Engines:** one bank, workspace, tag or user per conversation, filled before the run. Hermes uses each engine's
  own plugin. Claude Code uses each engine's MCP server with its write tools denied and no other tools.

### Questions

- LoCoMo [`data/locomo10.json`](https://github.com/snap-research/locomo) (sha256 `79fa87e9…a698ff4`), 10
  conversations.
- 50 questions, 5 per conversation, seed 20261123, picked by
  [scripts/post1/scripts/pick_questions.py](scripts/post1/scripts/pick_questions.py): 13 multi-hop, 13 temporal,
  12 open-domain, 12 single-hop. conv-30 has no open-domain question, so it takes two extra questions from other
  categories. The output, `questions-50.json`, has sha256 `d5cea43b…1ff2e3d`. The picker was rerun while this page
  was written and gave the same file byte for byte.
- The category names come from LoCoMo's own scorer: 1 multi-hop, 2 temporal, 3 open-domain, 4 single-hop. Category 5
  (adversarial) is left out, as Mem0's evaluation does.
- [pick_more.py](scripts/post1/scripts/pick_more.py) adds 150 more questions (seed 20261125) for a larger run.
  That run is in progress. This page has no results for it.
- The question and gold-answer text is not in this folder. LoCoMo is CC BY-NC 4.0, so the picker regenerates it
  from the dataset.

### Prompt and judge

- Every agent gets the same prompt: the chat's speakers, where the chat is, the question, and a reply as one JSON
  object with a short answer and the cited sessions
  ([hermes_locomo.py](scripts/post1/harness/hermes_locomo.py), `PROMPT`).
- **Judge:** Mem0's `ACCURACY_PROMPT`, word for word, from
  [mem0ai/mem0 `b3ede5b7` `evaluation/metrics/llm_judge.py`](https://github.com/mem0ai/mem0/blob/b3ede5b7/evaluation/metrics/llm_judge.py).
  It runs on OpenAI gpt-4o-mini at temperature 0 and returns a JSON label
  ([judge.py](scripts/post1/scripts/judge.py)). This is the J score that Mem0, Zep and Hindsight report, not
  LoCoMo's token F1.
- **An empty answer is wrong** and is not sent to the judge. gpt-4o-mini labelled an empty answer CORRECT about 7
  times in 10.
- **A dataset fetch is wrong.** An answer whose agent downloaded the LoCoMo dataset (it holds the gold answers)
  counts as wrong ([net_scan.py](scripts/post1/scripts/net_scan.py)).
- **Cited** counts the questions where the answer cites at least one of LoCoMo's evidence sessions.

### Machine

AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Python 3.14. The machine was loaded during the runs (load average 25
to 65), so the seconds are rough.

## Results

Correct answers out of 50 (out of 20 for V4 Pro). With several runs, each question's score is its mean over the
runs. The 95% interval resamples the questions (bootstrap, 10,000 draws). The paired column compares a setup with
files on the same questions. An interval that does not cross 0 is a significant difference. Mem0 has 1 run, so its
paired difference compares its one run with the mean of files' 3 runs.

### Hermes + DeepSeek Flash, 3 runs of 50

| Setup | Correct (range) | 95% interval | vs files (paired) | Cited | $/run | Median s |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| files | 42.7 (41–45) | 38.3–46.3 | | 44.0 | 0.122 | 12 |
| WireCat | 41.3 (41–42) | 36.0–46.0 | −1.3 (−3.7…+0.7) | 43.0 | 0.179 | 71 |
| Honcho | 39.7 (38–41) | 34.7–44.0 | **−3.0 (−5.7…−0.7)** | 43.3 | 0.162 | 21 |
| Hindsight | 37.7 (35–40) | 32.3–42.7 | **−5.0 (−8.3…−1.7)** | 25.7 | 0.455 | 152 |
| Mem0 (1 run) | 36.0 | 30.0–42.0 | **−6.7 (−12.0…−2.0)** | 6.0 | 0.624 | 80 |
| Supermemory | 8.7 (1–24) | 6.0–11.3 | **−34.0 (−38.3…−29.7)** | 1.3 | 0.323 | 62 |
| no memory, no agent | 0 | 0–0 | | 0 | 0.004 | 1 |

### OpenClaw + DeepSeek Flash, 3 runs of 50 (sandboxed rerun)

| Setup | Correct (range) | 95% interval | vs files (paired) | Cited | $/run | Median s | Dataset fetches |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| files | 41.7 (39–43) | 37.3–45.7 | | 43.3 | 0.312 | 38 | 5 |
| WireCat | 40.7 (39–43) | 35.7–45.3 | −1.0 (−3.3…+1.3) | 44.0 | 0.542 | 73 | 9 |

The dataset fetches are among the 300 answers and are counted wrong, so both rows slightly understate an agent that
does not go online.

### Claude Code + Claude Sonnet 5.5, 1 run of 50

| Setup | Correct | 95% interval | vs files (paired) | Cited | $/run (list price) | Median s |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| files | 42 | 37.0–47.0 | | 44 | 0.897 | 7 |
| WireCat | 42 | 37.0–47.0 | +0.0 (−4.0…+4.0) | 42 | 1.695 | 51 |
| Hindsight | 41 | 35.0–46.0 | −1.0 (−5.0…+2.0) | 42 | 5.058 | 16 |
| Honcho | 40 | 34.0–45.0 | −2.0 (−6.0…+2.0) | 43 | 2.205 | 8 |
| Mem0 | 38 | 32.0–44.0 | −4.0 (−10.0…+1.0) | 41 | 1.684 | 7 |
| Supermemory | 38 | 32.0–44.0 | −4.0 (−10.0…+1.0) | 35 | 2.231 | 11 |
| no memory | 0 | 0–0 | −42.0 (−47.0…−37.0) | 0 | 0.180 | 3 |

### DeepSeek V4 Pro, 1 run of 20

| Agent | Setup | Correct | 95% interval | vs files (paired) | $/run |
| --- | --- | ---: | --- | --- | ---: |
| Hermes | files | 16 | 12.0–19.0 | | 0.272 |
| Hermes | WireCat | 15 | 11.0–19.0 | −1.0 (−4.0…+2.0) | 0.349 |
| Hermes | Honcho | 14 | 10.0–18.0 | −2.0 (−5.0…+0.0) | 0.215 |
| Hermes | Hindsight | 13 | 9.0–17.0 | −3.0 (−6.0…+0.0) | 0.721 |
| Hermes | Mem0 | 13 | 9.0–17.0 | −3.0 (−6.0…+0.0) | 0.348 |
| Hermes | Supermemory | 4 | 1.0–8.0 | **−12.0 (−16.0…−8.0)** | 0.505 |
| OpenClaw | files | 16 | 12.0–19.0 | | 0.144 |
| OpenClaw | WireCat | 16 | 12.0–19.0 | +0.0 (+0.0…+0.0) | 0.242 |

Costs: Hermes's own estimate from its price list, OpenClaw's reported `costUsd`, Claude Code's list price. The judge
cost about $0.0001 per answer. Engine ingestion is not in `$/run`. Hindsight's ingestion was $0.19 for 2
conversations, measured on its server. Its `reflect` tool adds about $0.01 per question on the server.

## What it showed

- **Plain files are a strong baseline on LoCoMo.** No engine beat them in any arm. With Claude Sonnet the engines
  are all within noise of files. With the cheaper DeepSeek Flash in Hermes, three engines fall below files by the
  paired test: Hindsight, Honcho and Mem0.
- **WireCat memo is the one engine that never falls below files.** It ties with files in Hermes, OpenClaw and Claude
  Code, with both DeepSeek models.
- **Citations differ more than answers.** Hindsight and Mem0 answer many questions without citing an evidence session
  (25.7 and 6.0 cited of 50 in Hermes). A likely reason: their tools return extracted facts, not whole sessions.
- **The models do not know LoCoMo by heart.** Both no-memory controls, told to answer only what they already know,
  scored 0. In an earlier check with the same prompt, Claude Sonnet answered 1 of 50 (a conv-26 date) word for
  word, so a question or two on conv-26, a sample many public demos use, may come free to Claude.
- **WireCat is slower here.** Its median is 51–73 s against 7–38 s for files, from the extra `memo` calls.

## Post 3: other models with WireCat

The same Hermes + WireCat arm, only the model changes, through OpenRouter with its data-collection opt-out
(`provider_routing: data_collection: deny`). Runner: [p3run.py](scripts/post3/harness/p3run.py), with the
same prompt, judge and rules. The reference is Hermes + DeepSeek Flash + WireCat from post 1 (41.3, 3 runs).

| Model | Questions | Runs | Correct | 95% interval | vs DeepSeek Flash (paired) | Cost, run 1 |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| `google/gemini-4-neon` | 50 | 1 | 45.0 | 41.0–49.0 | **+3.7 (+0.7…+7.3)** | $5.88 |
| `qwen/qwen4-max` | 50 | 2 | 43.0 (45, 41) | 38.5–47.0 | +1.7 (−2.0…+5.8) | $1.35 |
| `z-ai/glm-5.3` | 50 | 2 | 40.5 (40, 41) | 35.5–45.0 | −0.8 (−4.0…+2.5) | about $0.4–1.35 |
| `moonshotai/kimi-k3.1-pro` | 50 | 1 | 40.0 | 34.0–45.0 | −1.3 (−6.7…+4.0) | $3.31 |
| `x-ai/grok-4.7` | 19 | 1 | 14.0 | 10.0–17.0 | −2.0 (−5.0…+0.3) | $2.87 |

- **Every model used memo's tools without a malformed call.** The harness had 0 errors. Failed shell calls were the
  models' own bad commands, and each recovered: GLM 13, Gemini 10, Qwen 8, Kimi 7, Grok 6.
- **Gemini is above DeepSeek Flash by the paired test**, on one run. Its run-to-run spread is unknown, so treat it as
  likely, not settled.
- **Qwen's lead is noise.** Its first run gave 45, its second 41.
- **Grok is partial.** The runner stops before a chunk that could pass the $15 budget, so Grok stopped at 19 of its
  planned 25 questions. One Grok answer fetched the dataset and counts as wrong.
- Cost of run 1 is OpenRouter's credit change per chunk. That counter lags, so a model's cost shifts a little to its
  neighbour in the run order. GLM's real cost is likely nearer its estimate, $0.39. The second runs of Qwen and GLM
  cost about $1.4 and $0.75 by Hermes's estimate.

## Known issues, found and fixed

- **Empty answers were judged correct.** gpt-4o-mini labelled an empty answer CORRECT about 7 times in 10. The judge
  now marks it wrong without asking. [fix_empty_judged.py](scripts/post1/scripts/fix_empty_judged.py) fixed the
  labels already written: 5 in post 1, 1 in post 3 (Qwen's second run). Every number on this page uses the fix.
  The first post 3 run used a copy of the judge without the rule. This folder's `p3run.py` points at the fixed one.
- **OpenClaw could read the gold answers and past runs.** In the first OpenClaw runs, the agent's tools could reach
  the question files and earlier runs' sessions, and some answers read them. Those runs are not published.
  The published OpenClaw rows come from a sandboxed rerun. Each question runs in bubblewrap over a clean OpenClaw home with no past sessions. The host's home folder
  and every file that holds gold answers are hidden, and one lane runs at a time.
  [iso_owner_check.py](scripts/post1/scripts/iso_owner_check.py) found 0 host paths in any tool call after each lane.
  Against the old runs, Flash lost 1.6 (files) and 2.3 (WireCat) questions, and V4 Pro gained 1 each.
- **Agents fetched the dataset from the internet.** OpenClaw + Flash downloaded LoCoMo from GitHub in 14 of 300
  answers. Grok did it once. Those answers count as wrong. Hermes went online 3 times without reaching the dataset;
  those stay scored.
- **Supermemory's Hermes plugin writes to its store while it answers.** `auto_capture: false` does not stop it: it
  mirrors the agent's built-in memory writes, and the agent called `supermemory-forget` itself. Hermes cannot turn
  off one tool of a plugin. Each run got a fresh store per conversation, but a run still reads a store it changed.
  Its search also returns hits with empty text. This is the plugin's default behaviour, so the row stays as measured.
  It likely explains much of Supermemory's 1–24 range.
- **Other plugins also offer write tools, and the agent sometimes used them.** In Hermes + Flash, 4 of 150 answers
  called `hindsight_retain`, 6 of 150 `honcho_conclude` and 1 of 50 `mem0_update`, into a store shared by all runs.
  The counts per answer are in the `tools` field of the data. A rerun with a fresh store per run is planned.
- **Mem0's free plan ran out of reads.** Every read returned HTTP 429 (1,000 a month). The Mem0 rows ran later with
  bring-your-own-key extraction, so Mem0 has 1 Flash run, not 3.

## Not measured

- **The 150 extension questions.** The picker is here; that run is in progress.
- **Adversarial questions** (LoCoMo category 5).
- **A larger history.** Each conversation fits comfortably in files that grep can search. That favours files.
- **Run-to-run spread** for Claude Code, V4 Pro, Mem0 and three of the post 3 models (1 run each).
- **Judge accuracy.** The labels are not checked by hand yet. The interval counts each label as fixed, so judge
  noise is not in it.
- **Other agents with other engines.** OpenClaw ran only files and WireCat. Post 3 ran only Hermes + WireCat.
- **Tuned engine settings.** Every engine ran with its plugin's or MCP server's defaults. Supermemory's documented
  `search_mode: documents` was not tried.
- **GPT models** and Gemini through Google's own API.

## Files

- [data/post1-answers.jsonl](data/post1-answers.jsonl): 1,760 answers, one per line. Fields: `stage`, `arm`,
  `setup`, `run`, `conversation`, `id`, `category`, `answer`, `label`, `correct`, `network` (`dataset` or `web` when
  the agent went online), `sessions_cited`, `seconds`, `cost_usd`, `tool_calls` (a count) and `tools`. `tools` maps
  each tool name to its count, except in OpenClaw rows: OpenClaw reports only the distinct names, so there it is a
  list. The 4 OpenClaw lanes are stage `full-iso2`, the sandboxed rerun.
- [data/post3-answers.jsonl](data/post3-answers.jsonl): 319 answers, the same fields with `model` and `run` (`r1`,
  `r2`). Run 1 is staged: `s2`, `s5`, then `s50` (or `s25` for Grok) hold the rest of the same run.
- [data/strong-subset-ids.txt](data/strong-subset-ids.txt): the 20 question ids for V4 Pro.
- [scripts/tables.py](scripts/tables.py) prints every interval table above from the two JSONL files. It gave the
  same tables as the run's own output while this page was written.
- [scripts/export_data.py](scripts/export_data.py) makes the JSONL files from a bench folder. It keeps answers,
  labels and counts. It drops tool-call arguments, tool results, session ids and LoCoMo's own text.
- [scripts/post1/](scripts/post1/) and [scripts/post3/](scripts/post3/): the harness and scripts that produced the
  runs. They are the run's own copies with these changes: the bench folders are renamed (and `gold_scan.py`'s
  pattern with them), the owner's home folder is `Path.home()`, the OpenRouter keyring account comes from
  `OPENROUTER_KEYRING_ACCOUNT`, `pick_questions.py` writes `questions-50.json` (it first wrote `questions.json`),
  `openclaw_locomo.py` pins OpenClaw 2026.11.7 itself instead of a changed copy of the shared runner, post 3 points
  at post 1's judge, and some comments are reworded.

Not in this folder: transcripts, logs, the agents' homes and the engines' stores. They hold tool output, and some
hold the gold answers.

## Rerun

The scripts expect fixed folders: `/var/tmp/locomo-bench` for post 1 and `/var/tmp/locomo-bench-p3` for post 3. To
use other folders, change the paths at the top of each script. Every API key is read from the environment or from
the keyring inside the script. Never pass one on the command line.

1. Lay out the bench folder:

   ```sh
   B=/var/tmp/locomo-bench
   mkdir -p $B/locomo-src $B/mem0-eval $B/harness $B/scripts
   curl -sL -o $B/locomo-src/locomo10.json https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json
   curl -sL -o $B/mem0-eval/llm_judge.py https://raw.githubusercontent.com/mem0ai/mem0/b3ede5b7/evaluation/metrics/llm_judge.py
   cp performance/agents/locomo-memory-agents/scripts/post1/harness/*.py $B/harness/
   cp performance/agents/locomo-memory-agents/scripts/post1/scripts/* $B/scripts/
   K=performance/agents/knowledge-graph-memory
   cp $K/hermes_runner.py $K/openclaw_runner.py $K/provider_retrieval.py $K/memo_baseline.py $K/run.py $B/harness/
   cp -r $K/hermes_site $B/harness/
   cp performance/agents/locomo-memory-agents/data/strong-subset-ids.txt $B/
   ```

   The four shared modules come unchanged from [knowledge-graph-memory](../knowledge-graph-memory/README.md).
   `openclaw_locomo.py` sets the OpenClaw version to 2026.11.7 over that runner's older pin.

2. Questions and fixtures: `python3 -I $B/scripts/pick_questions.py`, then `cp $B/questions-50.json
   $B/questions.json` (or run `pick_more.py` for all 200), then `python3 -I $B/scripts/locomo_fixture.py`.
3. Agents: Hermes Agent at `caafe538` in `$B/hermes-agent` with its venv, and the memory plugins with
   `hermes plugins install <name> --yes-deps --enable`. Then `hermes_locomo.py prepare` and `openclaw_locomo.py
   prepare` for each setup.
4. Engines: `hindsight-server.sh start` and `ingest_hindsight.py`; `honcho-server.sh start` and `ingest_honcho.py`;
   `supermemory_set.py` (a fresh tag set per run); `mem0_byok_run.py` (it ingests and runs the Mem0 lanes).
5. Answers: `driver.py --stage full --agent <hermes|claude|deepseek> --setup <setup> --model <model> --run <w1|s1>
   --questions all` from `$B/harness`. For OpenClaw, `iso2_lanes.sh`. `OC_ISO_BASE` should be a clean OpenClaw
   home with no sessions; we expect one right after `prepare` to work, but the script that built it is not here.
6. Score: `summarize.py full` judges every unjudged chunk and prints the totals. Then `net_scan.py`, and
   `export_data.py` and `tables.py` for the intervals.
7. Post 3: in `/var/tmp/locomo-bench-p3`, put `scripts/post3/harness/*` and the shared modules in `harness/`, and
   copy post 1's `questions-50.json` (as `questions.json`), `fixtures/` and prepared `bench/hermes/wirecat`. Hermes
   runs from post 1's `hermes-agent`, and the judge is post 1's. Pin memo to 0.149.0, the version post 1 used, in
   the copied `memo` wrappers. Then run `p3run.py --model <openrouter model> --stage <2|5|50>` with the OpenRouter
   key in the keyring.
