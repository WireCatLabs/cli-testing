# Agent memory trials: Danil Pismenny's design on synthetic Russian rules

Run 2026-11-26 and 2026-11-27. This is a reproduction of the **design** of Danil Pismenny's trials, on our own
synthetic data. It is not a rerun of his test: his scripts, data and raw logs are not published, so his numbers
come from his pages and ours from a different corpus.

- His pages: [agent memory trials](https://pismenny.ru/articles/agent-memory-trials.html) and
  [evaluating agent memory](https://pismenny.ru/articles/evaluating-agent-memory.html).
- Harness: [wcatbench](https://github.com/WireCatLabs/wcatbench), round `rules-trial`, round config
  [configs/rounds/rules-trial.yml](https://github.com/WireCatLabs/wcatbench/blob/92799243d9cde6291b220726ac207c21c93a0d0d/configs/rounds/rules-trial.yml), copied here as [results/round-config.yml](results/round-config.yml).
- Per-check rows and the summary tables: [results/](results/), copied by [collect.py](collect.py).

## Why it was run

Danil published a comparison of agent memory systems in which plain files and OpenViking scored 108 of 108,
AgentMemory 84 and Mem0 50. WireCat memo was not in it. The questions were:

1. Where does memo land in his design, next to the same systems at the same versions?
2. Does his result hold on another corpus, or is it a property of his data?
3. What changes when the agent may search memory itself, as it does in real use, instead of getting one frozen
   top-5 block?
4. How does memo compare with Danil's own memory system, Memory Bank? Added later, at the owner's request.

The answers feed memo's roadmap (supersession of old versions, step 5) and what we may say in public about memo
against these systems. Honesty beats a good-looking result: every losing row is shown.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 370, 59 GB RAM, Linux 7.0.
- **Agent.** Hermes v0.23.4 with gpt-5.6-terra over the `openai-codex` provider (a ChatGPT subscription sign-in in a
  throwaway Hermes home). One model for every variant. Built-in memory off, toolsets `file` and `terminal`. Every
  session runs in bubblewrap: the owner's home, the generator, the answer key and the hidden tests are not mounted.
  A transcript that names any of them makes the session invalid. None did.
- **Data.** Generator `wcatbench.datasets.rules_trial`, seed 20261126, Russian, dataset `rules-trial-36-7f6c06a7`.
  36 sources for one target project (`Сокол`): 8 current rules, similar projects, old revisions, corrections and
  cancelled permissions. Each source opens with a date and author line. 3 tasks, each with 13 known checks and 5
  checks whose rule does not exist (the code must say UNKNOWN). Out of 108 per variant: 78 known and 30 unknown,
  as in his design.
- **Retrieval (his design).** The harness runs the store's search once on the task text, keeps the top 5 within
  2,000 tokens (tiktoken o200k_base, the same counter for every system), freezes the block and puts it in the
  workspace. The agent never calls the store.
- **Scoring.** Stages are reported apart, never summed: stored, retrieved, old version inactive, applied. A known
  check the agent left UNKNOWN is `missed available` when its rule was in the context and `not retrieved` when it
  was not, so a retrieval loss does not read as the agent's loss. Retrieved is counted two ways: the rule's value
  in the context (regex) and the rule's source id among the hits (needed for Mem0 and Hindsight, which rewrite text
  into English facts).
- **Write model.** Systems that extract facts use OpenAI gpt-5-mini, systems that embed through an API use
  text-embedding-3-small. memo uses its local EmbeddingGemma 300M, its default at 0.154.0. The first memo rows ran
  on e5-small, its default before 8 Nov 2026, by mistake. They are kept and labelled **e5-small (not default)**,
  and the reruns are described in [memo on its default model](#memo-on-its-default-model).

| System | Version | Pointed to |
|---|---|---|
| memo | @wirecat/cli-memo 0.154.0 | notes folder plus `sync`, local EmbeddingGemma (default), first rows e5-small |
| AgentMemory | 0.9.30, iii engine 0.22.1 | OpenAI embeddings, no LLM key (zero-LLM mode) |
| Mem0 OSS | mem0ai 2.2.1 | gpt-5-mini, text-embedding-3-small, local Qdrant, telemetry off |
| Hindsight | ghcr.io/vectorize-io/hindsight:1.0.0-slim | gpt-5-mini, OpenAI embeddings, `rrf` reranker |
| OpenViking | 0.4.17.1 | OpenAI embeddings and VLM, rerank off, Agent Evolution off and on |
| files-top5 | SQLite FTS5 | the 36 sources, the same top 5 and token cut |

Variants named `his` follow his design. `files-history`, `files-top5`, `archive-in-workspace`, memo and
`openviking-evo-on` are ours, added to separate storage from retrieval.

Commands, from a wcatbench checkout, with `WCATBENCH_HOME` on a disk with room:

```sh
uv run wcatbench dataset build rules-trial
uv run wcatbench trial contexts <variant> -d rules-trial-36-7f6c06a7 --run e1
uv run wcatbench trial run <variant> -d rules-trial-36-7f6c06a7 --run e1 --design his   # and --design ours
uv run wcatbench trial summary -d rules-trial-36-7f6c06a7 --run e1 --design his
uv run wcatbench trial unrestricted <u-variant> -d rules-trial-36-7f6c06a7 --run e1 --design his
uv run wcatbench trial dialogue <variant> -d rules-trial-36-7f6c06a7 --run e1 --reps 2
uv run wcatbench trial corrections <store> --run e1
python3 collect.py
```

## Experiment 1, his design: his numbers next to ours

3 tasks x 2 applications = 6 fresh sessions per variant. Applied is out of 78 known checks, unknown out of 30.

| Variant | His total (of 108) | Our total (of 108) | Our applied (known) | Our unknown | Wrong concrete |
|---|---:|---:|---:|---:|---:|
| none | 30 | 30 | 0/78 | 30/30 | 0 |
| files-his (all 8 rules in a file) | 108 | 108 | 78/78 | 30/30 | 0 |
| files-history (ours: rules plus old versions) | not run | 108 | 78/78 | 30/30 | 0 |
| archive-in-workspace (ours: 36 sources to grep) | not run | 108 | 78/78 | 30/30 | 0 |
| memory-bank (his own memory: files the agent greps, no top 5, compare with archive-in-workspace) | not run | 108 | 78/78 | 30/30 | 0 |
| memory-bank-files (ours: its 27 written files whole, no top 5) | not run | 108 | 78/78 | 30/30 | 0 |
| files-top5 (ours: the same files through top 5) | not run | 58 | 28/78 | 30/30 | 6 |
| OpenViking, Agent Evolution off | 108 | 74 | 44/78 | 30/30 | 4 |
| OpenViking, Agent Evolution on (ours) | not run | 84 | 54/78 | 30/30 | 4 |
| AgentMemory | 84 | 74 | 44/78 | 30/30 | 4 |
| Mem0 OSS | 50 | 84 | 54/78 | 30/30 | 4 |
| Hindsight slim | not ranked (failed his pre-check) | 64 | 34/78 | 30/30 | 0 |
| memo, EmbeddingGemma (ours, default) | not run | 76 | 46/78 | 30/30 | 0 |
| memo, e5-small (ours, not default) | not run | 60 | 30/78 | 30/30 | 4 |

Every variant declined all 30 unknown checks, as in his table, so the unknown column does not separate systems.
The known checks do.

### All stages, his design

`Retrieved` is by source id. `Old inactive` counts known checks whose rule has an older version, out of 48: the
old version must not be in the context. `Not retrieved` are known checks left UNKNOWN because the rule was not in
the top 5.

| Variant | Stored | Retrieved | Old inactive | Applied | Missed available | Not retrieved | Wrong | Agent tokens in/out | Tool calls |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| files-top5 | 78/78 | 28/78 | 22/48 | 28/78 | 0 | 44 | 6 | 172,489/7,677 | 52 |
| memo, EmbeddingGemma | 78/78 | 48/78 | 16/48 | 46/78 | 2 | 30 | 0 | 206,907/8,851 | 54 |
| memo, e5-small (not default) | 78/78 | 32/78 | 12/48 | 30/78 | 2 | 42 | 4 | 182,362/7,942 | 53 |
| agentmemory | 78/78 | 46/78 | 12/48 | 44/78 | 2 | 28 | 4 | 156,837/6,888 | 47 |
| mem0-oss | 66/78 | 54/78 | 12/48 | 54/78 | 0 | 20 | 4 | 163,392/7,046 | 49 |
| hindsight-slim | 68/78 | 36/78 | 12/48 | 34/78 | 2 | 42 | 0 | 174,139/8,469 | 51 |
| openviking-evo-off | 78/78 | 46/78 | 12/48 | 44/78 | 2 | 28 | 4 | 210,041/9,410 | 55 |
| openviking-evo-on | 78/78 | 56/78 | 12/48 | 54/78 | 2 | 18 | 4 | 174,934/8,366 | 52 |

Mem0 and Hindsight store fewer rules (66 and 68 of 78): their extraction drops or merges some. The files variants
have no store, so their stages are n/a. Full tables with the regex columns, seconds and every variant:
[results/e1-his.md](results/e1-his.md).

### Ours design: two more phrasings per task

The same 3 tasks asked in two other wordings (p1, p2), one application each, 6 sessions per variant. Each wording
draws its own top 5, so this shows how much one frozen search depends on the words of the task.

| Variant | Applied (known) | Unknown | Total (of 108) | Retrieved | Not retrieved | Wrong |
|---|---:|---:|---:|---:|---:|---:|
| files-top5 | 36/78 | 30/30 | 66 | 36/78 | 37 | 5 |
| memo, EmbeddingGemma | 61/78 | 30/30 | 91 | 61/78 | 15 | 2 |
| memo, e5-small (not default) | 52/78 | 30/30 | 82 | 52/78 | 20 | 6 |
| agentmemory | 46/78 | 30/30 | 76 | 47/78 | 27 | 4 |
| mem0-oss | 58/78 | 30/30 | 88 | 58/78 | 12 | 8 |
| hindsight-slim | 26/78 | 30/30 | 56 | 27/78 | 46 | 5 |
| openviking-evo-off | 57/78 | 30/30 | 87 | 57/78 | 19 | 2 |
| openviking-evo-on | 54/78 | 30/30 | 84 | 54/78 | 19 | 5 |

memo on EmbeddingGemma moves from 46 to 61 applied between wordings (on e5-small from 30 to 52). Every other engine moves too. The ranking between engines is
not stable across wordings of the same task.

## Pre-fix and fixed rows

Two adapters were wrong at first. Both were fixed, the sessions rerun, and both rows are kept.

| Variant | Design | Pre-fix applied | Fixed applied | Pre-fix total | Fixed total |
|---|---|---:|---:|---:|---:|
| memo, e5-small (not default) | his | 34/78 | 30/78 | 64 | 60 |
| OpenViking, evo off | his | 36/78 | 44/78 | 66 | 74 |
| OpenViking, evo on | his | 32/78 | 54/78 | 62 | 84 |
| OpenViking, evo off | ours | 43/78 | 57/78 | 73 | 87 |
| OpenViking, evo on | ours | 46/78 | 54/78 | 76 | 84 |

- **memo.** After the date and author line was added to every source, memo titled notes from that line
  (`2026-03-02-Ирина-Козлова-Сокол`), and its search excerpt dropped the first line, so hits lost the author. Fixed:
  titles come from the text after the line, and a hit is the whole note. The fix did not help in his design (34 to
  30, within the spread between wordings). memo ours ran only after the fix.
- **OpenViking.** OpenViking stores each record as a folder with an abstract (L0), an overview (L1) and the record
  (L2), and `find` ranks the three apart. In the first contexts 19 of 43 hits were a summary without the record.
  Fixed: the adapter asks for 20 hits, folds the levels into distinct records and reads each record file.
- Pre-fix tables: [results/e1-his-prefix.md](results/e1-his-prefix.md) and
  [results/e1-ours-prefix.md](results/e1-ours-prefix.md).

## Adapter audit

For each engine we compared what the store holds with what the frozen context hands the agent: lost fields, cut
text, wrong titles, dropped dates or authors, wrong project scoping.

| Engine | Verdict | Evidence |
|---|---|---|
| files-top5 | fine | every hit is the whole source with its date and author line |
| AgentMemory | fine | every hit is the whole record with date |
| Mem0 OSS | system behaviour, not an adapter bug | it rewrites each source into English facts and keeps the date in the text. It takes no timestamp in OSS 2.2.1 (platform only), which is why every source carries a date line |
| Hindsight slim | fine | hits carry the fact plus `When` and `Involving` |
| OpenViking | fixed | level folding, above |
| memo | fixed | titles and whole-note hits, above |

## Why one frozen top-5 search caps every engine

Each task needs 3 or 4 current sources (11 over the 3 tasks), which would fit in 5 places. But the corpus is
built so that look-alike projects and old versions share words with the task. One search on the task's first
paragraph then fills the 5 places with a mix. Count of the 11 needed sources that reached the frozen top 5, and of
old versions that took a place, per wording:

| Engine | p0 needed | p0 old | p1 needed | p1 old | p2 needed | p2 old |
|---|---:|---:|---:|---:|---:|---:|
| files-top5 | 2/11 | 3 | 2/11 | 5 | 5/11 | 2 |
| memo, EmbeddingGemma | 5/11 | 3 | 6/11 | 3 | 7/11 | 4 |
| memo, e5-small (not default) | 3/11 | 4 | 6/11 | 3 | 4/11 | 4 |
| AgentMemory | 5/11 | 4 | 4/11 | 5 | 6/11 | 5 |
| Mem0 OSS | 5/11 | 4 | 5/11 | 5 | 6/11 | 5 |
| Hindsight slim | 4/11 | 4 | 1/11 | 2 | 4/11 | 3 |
| OpenViking, evo off | 6/11 | 4 | 6/11 | 5 | 7/11 | 5 |
| OpenViking, evo on | 6/11 | 4 | 6/11 | 5 | 5/11 | 5 |

What it shows:

- **The store is not the limit.** files-top5 holds all 36 sources, the same text the files-his variant gets in
  full. Through one top-5 search it applies 28 of 78. Given the same rules as a file, the agent applies 78 of 78.
  The 50-check gap is retrieval alone.
- **The agent is not the limit either.** Across all engines only 0 to 2 known checks per variant are `missed
  available`: when the rule is in the context, the agent uses it. Almost every loss is `not retrieved`.
- **So in this design an engine's score is mostly the recall of one search on one wording.** No engine reached
  more than 7 of 11 needed sources in any wording. Old versions took 2 to 5 of the 15 places per wording, which
  is why `old inactive` is low everywhere.
- His corpus may make one search enough (his files and OpenViking both at 108). Ours does not. That, more than the
  engines, is the likely reason his OpenViking row is 108 and ours 74 to 87. This is an interpretation: his data is
  not published, so it cannot be checked.

## Ours, unrestricted: the agent searches memory itself

His design hands the agent one frozen block. In real use the agent calls the memory tool itself, as often as it
likes. These rows lift that restriction and keep everything else: the same corpus, tasks, checks, agent and model.

- **One generic strategy prompt** (six steps, Russian): list the values the task needs, search for each one in
  several wordings and in both languages, read whole records, keep only records of exactly this project, take the
  latest decision on each value (a cancellation is a decision), treat discussion without a decision as UNKNOWN, and
  check each value with one more search before writing code. It names no file, record, value or project.
- **The same prompt for every engine**, plus one line naming its tool. `u-archive` greps the 36 sources as files.
  `u-memo` uses the memo CLI and is told to read `memo skill show` first: memo's own skill counts as the product.
  Every other engine gets a thin `search '<query>' [--k N]` command (up to 20 whole records) that calls the
  engine's own search through a local proxy, so no API key enters the sandbox.
- **Tuned on a separate dev set only.** `rules-trial-dev`: generator seed 20261127, the same target project, look-alike
  project and people as the test set, but a new task (cache and queue policy) and new rules and values. Task d1 has
  7 known and 2 unknown checks. Version 1 of the prompt scored 7/7 and 2/2 in all 4 dev sessions on `u-archive`,
  `u-memo` and `u-files-top5`, so it was frozen with no revision and then run once on the test tasks. It is
  recorded in the round config (`STRATEGY_VERSION` 1).
- **Where the prompt came from.** It was written by the author of the test corpus after the experiment 1 results
  were known. The dev set only confirmed it, it did not shape it. Read the unrestricted rows with that in mind.
- Labelled **ours, unrestricted**, apart from his design. His design rows above are unchanged.

| Variant | Applied (known) | Unknown | Wrong | Seconds (6 sessions) | Agent tokens in/out | Tool calls | Memory searches per session |
|---|---:|---:|---:|---:|---:|---:|---|
| u-archive (grep over files) | 78/78 | 30/30 | 0 | 639 | 445,187/18,394 | 273 | 21 to 25 grep calls |
| u-memory-bank (grep over the bank) | 78/78 | 30/30 | 0 | 761 | 1,414,514/25,169 | 306 | 17 to 45 search_files calls |
| u-memo, EmbeddingGemma | 78/78 | 30/30 | 0 | 927 | 1,600,075/18,683 | 207 | see note |
| u-memo, e5-small (not default) | 78/78 | 30/30 | 0 | 972 | 1,498,008/17,062 | 165 | see note |
| u-files-top5 (FTS) | 77/78 | 30/30 | 1 | 639 | 856,075/15,745 | 106 | 25 to 74 |
| u-agentmemory | 78/78 | 30/30 | 0 | 700 | 1,147,490/16,011 | 123 | 24 to 60 |
| u-mem0-oss | 78/78 | 30/30 | 0 | 821 | 811,717/14,630 | 92 | 14 to 40 |
| u-hindsight-slim | 78/78 | 30/30 | 0 | 575 | 1,161,488/16,265 | 97 | 20 to 47 |
| u-openviking-evo-off | 78/78 | 30/30 | 0 | 2,170 | 926,377/15,346 | 98 | 15 to 43 |
| u-openviking-evo-on | 78/78 | 30/30 | 0 | 2,213 | 1,401,433/15,640 | 109 | 20 to 58 |

- **Every engine reaches the ceiling.** The one loss is files-top5 writing the old 30-second timeout once. Mem0 and
  Hindsight store fewer rules by our regex (66 and 68 of 78), but the agent still found every value. The likely
  reason: the regex misses some of their English rewrites, and the agent does not.
- **So unrestricted rows do not separate engines on this corpus, the cost does.** grep over files used the fewest
  input tokens (445K for 6 sessions) and memo the most (1.6M on EmbeddingGemma, 1.5M on e5-small). Agent input
  tokens add up the whole conversation at
  every turn, so long tool outputs early in a session cost again at each later turn. memo's `search --json` output
  is the most verbose of the tools (928K characters of tool output over 6 sessions, against 131K for grep).
- OpenViking sessions ran about three times longer than the others. Per-query search time was not recorded, so the
  cause is likely, not measured: its search plus reading each record file.
- `Old version inactive` is not shown: the agent reads old versions on purpose to find the latest one, so the stage
  does not apply when the agent searches itself.
- memo search counts are not comparable: the agent often ran memo searches in a shell loop, which counts as one
  call. Tool calls are comparable across rows.
- Per-check rows: [results/e1-unrestricted.csv](results/e1-unrestricted.csv), table
  [results/e1-unrestricted.md](results/e1-unrestricted.md).

## Experiment 2: rules learned from a conversation

His experiment 2 teaches rules in conversation instead of handing them over. Ours follows his shape on two
synthetic scenarios: `w` (webhook delivery) and `r` (reports). Each chain has three sessions, each a fresh Hermes
session on the clean project:

- **A** gives the rules in the lead's messages, then a correction of one of them.
- **B** continues from memory and gets a change that cancels an exception.
- **C** gets no transcript at all: only memory carries the rules.

Transfer checks are rules from an earlier session that a later one must still apply. `Old version kept out`
counts checks in B and C whose rule was corrected or cancelled: the old version must not come back. 2 scenarios x
2 independent chains = 12 sessions per variant (his: 2 scenarios x 3 sessions per variant, one chain each).

| Variant | Transfer checks applied | Old version kept out (B, C) | Known in A | Unknown correct | Wrong | Broken | Agent tokens in/out |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 6/48 | 4/16 | 24/24 | 28/28 | 0 | 4 | 351,943/11,716 |
| files-agent (his Markdown) | 46/48 | 16/16 | 23/24 | 28/28 | 3 | 0 | 381,703/13,912 |
| memo-agent, EmbeddingGemma | 48/48 | 16/16 | 24/24 | 28/28 | 0 | 0 | 462,187/15,998 |
| memo-transcript, EmbeddingGemma | 48/48 | 16/16 | 24/24 | 28/28 | 0 | 0 | 316,719/9,278 |
| memo-agent, e5-small (not default) | 48/48 | 16/16 | 24/24 | 28/28 | 0 | 0 | 418,543/14,354 |
| memo-transcript, e5-small (not default) | 48/48 | 16/16 | 24/24 | 28/28 | 0 | 0 | 320,701/9,252 |
| OpenViking, evo off | 44/48 | 15/16 | 24/24 | 28/28 | 0 | 0 | 320,104/9,540 |
| OpenViking, evo on | 46/48 | 15/16 | 24/24 | 28/28 | 1 | 0 | 342,778/9,205 |
| memory-bank-agent (his Memory Bank) | 48/48 | 16/16 | 24/24 | 28/28 | 0 | 0 | 1,801,814/34,602 |

- `none` keeps no memory between sessions. It still passes 6 of 48 transfer checks, because the B sessions restate
  part of the context. Treat 6 as the floor.
- `files-agent`: the agent's own `memory/NOTES.md`, read at the start and written at the end (his Markdown
  variant). Its three losses are one chain: in A the agent wrote four retry pauses (`1, 5, 30, UNKNOWN`) where the
  lead gave three, and that note carried into B and C. Five attempts do imply four pauses, so this check is
  arguably ambiguous in our scenario.
- `memo-agent`: the agent reads memo at the start and writes notes at the end with the memo CLI.
- `memo-transcript`: nobody writes notes. The harness stores each finished conversation in memo, and the next
  session gets memo's top 5 for its task, frozen, like his retrieval variants.
- His Markdown variant scored 114 of 114 transfer checks. Our files-agent scored 46 of 48 and both memo variants
  48 of 48. Different scenarios, so only the direction compares.
- OpenViking (his third variant): each finished conversation is committed as an OpenViking session, which extracts
  memories with gpt-5-mini. The next session gets OpenViking's top 5 for its task, frozen. It lost 4 checks in one
  chain: the memory extracted from session B was a summary card that listed the earlier values as unknown, and
  session C followed the card. With Agent Evolution on it lost 2 (one old value, 365, came back).
- OpenViking needed two fixes before it ran, both kept apart in /var/tmp/wcat-dapi/superseded-e2-ov-loop: in
  0.4.17.1 the SDK client's `commit_session` runs on a different event loop from its other calls and fails, and our
  worker read the task status from the wrong field, so one commit waited 20 minutes for nothing. One earlier try
  also hit a 10-minute model timeout inside OpenViking's extraction. The rows above are from the clean reruns.
- Full table: [results/e2.md](results/e2.md).

## Danil's own memory: Memory Bank

Added on 2026-11-27 at the owner's request, after every other row had run, for a public comparison of memo with
Danil's own system. [dapi/memory-bank](https://github.com/dapi/memory-bank) at commit
[e1b428d](https://github.com/dapi/memory-bank/tree/e1b428dd7aed66eda99b3cbc6073c29f7da921de) (2026-09-13). Same
harness, agent, model, dataset, seeds and session counts as the rows above. No API spend: no model call outside the
agent.

To reproduce: `git clone https://github.com/dapi/memory-bank`, `git -C memory-bank checkout e1b428d`, and set
`WCATBENCH_MEMORY_BANK` to the clone before the wcatbench commands above, with the variants `memory-bank`,
`memory-bank-files`, `u-memory-bank` and `memory-bank-agent`.

**How it was installed.** As its README says: `template/memory-bank/` became `memory-bank/` and `template/init.sh`
became `./init.sh`, byte for byte. The root `AGENTS.md` got the routing block that memory-bank-cli writes, copied
from [docs/agent-instructions.md](https://github.com/dapi/memory-bank/blob/e1b428dd7aed66eda99b3cbc6073c29f7da921de/docs/agent-instructions.md):
read `memory-bank/README.md`, `dna/README.md` and `flows/routing.md` before substantial work. Hermes loads
`AGENTS.md` into its system prompt, checked in a session's stored system prompt. The install refuses a clone at
another commit.

**How the 36 sources were written into it (experiment 1).** His
[brownfield protocol](https://github.com/dapi/memory-bank/blob/e1b428dd7aed66eda99b3cbc6073c29f7da921de/docs/brownfield-adaptation-protocol.md)
says how existing project sources enter the bank: historical ADRs for decisions already taken (step 6), and an
intake document outside `memory-bank/` for the rest (step 2). `adr/README.md` says the ADR folder holds only real
decision records, not notes. So:

- The 26 decisions became 26 ADRs from his ADR template's frontmatter (`status: active`,
  `decision_status: accepted`, the date and author as decision maker), with the source text as the decision.
- The 5 chats, 4 notes and 1 meeting stayed as evidence in `brownfield-intake-prd.md` at the workspace root, each
  with its type, date and author.
- No ADR is marked `superseded`. Linking a correction to the decision it replaces is the exact answer the test
  checks, and no other store got that done for it. Every store got the raw records, so the bank got them raw too.

| Variant | Applied (known) | Unknown | Wrong | Seconds (6 sessions) | Agent tokens in/out | Tool calls |
|---|---:|---:|---:|---:|---:|---:|
| files-his (8 rules in one file, his) | 78/78 | 30/30 | 0 | 381 | 171,093/8,311 | 51 |
| archive-in-workspace (36 sources to grep, ours) | 78/78 | 30/30 | 0 | 603 | 378,820/13,500 | 150 |
| memory-bank, his design (the bank in the workspace) | 78/78 | 30/30 | 0 | 611 | 1,234,506/19,190 | 218 |
| memory-bank-files (its 27 written files whole in `memory/context.md`) | 78/78 | 30/30 | 0 | 311 | 392,775/8,909 | 52 |
| u-memory-bank (unrestricted, frozen strategy v1) | 78/78 | 30/30 | 0 | 761 | 1,414,514/25,169 | 306 |
| u-memo, EmbeddingGemma (unrestricted, for reference) | 78/78 | 30/30 | 0 | 927 | 1,600,075/18,683 | 207 |

- **Every Memory Bank row applies 78 of 78 and declines all 30 unknown checks.** So does every control that puts
  all 36 sources in reach of the agent. The bank is files the agent greps, like `archive-in-workspace`. It is not
  a top-5 search engine, so his design's frozen block does not apply to it, and its row compares with the file
  controls, not with Mem0, OpenViking or memo in his design.
- **The extra cost is most likely the template.** Its `memory-bank/` holds 103 Markdown files, 64,913 words,
  117,621 tokens (o200k_base). The 26 ADRs and the intake file add 6,561 tokens, and the `AGENTS.md` block 67.
  Sessions opened 4 to 16 template files each. Over the 6 sessions, reads of template files returned 87,090 tokens
  of tool output, reads of the ADRs and intake file 22,970, and searches over whole folders 78,834 (those mix
  both). Each turn sends the whole conversation again, so early reads cost again at every later turn. In his
  design the bank used 3.3 times the input tokens of the same sources as plain files (1.23M against 379K).
- **Unrestricted, the bank costs about what memo costs** (1.41M against 1.60M input tokens), with more tool calls
  (306 against 207). The strategy prompt was not retuned for it.
- **The whole-files control gets the full score at 393K**, about what grep over the 36 sources costs (379K): the
  27 written files, without the template, in one context file. It shows the information was all there, and the
  extra tokens in the bank row are the reading the bank's rules ask for. The cheapest full score on the page is
  still files-his, the 8 current rules in one file, at 171K.

**Experiment 2, the agent keeps the bank itself.** Each chain starts with a clean install. The note says the bank is
the agent's memory between conversations, that `AGENTS.md` says how to use it, and to save what helps later by its
rules (the same shape as the files-agent and memo-agent notes). The bank and `AGENTS.md` carry from session to
session, as a repository would keep them.

- 48 of 48 transfer checks and 16 of 16 old versions kept out, with no wrong answer, like memo-agent and
  memo-transcript. files-agent scored 46.
- In all 4 chains the agent kept the rules in one place, `domain/rules.md`, his owner for business rules, rewriting
  the template's placeholder tables into a policy row per rule. It created no ADR, feature pack or research package.
- Each session opened 10 to 17 template files, which returned 176,670 tokens of tool output over 12 sessions
  (folder searches 52,061 more). Input tokens were 1.80M for 12 sessions, against 462K for memo-agent
  and 382K for files-agent: about 3.9 times memo-agent.

**Experiment 3 was not run for it, because it does not map fairly.** The gate writes three versions of each rule into
a store and checks, with no agent, which version the store's own search returns. The bank has no write path and no
search of its own: the agent reads files.

- An edit in place plus grep is the `fts` row (43 of 44), so it would add nothing.
- Writing each version as a new ADR leaves "which one is current" to whoever sets `superseded`. That is curation
  by a person or an agent, which experiment 2 already tests (16 of 16 old versions kept out).

**What is not fair or not comparable.**

- The source mapping is ours. His protocol expects an agent to study the repository and adapt the bank from
  evidence. We wrote the sources mechanically, so a real adoption may differ, most of all in whether it marks
  superseded ADRs.
- His README runs the bank with the Codex CLI. Here it runs in Hermes on the same model as every other row.
- Memory Bank is a development process system (governance, routing, feature packs), not a store of facts from
  messages. This corpus tests only the part that keeps project rules. Its processes are not measured.
- Danil wrote both the trial design and the bank. His pages do not test Memory Bank (checked 2026-11-27), so
  there is no number of his to set beside it. Every row here is run by us on our corpus.
- Per-check rows: [results/e1-his-memory-bank.csv](results/e1-his-memory-bank.csv) and
  [results/e1-unrestricted-memory-bank.csv](results/e1-unrestricted-memory-bank.csv). Tables:
  [results/e1-his-memory-bank.md](results/e1-his-memory-bank.md),
  [results/e1-unrestricted-memory-bank.md](results/e1-unrestricted-memory-bank.md) and
  [results/e2-memory-bank.md](results/e2-memory-bank.md). Template size and files read per session:
  [results/memory-bank-cost.json](results/memory-bank-cost.json).

## Experiment 3: the corrections gate (no agent)

11 rules, each written in three versions (the third is current, some versions revoke a permission). Every store
gets the versions in order, the way it takes an update: document stores (fts, memo, OpenViking, Hindsight) an edit
of the same document, statement stores (Mem0, AgentMemory) a new statement per version. Hindsight's queue is waited
out (three quiet polls) before the next version. Then 4 checks per rule, 44 in all: the current version is stored,
the old versions are gone from the store, the current version is in the top 5 of the rule's question, and no old
version is in that top 5.

| Store | Gate (44/44) | Passed | Stored current | Old gone from store | Retrieved current | Old absent from top 5 |
|---|---|---:|---:|---:|---:|---:|
| fts | fail | 43/44 | 11/11 | 11/11 | 10/11 | 11/11 |
| memo, EmbeddingGemma | pass | 44/44 | 11/11 | 11/11 | 11/11 | 11/11 |
| memo, e5-small (not default) | pass | 44/44 | 11/11 | 11/11 | 11/11 | 11/11 |
| AgentMemory | fail | 22/44 | 11/11 | 0/11 | 11/11 | 0/11 |
| Mem0 OSS | fail | 22/44 | 11/11 | 0/11 | 11/11 | 0/11 |
| Hindsight slim | pass | 44/44 | 11/11 | 11/11 | 11/11 | 11/11 |
| OpenViking, evo off | pass | 44/44 | 11/11 | 11/11 | 11/11 | 11/11 |
| OpenViking, evo on | pass | 44/44 | 11/11 | 11/11 | 11/11 | 11/11 |

- His OpenViking gate scored 36 and 42 of 44. Ours passes 44 of 44 on our rules.
- **memo passes because a corrected note replaces the old text.** It has no supersession between two separate
  notes yet: experiment 1 feeds old versions as separate sources, and there memo's `old inactive` is 16 of 48 on EmbeddingGemma
  (12 on e5-small).
- AgentMemory (zero-LLM mode) and Mem0 keep every version as its own statement and return them side by side. Mem0
  did not merge the versions into one fact on our data.
- Two first runs were wrong and are kept apart: a Hindsight run read before its queue finished (2 of 44), and a
  pattern set that was Russian only and failed a correct Hindsight paraphrase and Mem0's English text. The gate now
  scores from the saved store text and hits, so a pattern fix needs no rebuild.

## memo on its default model

The post review found that the first memo rows ran on e5-small. The default of the pinned @wirecat/cli-memo 0.154.0
is EmbeddingGemma 300M: `DEFAULT_TEXT_MODEL = "embeddinggemma"` in its cli-core 1.1.0
(`dist/embeddings/models.js`, line 128), its README says to download `embeddinggemma` for search by meaning, and
`memo models list` marks it `default: true`. e5-small was the default before 8 Nov 2026. So every memo row was rerun
on EmbeddingGemma on 2026-11-27: experiment 1 in all 3 wordings, u-memo with the frozen strategy v1, memo-agent and
memo-transcript, and the experiment 3 gate. Same dataset, seeds, prompts and session counts. The e5-small rows stay,
labelled **e5-small (not default)**. Embeddings run locally, so the reruns cost $0.

| Row | e5-small (not default) | EmbeddingGemma (default) |
|---|---:|---:|
| Experiment 1, his design, applied (total of 108) | 30/78 (60) | 46/78 (76) |
| Experiment 1, his design, wrong concrete | 4 | 0 |
| Experiment 1, his design, retrieved / old inactive | 32/78, 12/48 | 48/78, 16/48 |
| Experiment 1, ours design, applied (total of 108) | 52/78 (82) | 61/78 (91) |
| Unrestricted u-memo, applied / tokens in / tool calls | 78/78, 1.50M, 165 | 78/78, 1.60M, 207 |
| Experiment 2, memo-agent transfer / tokens in | 48/48, 419K | 48/48, 462K |
| Experiment 2, memo-transcript transfer / tokens in | 48/48, 321K | 48/48, 317K |
| Experiment 3, gate | 44/44 | 44/44 |

What changed in the reading:

- **In his design memo moves from the bottom group to the middle**: above AgentMemory and OpenViking with evo off
  (44), Hindsight (34) and files-top5 (28), below Mem0 and OpenViking with evo on (54). In the two other wordings it
  is first (61, against 57 and 58). The frozen top 5 is still the limit: 30 of its 32 losses are rules that never
  reached the top 5.
- **With the agent searching, nothing changes in answers**: 78 of 78 either way, at a little more cost (1.60M input
  tokens and 207 tool calls on EmbeddingGemma).
- **Across sessions and in the corrections gate, nothing changes**: 48 of 48 and 44 of 44 on both models.
- **The supersession gap is still there.** The cancelled e-mail permission beat its cancellation in one wording
  (t2.p1, 2 wrong concrete).

A second fault turned up in the rerun. The store build ran the `memo` on the machine's PATH, not the pinned
install. That was 0.154.0 when the first rows ran (store schema 76, checked in the kept builds), and is 0.156.0
now (schema 78), which the pinned 0.154.0 in the unrestricted sandbox cannot read: every u-memo search failed and
all 6 sessions applied 0. The harness now always runs the pinned install. Everything was rerun on it, and the
0.156.0 data is kept apart. Its frozen top 5 was the same as 0.154.0's in every context compared.

Tables: [his design](results/e1-his-memo-embeddinggemma.md), [ours design](results/e1-ours-memo-embeddinggemma.md),
[unrestricted](results/e1-unrestricted-memo-embeddinggemma.md), [experiment 2](results/e2-memo-embeddinggemma.md) and
[experiment 3](results/e3-memo-embeddinggemma.md), with per-check CSV rows beside them.

### Top-5 slot counts, every engine

What fills the 45 places of the frozen top 5 (3 tasks x 3 wordings x 5 hits), counted by each hit's first source:
`needed` is a source the task's checks rest on, `old_on` an older version of a rule the task needs, `old_off` an
older version of another task's rule, `other_target` another source of the target project, `lite` and `sapsan` the
look-alike projects, `company` the company-wide notes. Script: [slots.py](slots.py), first written for the post
review. Output: [results/slots.md](results/slots.md) and [results/slots.json](results/slots.json).

| Engine | needed | old_on | old_off | other_target | lite | sapsan | company | needed by wording (p0, p1, p2) |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| files-top5 | 9 | 10 | 1 | 2 | 14 | 6 | 3 | 2, 2, 5 |
| memo, EmbeddingGemma (default) | 18 | 10 | 1 | 0 | 14 | 2 | 0 | 5, 6, 7 |
| memo, e5-small (not default) | 13 | 11 | 2 | 2 | 16 | 1 | 0 | 3, 6, 4 |
| agentmemory | 15 | 14 | 2 | 1 | 11 | 2 | 0 | 5, 4, 6 |
| mem0-oss | 16 | 14 | 0 | 0 | 12 | 3 | 0 | 5, 5, 6 |
| hindsight-slim | 9 | 10 | 2 | 2 | 16 | 6 | 0 | 4, 1, 4 |
| openviking-evo-off | 19 | 14 | 1 | 0 | 9 | 2 | 0 | 6, 6, 7 |
| openviking-evo-on | 17 | 14 | 1 | 0 | 10 | 3 | 0 | 6, 6, 5 |

- memo on EmbeddingGemma puts 18 needed sources in its 45 places, against 13 on e5-small. Only OpenViking with evo
  off (19) puts more. Every engine still gives 10 to 14 places to old versions of the task's own rules.
- The look-alike project Сокол-Лайт takes 9 to 16 places in every engine. That is the corpus doing its job: one
  search on the task text cannot tell the two projects apart.

## Every losing row for memo

The rows below are memo on **e5-small (not default)**. On EmbeddingGemma memo lost 32 known checks in his design (30
not retrieved, 2 missed available on rule R1) and 17 in ours (15 not retrieved, 2 wrong concrete: the cancelled
e-mail permission R7 in t2.p1). Per-check rows:
[results/e1-his-memo-embeddinggemma.csv](results/e1-his-memo-embeddinggemma.csv) and
[results/e1-ours-memo-embeddinggemma.csv](results/e1-ours-memo-embeddinggemma.csv).

memo lost no unknown check. Every known check it did not apply, with the rule's source in or out of the top 5:

<details>
<summary>His design, memo fixed: 48 rows</summary>

| Session | Check | Rule | Agent wrote | Rule's source in top 5 | Outcome |
|---|---|---|---|---|---|
| t1.p0.a1 | t1.k02 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k03 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k04 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k05 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k06 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k07 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k08 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k09 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k10 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k11 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k12 | R1 | `UnknownRule` | yes | missed_available |
| t1.p0.a1 | t1.k13 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k02 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k03 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k04 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k05 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k06 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k07 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k08 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k09 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k10 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k11 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k12 | R1 | `UnknownRule` | yes | missed_available |
| t1.p0.a2 | t1.k13 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k06 | R6 | `UNKNOWN` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k07 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k08 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k09 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k10 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k11 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k12 | R7 | `'ivan.petrov@mail.example'` | no | wrong_concrete |
| t2.p0.a1 | t2.k13 | R7 | `True` | no | wrong_concrete |
| t2.p0.a2 | t2.k06 | R6 | `UNKNOWN` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k07 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k08 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k09 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k10 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k11 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k12 | R7 | `'ivan.petrov@mail.example'` | no | wrong_concrete |
| t2.p0.a2 | t2.k13 | R7 | `True` | no | wrong_concrete |
| t3.p0.a1 | t3.k10 | R1 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p0.a1 | t3.k11 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p0.a1 | t3.k12 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p0.a1 | t3.k13 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k10 | R1 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k11 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k12 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k13 | R4 | `UnknownRule` | no | abstained_not_retrieved |

</details>

<details>
<summary>Ours design (phrasings p1 and p2), memo fixed: 26 rows</summary>

| Session | Check | Rule | Agent wrote | Rule's source in top 5 | Outcome |
|---|---|---|---|---|---|
| t1.p1.a1 | t1.k09 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p1.a1 | t1.k10 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p1.a1 | t1.k11 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p2.a1 | t1.k01 | R1 | `30` | no | wrong_concrete |
| t1.p2.a1 | t1.k06 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p2.a1 | t1.k07 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p2.a1 | t1.k08 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p2.a1 | t1.k12 | R1 | `30` | no | wrong_concrete |
| t2.p1.a1 | t2.k12 | R7 | `'ivan.petrov@mail.example'` | no | wrong_concrete |
| t2.p1.a1 | t2.k13 | R7 | `True` | no | wrong_concrete |
| t2.p2.a1 | t2.k06 | R6 | `UNKNOWN` | no | abstained_not_retrieved |
| t2.p2.a1 | t2.k07 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p2.a1 | t2.k08 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p2.a1 | t2.k09 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p2.a1 | t2.k10 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p2.a1 | t2.k11 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p2.a1 | t2.k12 | R7 | `'ivan.petrov@mail.example'` | no | wrong_concrete |
| t2.p2.a1 | t2.k13 | R7 | `True` | no | wrong_concrete |
| t3.p1.a1 | t3.k10 | R1 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p1.a1 | t3.k11 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p1.a1 | t3.k12 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p1.a1 | t3.k13 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p2.a1 | t3.k10 | R1 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p2.a1 | t3.k11 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p2.a1 | t3.k12 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p2.a1 | t3.k13 | R4 | `UnknownRule` | no | abstained_not_retrieved |

</details>

<details>
<summary>His design, memo pre-fix: 44 rows</summary>

| Session | Check | Rule | Agent wrote | Rule's source in top 5 | Outcome |
|---|---|---|---|---|---|
| t1.p0.a1 | t1.k01 | R1 | `30` | no | wrong_concrete |
| t1.p0.a1 | t1.k02 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k03 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k04 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k05 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k06 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k07 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k08 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k12 | R1 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a1 | t1.k13 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k01 | R1 | `30` | no | wrong_concrete |
| t1.p0.a2 | t1.k02 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k03 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k04 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k05 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k06 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k07 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k08 | R3 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k12 | R1 | `UnknownRule` | no | abstained_not_retrieved |
| t1.p0.a2 | t1.k13 | R2 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k06 | R6 | `UNKNOWN` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k07 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k08 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k09 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k10 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k11 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a1 | t2.k12 | R7 | `'ivan.petrov@mail.example'` | no | wrong_concrete |
| t2.p0.a1 | t2.k13 | R7 | `True` | no | wrong_concrete |
| t2.p0.a2 | t2.k06 | R6 | `UNKNOWN` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k07 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k08 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k09 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k10 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k11 | R6 | `UnknownRule` | no | abstained_not_retrieved |
| t2.p0.a2 | t2.k12 | R7 | `'ivan.petrov@mail.example'` | no | wrong_concrete |
| t2.p0.a2 | t2.k13 | R7 | `True` | no | wrong_concrete |
| t3.p0.a1 | t3.k10 | R1 | `30` | no | wrong_concrete |
| t3.p0.a1 | t3.k11 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p0.a1 | t3.k12 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p0.a1 | t3.k13 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k10 | R1 | `30` | no | wrong_concrete |
| t3.p0.a2 | t3.k11 | R2 | `UNKNOWN` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k12 | R4 | `UnknownRule` | no | abstained_not_retrieved |
| t3.p0.a2 | t3.k13 | R4 | `UnknownRule` | no | abstained_not_retrieved |

</details>

R7 masks e-mail addresses in an export. Its source s11 replaced s10, which sent full addresses. In all three
wordings of t2 memo's top 5 held s10 and not s11, so the agent kept full addresses (wrong concrete). That is the
missing supersession from experiment 3 in action. R1 is the HTTP timeout: 7 seconds (s02) replaced 30 (s01). In
wording p2 only s01 reached the top 5 and the agent wrote 30. In p0 both did, and the agent left the value UNKNOWN
rather than pick one (missed available).

## Pre-registered hypotheses, scored

The round config set these before any data. Experiment 1, his design:

- **h1, memo applies known rules about as well as files and as well as or better than every other system: fails.**
  The threshold was within 4 of the files row with no more wrong concrete answers. On its default EmbeddingGemma
  memo applied 46 of 78 against 78, with 0 wrong. That is above AgentMemory, OpenViking with evo off and Hindsight,
  and below Mem0 and OpenViking with evo on (54). On e5-small (not default) it applied 30 with 4 wrong.
- **h2, memo loses old-version checks because it has no supersession: confirmed**, 16 of 48 on EmbeddingGemma (12
  on e5-small). Every other engine scored 12 of 48 (files-top5 22), so this does not single memo out in this design.
- **h3, the unknown checks do not separate variants: confirmed**, 30 of 30 everywhere.
- **Admission gates: all pass.** Oracle: files-his, which gets the answer key's rules as a file, scores 78 of 78
  and 30 of 30. Too easy: no memory scores 0 of 78 (the limit was 10). Stored: every store holds at least 66 of
  78 (the limit was 60), so every store is ranked.

## What it showed

1. **In his design memo on its default model lands in the middle: 46 of 78 known checks applied, 76 of 108 in his
   table.** Mem0 and OpenViking with Agent Evolution on are top at 54 of 78. Plain files given all 8 rules apply 78
   of 78. In two other wordings memo applies 61 of 78, the best of every engine there (OpenViking evo off 57, Mem0
   58). On e5-small, which is not its default, memo applied 30 and 52: the first version of this page measured memo
   off its default.
2. **His result does not carry over to our corpus.** His OpenViking 108 becomes 74 to 87, his Mem0 50 becomes 84
   to 88, his AgentMemory 84 becomes 74 to 76. Only the controls hold: no memory 30, files 108.
3. **The frozen top-5 search is the bottleneck, not storage or the agent.** files-top5 stores everything and still
   applies 28 of 78. Almost every loss in every engine is a rule that never reached the top 5.
4. **When the agent may search itself, every engine reaches 77 or 78 of 78**, memo included. The engines then
   differ in cost, not answers: grep over files used the fewest tokens, memo the most (1.6M).
5. **memo's real gap is supersession.** A corrected note is fine (experiment 3: 44 of 44). Two separate notes, one
   replacing the other, are not linked: in experiment 1 the cancelled e-mail permission kept beating its
   cancellation. That is roadmap step 5.
6. **Learning from conversation works for memo.** memo with agent-written notes and memo fed the transcripts both
   carried every rule across sessions (48 of 48). The agent's own notes file scored 46 and OpenViking 44 and 46.
7. **Danil's own Memory Bank applies every rule (78 of 78, 48 of 48 across sessions), and so does memo when the
   agent may search.** The difference is cost: the bank's template is 117,621 tokens of rules for the agent, and
   its sessions used 3.3 times the input tokens of plain files in experiment 1 and 3.9 times memo-agent in
   experiment 2.

## What was not measured

- His data. His corpus, tasks and scripts are not published, so his rows and ours are on different data.
- Other agents and models. One agent (Hermes) and one model (gpt-5.6-terra) for every row.
- Run-to-run noise beyond two applications per task. Two applications of the same frozen context gave the same
  score in almost every pair, so the spread comes from the wording, which the ours design shows.
- Speed and cost of the engines at scale. 36 sources only.
- Hindsight's full image (with its local reranker) and OpenViking's default Volcengine models.
- A sealed network. The sandbox shares the host network so Hermes can reach the model, which also lets a session
  reach services on localhost. The unrestricted proxy listens there on purpose. Nothing blocked other local
  services. A scan of all 4,017 tool calls in 332 sessions found no localhost address, port, `curl`, `wget`, database
  client or URL. Every memo result the agents saw was one of the round's own synthetic notes.
- A strategy prompt free of the generator's style. It tells the agent to look for correction words («поправка»,
  «теперь», «отменяем», «отзываем», «больше не»). The experiment 1 corpus has three of them: «поправка» once,
  «теперь» once and «больше не» twice. «отменяем» and «отзываем» are not in it, and the dev set has «отзываем» once.
  The prompt was written after reading the corpus, so a real corpus may word corrections differently.

## Cost

The agent runs on a ChatGPT subscription through Hermes's `openai-codex` provider: no API cost, so the
agent tokens above are a size, not a bill. Paid API calls were only the engines' own writes and embeddings, at
OpenAI's [list prices](https://developers.openai.com/api/docs/pricing) (gpt-5-mini $0.25 input, $0.025 cached
input, $2.00 output per million tokens, text-embedding-3-small $0.02, checked 2026-11-27).

| Spend | Tokens | Source | USD |
|---|---|---|---:|
| Hindsight, e1 and e3 banks | 376K in (218K cached), 30K out, 132K reasoning | Hindsight `/llm-requests/stats`, read after every session (its searches made no model call) | about 0.37 |
| OpenViking, 4 builds | about 58K in and 47K out each | OpenViking usage audit | about 0.44 |
| Mem0, e1 build | about 611K in, 70K out | worker log | about 0.29 |
| Mem0, e3 gate | not counted | estimate from the e1 build | about 0.25 |
| OpenViking, experiment 2 (every try) | 251K in, 67K out, 34K embedding | OpenViking usage audit | about 0.20 |
| Embeddings, every engine and search | well under 1M | estimate | under 0.02 |
| Memory Bank, all 30 sessions | none outside the agent | no model call | 0 |
| memo reruns on EmbeddingGemma, 48 sessions and the gate | none outside the agent | local embeddings | 0 |

Total: about $1.6, against a cap of $20.
