# Backlog — later

P3 work and research for cli-testing, one item each. An item moves to [`BACKLOG.md`](BACKLOG.md)
when it becomes P2 and keeps its id; the rules are there.

- **CON-3 · P3** Protocol drift: live answers compared with the captured frames, on a schedule.
- **UX-4 · P3** A local Verdaccio registry for unreleased combinations of the shared packages and
  for upgrade tests.
- **UX-3 · P3** Agent usability: does an agent pick the right tool and finish ordinary tasks —
  starting from cli-docs `scripts/agent-evals/`. Scored with promptfoo `tool-call-f1`; on demand
  only, it spends tokens.
- **PERF-2 · P3** Soak: `serve`, `watch` and `mcp` for hours — memory, reconnects, clean exit.
- **PERF-3 · P3** Resilience: offline, slow and flaky networks, timeouts — a clear error, never a
  hang. Toxiproxy for tg (MTProto over TCP); a small fake WebSocket server for MAX.
- **RES-2 · P3** Snyk Agent Scan over the MCP tool descriptions, advisory only and never a gate — it
  needs a token and sends the descriptions to Snyk; decide before adopting.
