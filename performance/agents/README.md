# Agents

Measurements of what the WireCat CLIs cost the AI agent that reads their answers.

A test on the owner's real data follows [Testing agents on real data](../../docs/dev/AGENT-TESTS.md).

- [output-size](output-size/README.md) — bytes and tokens of one answer under `--json`, `--json=<fields>`,
  `--jsonl`, `--brief` and the default text (2026-10-15).

- [meeting-workflows](meeting-workflows/README.md) — full meeting searches, alias pagination and cited passage reads: process count, time, output and retained evidence, plus reviewed Zoom/Memo findings acceptance.

- [meeting-communications](meeting-communications/README.md) — published-package preparation over explicitly selected messages, mail and documents, with citations, conflicts, coverage and an unchanged database.

- [meeting-project-discovery](meeting-project-discovery/README.md) — registry-only project suggestions with cited aliases, strict MCP arguments and unchanged database bytes.

- [meeting-series-inventory](meeting-series-inventory/README.md) — published CLI/MCP scheduled candidates, retained uncertainty, strict arguments and no SQLite access.

- [knowledge-graph-memory](knowledge-graph-memory/README.md) — a 2,000-record synthetic corpus and 50-question scorer for changing agreements; Memo, OpenClaw, Supermemory and Mem0 retrieval, five agent setups answering with Claude Sonnet, and memo after its search fixes: the question as typed reaches recall@1/5/10 0.40/1.00/1.00 with e5-small (2026-11-05); index variants in memory: one vector per record with EmbeddingGemma 0.50/1.00/1.00, facts from Claude Haiku did worse (2026-11-03); a 10K archive corpus with 50 questions on the hardest milestones and a 6,500-record Mem0 subset, OpenClaw + Supermemory and + Mem0 setups, and cost and limit estimates for that round, nothing run yet (2026-11-05); where memo's search lost 0.23 recall@10 against its own model, and the fix that brings the reworded questions from 0.48 to 0.62 ([meaning-loss](knowledge-graph-memory/meaning-loss/README.md), 2026-11-08); EmbeddingGemma inside memo: 0.72 of the reworded questions, 0.79 once a mail's sender moves to the end of its vector text, and why Gemma alone finds 0.94 ([gemma-in-memo](knowledge-graph-memory/meaning-loss/gemma-in-memo/README.md), 2026-11-08); [questions in other words](knowledge-graph-memory/hybrid-ranking/README.md): a hit both words and meaning found keeps its better rank, reworded recall@10 0.36 to 0.44 with the plain v3 and 10K sets unchanged (2026-11-07). Plain-words summary: [RESULTS.md](knowledge-graph-memory/RESULTS.md).

- [write-time-enrichment](write-time-enrichment/README.md) — Memo with a hosted model's facts and reworded questions
  kept beside each record (cli-core #2690), off against on, one store of 10,444 synthetic records: reworded
  questions @10 0.62 → 0.79, first place in the record's own words 0.54 → 0.48, $0.49 with gpt-4o-mini; with EmbeddingGemma 0.78 → 0.94
  (2026-11-08).

- [lifebench](lifebench/README.md) — LifeBench 2.0 (public, synthetic) English phone data in memo, search only, no
  answer model: memo hybrid with e5-small finds an evidence record in the first 10 for 70% of one persona's 288
  answerable questions (recall@10 0.32); EmbeddingGemma alone 76% (0.38) (2026-11-08). Agent pilot: OpenClaw +
  Claude Sonnet 5.5 on 46 questions, LifeBench's deepseek-chat judge: memo 93%, plain files 96%, $5.05 and $4.23.
  Leaderboard-style (memo's 40 hits once, DeepSeek-V4-Flash answers): gold evidence 96%, memo e5-small 85%,
  memo EmbeddingGemma 80% (published: gold 97.3%, Hindsight 72.0%, Mem0 61.5%), $0.34.
  All 348 questions, 20 records: gold 97%, memo Gemma 80%, memo e5-small 76% ($2.77).
  Two persons, 700 questions: memo Gemma 78%, e5-small 74% (paired p 0.045), gold 98%.
  With search limited to records from before each question: Gemma 77.7% micro, 74.5% macro (unchanged).
  Run-to-run noise: 49 of 280 verdicts change on a plain rerun (17.5%), the total holds to about a point.

- [locomo-memory-agents](locomo-memory-agents/README.md) — 50 public LoCoMo questions (200 for Claude Code), Hermes,
  OpenClaw and Claude Code, each with plain files, WireCat memo, Hindsight, Honcho, Mem0 and Supermemory: no engine
  beat files, WireCat is within noise of files on the 50 questions in every arm, and below files on 200
  questions with Claude (3 runs: 175.3 against 181.3, −6.0, interval −11.0 to −1.3), and with DeepSeek Flash in Hermes Hindsight (−5.0), Honcho (−3.0) and Mem0
  (−6.7) are below files by the paired test. Other models with WireCat: Gemini +3.7 over DeepSeek Flash on one
  run, Grok partial at 19 questions (2026-11-25).

- [telegram-search-agents](telegram-search-agents/README.md) — the owner's real Telegram archive (954,242 messages,
  376 chats), 65 questions as he asks them, totals only: one search finds the answer in the top 20 for 42 with WireCat
  tg, 33 with qmd, 1 with Telegram's own search and 0 with jackwener/tg-cli. With an agent on 20 held-out questions,
  3 runs, tg with its skill ties qmd with its skill (Sonnet 15.7 against 16.4, Haiku 13.25 against 14.5) and reaches
  the grep ceiling; Anthropic models only (2026-11-26).

- [source-coverage](source-coverage/README.md) — a real personal Telegram account, WireCat against telegram-mcp and a
  plain export, on clean questions over 10 chats (2026-11-13). The setup was simpler than real use; read
  [AGENT-TESTS.md](../../docs/dev/AGENT-TESTS.md) before quoting it.

- [openclaw-skills](openclaw-skills/README.md) — OpenClaw lists the six WireCat skills from `~/.agents/skills`
  and marks one not ready when its CLI is missing (2026-10-29).

- [mcp-short-listing](mcp-short-listing/README.md) — an agent succeeds as often with the short MCP answer schema
  (3,323 characters for the three tools) as with the full one (17,278), on half the input tokens (2026-11-09).

- [tools-search](tools-search/README.md) — `memo_tools_search` over a real stdio MCP server: task phrases found
  6 of 13 commands when every word had to match, 13 of 13 when ranked by the words that match; short phrases
  unchanged at 13 of 13 (2026-11-12).
