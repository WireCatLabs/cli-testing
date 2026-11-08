# Agents

Measurements of what the WireCat CLIs cost the AI agent that reads their answers.

- [output-size](output-size/README.md) — bytes and tokens of one answer under `--json`, `--json=<fields>`,
  `--jsonl`, `--brief` and the default text (2026-10-15).

- [meeting-workflows](meeting-workflows/README.md) — full meeting searches, alias pagination and cited passage reads: process count, time, output and retained evidence, plus reviewed Zoom/Memo findings acceptance.

- [meeting-communications](meeting-communications/README.md) — published-package preparation over explicitly selected messages, mail and documents, with citations, conflicts, coverage and an unchanged database.

- [meeting-project-discovery](meeting-project-discovery/README.md) — registry-only project suggestions with cited aliases, strict MCP arguments and unchanged database bytes.

- [meeting-series-inventory](meeting-series-inventory/README.md) — published CLI/MCP scheduled candidates, retained uncertainty, strict arguments and no SQLite access.

- [knowledge-graph-memory](knowledge-graph-memory/README.md) — a 2,000-record synthetic corpus and 50-question scorer for changing agreements; Memo, OpenClaw, Supermemory and Mem0 retrieval, five agent setups answering with Claude Sonnet, and memo after its search fixes: the question as typed reaches recall@1/5/10 0.40/1.00/1.00 with e5-small (2026-11-05); index variants in memory: one vector per record with EmbeddingGemma 0.50/1.00/1.00, facts from Claude Haiku did worse (2026-11-03). Plain-words summary: [RESULTS.md](knowledge-graph-memory/RESULTS.md).

- [write-time-enrichment](write-time-enrichment/README.md) — Memo with a hosted model's facts and reworded questions
  kept beside each record (cli-core #2690), off against on, one store of 10,444 synthetic records: reworded
  questions @10 0.62 → 0.79, first place in the record's own words 0.54 → 0.48, $0.49 with gpt-4o-mini; with EmbeddingGemma 0.78 → 0.94
  (2026-11-08).

- [openclaw-skills](openclaw-skills/README.md) — OpenClaw lists the six WireCat skills from `~/.agents/skills`
  and marks one not ready when its CLI is missing (2026-10-29).
