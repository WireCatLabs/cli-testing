# Backlog

Open work only, one item per line, in the order it is built. A finished item's line is deleted.
How the package is built: [`ARCHITECTURE.md`](ARCHITECTURE.md). Results and findings of runs live in
the private `cli-private` repository, never here.

## Rules

- **An id is permanent** and never reused: the prefix and the next free number in that prefix.
- **Prefixes:** `OPS` repository, CI, release · `RUN` run folders and comparison · `SEC` security
  group · `CON` contract group · `ANA` analyzers group · `UX` ux group · `PERF` performance group ·
  `LIVE` live checks · `SEED` seed data · `RES` research.
- **One item:** the task as a title, then where the work starts.
- **Priority:** **P1** blocks the next phase · **P2** this cycle · **P3** someday.
- **Mark:** none — not started · 🚧 `<branch>` — taken · 🟡 — half done, the rest named · 🚩 — waits on
  an owner decision.
- **Claim before code:** `🚧 <branch>` on the line in the first push of the branch.
- **Close in the PR that ships the work:** delete the line here in that PR.

## Phase 1 — remaining security work

- **SEC-4 · P2** `cli-testing security no-leak`: logs, `--trace` output, fixtures, docs and crash
  output scanned for phone numbers, tokens and message text. `gitleaks dir` with custom rules for
  MAX tokens, phone numbers and chat ids.
- **SEC-5 · P2** A second audit run of max-cli and tg-cli after the first audit's fixes ship,
  compared with the first; the agent suite on tg-cli for the first time.

## Phase 2 — contract

- **CON-1 · P2 🟡** Expand the shipped offline output/error/help/MCP contracts beyond metadata
  commands to synthetic store-backed cases covering each CLI's documented command table. The
  shared runner and reviewed MAX/Telegram/Zoom metadata plans are already implemented.
- **CON-4 · P2** MCP Inspector in CLI mode (`--cli --method tools/list --strict`) as a schema
  portability gate; MCP conformance against the HTTP server path with an expected-failures baseline.
- **CON-3 · P3** Protocol drift: live answers compared with the captured frames, on a schedule.

## Phase 3 — analyzers

- **ANA-1 · P2** The heavier linters and analyzers, release-only: semgrep rule packs, unused code
  and exports, licence check of the dependency tree.

## Phase 4 — ux

- **UX-1 · P2** Install from the packed tarball with npm, pnpm and bun, on the supported Node
  versions, Linux, macOS and Windows; one command runs after install. With publint on the packed
  tarball.
- **UX-2 · P2** Upgrade from the previous published version: config and store migrate, nothing is
  lost.
- **UX-4 · P3** A local Verdaccio registry for unreleased combinations of the shared packages and
  for upgrade tests.
- **UX-3 · P3** Agent usability: does an agent pick the right tool and finish ordinary tasks —
  starting from cli-docs `scripts/agent-evals/`. Scored with promptfoo `tool-call-f1`; on demand
  only, it spends tokens.

## Phase 5 — performance

- **PERF-1 · P2** Cold start and command latency, recorded per release so the trend shows.
  hyperfine, written into run folders and compared by `compare`; no public benchmark dashboard.
- **PERF-2 · P3** Soak: `serve`, `watch` and `mcp` for hours — memory, reconnects, clean exit.
- **PERF-3 · P3** Resilience: offline, slow and flaky networks, timeouts — a clear error, never a
  hang. Toxiproxy for tg (MTProto over TCP); a small fake WebSocket server for MAX.

## Phase 6 — seed and live

- **SEED-1 · P2** Synthetic data generators for search, reports, templates and docs examples;
  deterministic by seed; no real message, name or phone. Faker with fixed seeds and the `ru` locale.
- **LIVE-1 · P2** `cli-testing live`: the shape-only helper from cli-messaging's release guide as a
  command; the CLIs' `test-live` skills call it. Each live script declares the capabilities it
  needs, as GitHub CLI's acceptance tests do; `workflow_dispatch` per group and system.

## Research

- **RES-2 · P3** Snyk Agent Scan over the MCP tool descriptions, advisory only and never a gate — it
  needs a token and sends the descriptions to Snyk; decide before adopting.
