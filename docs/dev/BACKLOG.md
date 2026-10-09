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

## Phase 0 — the repository

- **OPS-2 · P1 🚩** Trusted publisher for `@wirecat/cli-testing` on npmjs.com (GitHub Actions,
  `WireCatLabs/cli-testing`, `release.yml`, environment `npm`) — the owner's step on npm.
- **OPS-3 · P1** A reusable `release-checks` workflow in cli-core that each CLI's `release.yml`
  calls before `build`; move `pnpm audit --prod` and zizmor there from the per-pull-request
  `node-ci.yml`, so a new advisory never blocks unrelated work.
- **OPS-4 · P2** First release, `0.1.0`, once Phase 1 has a suite to ship.

## Phase 1 — runs and the security group

- **RUN-1 · P1** The run folder: `SCOPE.md` (commits, tool versions, exit codes), `raw/`,
  `REPORT.md`; one layout for every suite.
- **RUN-2 · P1** `cli-testing compare <suite> <run-a> <run-b>`: new, fixed, came back. Case folders
  in the style of Deno and trycmd for CLI transcripts, with redactions (`[WILDCARD]`, `[ROOT]`), as
  a small runner over vitest file snapshots.
- **SEC-1 · P1 🟡** (as a script in `scripts/`; the command is left) `cli-testing security scan`:
  osv-scanner, semgrep with `--metrics=off`, zizmor, open CodeQL alerts, over clean exports of
  `origin/main`; a tool exit code its docs do not list fails the run.
- **SEC-1a · P1** Pins at least two weeks old on the day of a run: semgrep 1.178.0 (1.180.0 was too
  new on 2026-10-09), Socket CLI from npm, never its GitHub releases page.
- **SEC-2 · P1 🟡** (as a script in `scripts/`; the command is left) `cli-testing security socket`:
  the same commits through the Socket CLI, pinned, `--no-banner`.
- **SEC-3 · P1 🟡** (as a script in `scripts/`; the command is left) `cli-testing agent`: a real
  agent over the CLI's MCP server, the host allowing only read tools, a canary first, the benign
  payload set; pass = no write call. Per-CLI config: the MCP command, how the test account sends and
  deletes, the test chats by role. Judge as AgentDojo does: attack success is the write calls the
  MCP server recorded and the state of the test chat, with utility (did the ordinary task succeed)
  reported beside it.
- **SEC-4 · P2** `cli-testing security no-leak`: logs, `--trace` output, fixtures, docs and crash
  output scanned for phone numbers, tokens and message text. `gitleaks dir` with custom rules for
  MAX tokens, phone numbers and chat ids.
- **SEC-5 · P2** A second audit run of max-cli and tg-cli after the first audit's fixes ship,
  compared with the first; the agent suite on tg-cli for the first time.

## Phase 2 — contract

- **CON-1 · P2** Machine mode: stdout is one JSON value and nothing else, errors are one JSON object
  on stderr, exit codes match the documented table — for every command a CLI lists. Runner on execa;
  assertions as plain vitest.
- **CON-2 · P2** MCP tool schemas and `--help` output snapshotted; a release that changes them fails
  until the snapshot is updated on purpose. Snapshots through the MCP SDK `Client.listTools()` and
  `toMatchFileSnapshot`, no new dependency.
- **CON-4 · P2** MCP Inspector in CLI mode (`--cli --method tools/list --strict`) as a schema
  portability gate; MCP conformance against the HTTP server path with an expected-failures baseline.
- **CON-3 · P3** Protocol drift: live answers compared with the captured frames, on a schedule.

## Phase 3 — analyzers

- **ANA-1 · P2** The heavier linters and analyzers, release-only: semgrep rule packs, unused code
  and exports, licence check of the dependency tree.
- **ANA-2 · P2** The documentation linters cli-docs runs (markdownlint, spelling dictionaries, link
  checks), so every repository's docs are checked the same way.

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
