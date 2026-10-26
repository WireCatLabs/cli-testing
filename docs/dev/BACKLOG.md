# Backlog

Open work only, P1 and P2, most important first. A finished item's line is deleted. P3 and research are in
[`BACKLOG_LATER.md`](BACKLOG_LATER.md).
How the package is built: [`ARCHITECTURE.md`](ARCHITECTURE.md). Results and findings of runs live in
the private `cli-private` repository, never here.

## Rules

- **An id is permanent** and never reused: the prefix and the next free number in that prefix.
- **Prefixes:** `OPS` repository, CI, release · `RUN` run folders and comparison · `SEC` security
  group · `CON` contract group · `ANA` analyzers group · `UX` ux group · `PERF` performance group ·
  `LIVE` live checks · `SEED` seed data · `RES` research.
- **One item:** the task as a title, then where the work starts.
- **Priority:** **P1** blocks the next phase · **P2** this cycle · **P3** someday, in `BACKLOG_LATER.md`.
- **Mark:** none — not started · 🚧 `<branch>` — taken · 🟡 — half done, the rest named · 🚩 — waits on
  an owner decision · ⏸️ — deferred by the owner.
- **Claim before code:** `🚧 <branch>` on the line in the first push of the branch.
- **Close in the PR that ships the work:** delete the line here in that PR.

## Launch blockers (P1)

## Next (P2)

- **SEC-5 · P2** A complete new audit over the current repository set, with explicit scanner,
  Socket, manual/false-positive and owner-approved agent stages. Start a fresh scanner baseline
  if historical coverage is incomplete; compare only complete records with matching coverage.
- **CON-1 · P2 🟡** Expand offline contracts to the remaining documented command paths. Metadata,
  cached messages/tasks, config migration and meeting import/search/export already have binary
  checks and pinned-version preservation probes. Broader contacts, notes, tags and HTTP paths remain.
- **CON-4 · P2** MCP Inspector in CLI mode (`--cli --method tools/list --strict`) as a schema
  portability gate; MCP conformance against the HTTP server path with an expected-failures baseline.
- **ANA-1 · P2** The heavier linters and analyzers, release-only: semgrep rule packs, unused code
  and exports, licence check of the dependency tree.
- **PERF-1 · P2** Cold start and command latency, recorded per release so the trend shows.
  hyperfine, written into run folders and compared by `compare`; no public benchmark dashboard.
- **SEED-1 · P2** Synthetic data generators for search, reports, templates and docs examples;
  deterministic by seed; no real message, name or phone. Faker with fixed seeds and the `ru` locale.
- **LIVE-1 · P2** `cli-testing live`: the shape-only helper from cli-messaging's release guide as a
  command; the CLIs' `test-live` skills call it. Each live script declares the capabilities it
  needs, as GitHub CLI's acceptance tests do; `workflow_dispatch` per group and system.
