# Agents

Measurements of what the WireCat CLIs cost the AI agent that reads their answers.

- [output-size](output-size/README.md) — bytes and tokens of one answer under `--json`, `--json=<fields>`,
  `--jsonl`, `--brief` and the default text (2026-10-15).

- [meeting-workflows](meeting-workflows/README.md) — full meeting searches, alias pagination and cited passage reads: process count, time, output and retained evidence, plus reviewed Zoom/Memo findings acceptance.

- [meeting-communications](meeting-communications/README.md) — published-package preparation over explicitly selected messages, mail and documents, with citations, conflicts, coverage and an unchanged database.

- [meeting-project-discovery](meeting-project-discovery/README.md) — registry-only project suggestions with cited aliases, strict MCP arguments and unchanged database bytes.

- [meeting-series-inventory](meeting-series-inventory/README.md) — published CLI/MCP scheduled candidates, retained uncertainty, strict arguments and no SQLite access.

- [knowledge-graph-memory](knowledge-graph-memory/README.md) — a 2,000-record synthetic corpus and 50-question scorer for changing agreements, a Memo retrieval-only baseline: recall@10 1.00 with OR keywords, 0.00 with the verbatim question (2026-11-02); Supermemory and Mem0 retrieval on the same questions (recall@10 1.00 and 0.95 verbatim; Mem0 kept no memory of 2 confirmed changes); runners for Hermes alone, + WireCat, + Supermemory and + Mem0, whose answer runs are pending (2026-11-02).

- [openclaw-skills](openclaw-skills/README.md) — OpenClaw lists the six WireCat skills from `~/.agents/skills`
  and marks one not ready when its CLI is missing (2026-10-29).
