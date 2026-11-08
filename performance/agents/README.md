# Agents

Measurements of what the WireCat CLIs cost the AI agent that reads their answers.

- [output-size](output-size/README.md) — bytes and tokens of one answer under `--json`, `--json=<fields>`,
  `--jsonl`, `--brief` and the default text (2026-10-15).

- [meeting-workflows](meeting-workflows/README.md) — full meeting searches, alias pagination and cited passage reads: process count, time, output and retained evidence, plus reviewed Zoom/Memo findings acceptance.

- [meeting-communications](meeting-communications/README.md) — published-package preparation over explicitly selected messages, mail and documents, with citations, conflicts, coverage and an unchanged database.

- [meeting-project-discovery](meeting-project-discovery/README.md) — registry-only project suggestions with cited aliases, strict MCP arguments and unchanged database bytes.

- [meeting-series-inventory](meeting-series-inventory/README.md) — published CLI/MCP scheduled candidates, retained uncertainty, strict arguments and no SQLite access.

- [knowledge-graph-memory](knowledge-graph-memory/README.md) — a 2,000-record synthetic corpus and 50-question scorer for changing agreements; Memo, OpenClaw, Supermemory and Mem0 retrieval, five agent setups answering with Claude Sonnet, and memo after its search fixes: the question as typed reaches recall@1/5/10 0.40/1.00/1.00 with e5-small (2026-11-05); index variants in memory: one vector per record with EmbeddingGemma 0.50/1.00/1.00, facts from Claude Haiku did worse (2026-11-03); a 10K archive corpus with 50 questions on the hardest milestones and a 6,500-record Mem0 subset, OpenClaw + Supermemory and + Mem0 setups, and cost and limit estimates for that round, nothing run yet (2026-11-05); where memo's search lost 0.23 recall@10 against its own model, and the fix that brings the reworded questions from 0.48 to 0.62 ([meaning-loss](knowledge-graph-memory/meaning-loss/README.md), 2026-11-08); EmbeddingGemma inside memo: 0.72 of the reworded questions, 0.79 once a mail's sender moves to the end of its vector text, and why Gemma alone finds 0.94 ([gemma-in-memo](knowledge-graph-memory/meaning-loss/gemma-in-memo/README.md), 2026-11-08). Plain-words summary: [RESULTS.md](knowledge-graph-memory/RESULTS.md).

- [openclaw-skills](openclaw-skills/README.md) — OpenClaw lists the six WireCat skills from `~/.agents/skills`
  and marks one not ready when its CLI is missing (2026-10-29).
