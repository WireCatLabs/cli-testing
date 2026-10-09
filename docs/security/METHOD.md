# Security audit — method

How an audit run is done, so a later run on another date checks the same things the same way and
the results can be compared. **Results never go into this public repository**: a run writes to a
folder the caller names — for the owner's CLIs, `security/runs/<YYYY-MM-DD>/` in the private
`cli-private` repository — and findings that outlive a run live in that repository's
`security/FINDINGS.md`. Step-by-step commands: [`RUNBOOK.md`](RUNBOOK.md). What the tools taught
us: [`LESSONS.md`](LESSONS.md).

Repositories: `max-cli`, `tg-cli`, `cli-messaging` (with `packages/sqlite`, `packages/onnx`),
`cli-core`, `cli-tasks`, `cli-testing`. All public. The private repository is never given to a
hosted scanner.

## A run, step by step

1. `mkdir runs/<date>` and record what is scanned in `runs/<date>/SCOPE.md`: the commit of each
   repository, and the version of every tool below. Without this, two runs cannot be compared.
2. Read back GitHub's settings for each repository (commands in "GitHub settings") into
   `SCOPE.md`.
3. Run [`scripts/security/scan`](../../scripts/security/scan) `<run-dir> <repo>...`. It exports `origin/main` of each repository, runs the scanners, pulls
   open CodeQL alerts, strips temp paths, and records each tool's exit code in `SCOPE.md`. A tool
   exit code its docs do not list as a result fails the run, so a crash never reads as "no
   findings".
4. Run [`scripts/security/socket`](../../scripts/security/socket) `<run-dir>`. It scans the same commits through Socket and adds its exit codes to
   `SCOPE.md`. The Socket CLI banner prints the start of the API token; the script passes
   `--no-banner` after the command (before it, the flag is not parsed). Raw output goes to `runs/<date>/raw/<repo>/<tool>.*`, in
   JSON or SARIF where the tool can produce it, so two runs can be diffed.
5. Do the manual review (section "Checklist"). Every item gets a verdict in
   `runs/<date>/REPORT.md`: safe, finding, or not applicable — each with the evidence that
   supports it.
6. Before a candidate finding gets an id, run the Trail of Bits `fp-check` skill on it, through
   its helper agents (its deep route requires them). Keep the plugin disabled between audits: its
   Stop hook fires on every session in every project ([`LESSONS.md`](LESSONS.md)). A confirmed
   finding is journaled, then added to the private register.
7. Compare with the previous run: new findings, findings fixed, findings that came back. The
   comparison is the last section of `REPORT.md`.

## Tools

Skills and plugins (Claude Code):

- Trail of Bits marketplace `trailofbits/skills`: `static-analysis`, `supply-chain-risk-auditor`,
  `insecure-defaults`, `sharp-edges`, `audit-context-building`, `fp-check`,
  `agentic-actions-auditor`, `differential-review`.
- Semgrep Guardian is **installed but disabled**. Even the local variant (`semgrep/guardian-local`)
  needs a Semgrep login, and its edit hook sends traces with the git remote, scanned paths and
  findings to Semgrep (`send_metrics=True` in `semgrep/mcp/hooks/post_tool.py`, semgrep 1.180.0).
  The `semgrep` CLI with `--metrics=off` in `scripts/security/scan` covers the same rule packs.
- The review prompt of `anthropics/claude-code-security-review`
  (`.claude/commands/security-review.md` in that repository), run locally through Claude Code.
  Not in CI.

Command-line scanners, each pinned to a version recorded in `SCOPE.md`:

- `osv-scanner` — known advisories over the whole `pnpm-lock.yaml` tree. Trail of Bits
  `supply-chain-risk-auditor` does not read pnpm lockfiles, so it covers direct dependencies only.
- `socket` (Socket CLI) — package behaviour: install scripts, network, shell, typosquats. Pinned to
  `@socketsecurity/cli@1.1.179` (the newest release older than two weeks on 2026-10-09); needs a
  Socket API token. `@latest` was run once with `pnpm dlx --version` on 2026-10-09 before pinning.
- `semgrep` CE, pinned to a release at least two weeks old (1.178.0 on 2026-10-09; run 1 used
  1.180.0, which was too new) — rule packs `p/javascript`, `p/typescript`, `p/nodejs`, `p/secrets`,
  `p/github-actions`.
- `zizmor` — GitHub Actions workflows.
- CodeQL — through GitHub default setup; alerts read with `gh api`.

Permanent gates in the shared `node-ci.yml` (cli-core): `pnpm audit --prod --audit-level high` and
zizmor `--min-severity high`. A high advisory with no fix yet is let through per repository with
`audit.ignore` in `pnpm-workspace.yaml` (GHSA ids only — [pnpm audit docs](https://pnpm.io/cli/audit)).
pnpm has no field for a reason or an expiry, so every entry carries a comment with both:

```yaml
audit:
  ignore:
    - GHSA-xxxx-xxxx-xxxx # dev path only via foo; revisit 2026-11-01
```

## GitHub settings

Read back per repository:

```sh
gh api repos/<owner>/<repo> --jq .security_and_analysis
gh api repos/<owner>/<repo>/code-scanning/default-setup --jq .state
gh api -i repos/<owner>/<repo>/vulnerability-alerts | head -1   # 204 = on
gh api repos/<owner>/<repo>/automated-security-fixes --jq .enabled
```

Expected: secret scanning, push protection, vulnerability alerts, Dependabot security updates on;
CodeQL `configured`.

## Checklist

### S · Code and supply chain

- **S1 · Install script.** `install/postinstall.mjs` in both CLIs runs on every user's machine at
  `npm i -g`. What it touches, downloads, executes; whether it fails open.
- **S2 · Self-update** (`src/update.ts`). What it runs, whether it checks integrity, whether a
  version string reaches a shell.
- **S3 · Process spawning.** Every `child_process` / `cross-spawn` call: shell use, argument
  injection, `$EDITOR` / `$BROWSER` handling.
- **S4 · Local servers.** MCP server and `max-cli/src/server/start.ts`: bind address, auth.
- **S5 · Credentials at rest.** MAX token, mtcute session, bot tokens: file mode, location, log
  redaction (`pino`), what `diagnose` prints.
- **S6 · Downloads to disk.** Attachment names: path traversal, symlinks, overwriting.
- **S7 · Network clients.** `ws`, `undici`, the tg-cli proxy: TLS verification, requests to a host
  an attacker chooses.
- **S8 · Parsers of untrusted data.** Wire frames (`@msgpack/msgpack`, `lossless-json`);
  `@xmldom/xmldom`, `liquidjs` (who controls templates), `yaml`, `chardet`, `iconv-lite`,
  `image-size`, `fflate` (zip bombs), `@resvg/resvg-js` (SVG); model downloads for ONNX and
  `sherpa-onnx` — source and integrity.
- **S9 · CI and release.** Job permissions, `pull_request_target`, expressions in `run:`, cache
  poisoning, workflows that run an AI agent.
- **S10 · Third-party tree.** Advisories, behaviour, abandoned upstreams. Source reading only for
  packages S1–S9 point at.

### A · Safety for AI agents using the tools

Text written by other people — messages, names, chat titles, notes, file names, OCR and speech
transcripts, link previews — reaches an agent through MCP results and machine-mode JSON. The
question for every item: can that text make the agent do something the owner did not ask for?

- **A1 · Content is framed as data.** Every place untrusted text enters an MCP result or JSON
  output: is it inside a field clearly marked as content, never in a place the model reads as
  instructions (tool descriptions, server instructions, error messages that echo it)?
- **A2 · Hidden characters.** Unicode tag characters (U+E0000–E007F), bidirectional overrides,
  zero-width characters, ANSI escapes — in machine mode and MCP, not only on the terminal.
- **A3 · Spoofed structure.** Text that imitates the tool's own output: a fake end of a JSON
  block, a fake "system" line, a fake tool result, markdown that hides text.
- **A4 · Write gating.** Every tool that sends, edits, deletes, forwards, reacts or marks read
  honours `max agent config` permissions; the default is safe; an agent cannot change its own
  permissions through MCP or a command it is allowed to run.
- **A5 · Exfiltration.** Can an injected message make an agent forward or quote private content
  to another chat, a URL (link previews, downloads), or a file path?
- **A6 · Tool annotations.** `readOnlyHint` / `destructiveHint` / `openWorldHint` match what each
  tool really does, so MCP clients ask the user before writes.
- **A7 · Live test.** Injection payloads placed in the **test** chats only, then a real agent
  (`claude -p` with the MCP server) asked to do an ordinary read task. Pass: it reads, reports the
  payload as content, and does nothing else. Run through the `test-live` skill, with the owner's
  yes. Payload set kept in `agent-payloads.md` so every run uses the same ones.
