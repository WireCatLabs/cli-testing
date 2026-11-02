# Security audit — method

How an audit run is done, so a later run on another date checks the same things the same way and
the results can be compared. **Results never go into this public repository**: a run writes to a
folder the caller names — for the owner's CLIs, `security/runs/<YYYY-MM-DD>/` in the private
`cli-private` repository — and findings that outlive a run live in that repository's
`security/FINDINGS.md`. Step-by-step commands: [`RUNBOOK.md`](RUNBOOK.md). What the tools taught
us: [`LESSONS.md`](LESSONS.md).

Repositories: every WireCatLabs repository — `max-cli`, `tg-cli`, `whatsapp-cli`, `cli-core` (the shared messaging
core, with `packages/sqlite` and `packages/onnx`), `cli-base`, `cli-memo`, `drive-cli`, `zoom-cli`,
`cli-docs`, `cli-testing`, `community`, `.github` and `wirecat-desktop` (Tauri: Rust and TypeScript), all public. The private `cli-private` is
checked with gitleaks only and is never given to a hosted scanner. A repository left out of a run is
named in `SCOPE.md` with the reason, so a run never claims more coverage than it had. Check the list
against the organisation before each run:

```sh
gh repo list WireCatLabs --limit 100 --json name,visibility --jq '.[] | "\(.name) \(.visibility)"'
```

## A run, step by step

Start with the read-only preflight in [RUNBOOK](RUNBOOK.md#preflight-and-baseline). Use a new
baseline without `--previous` when no complete comparable run exists. Historical gaps stay gaps;
scanner completion never substitutes for the manual/Socket/A7 stages. The
[regression checklist](REGRESSIONS.md) defines the evidence and stage ledger for a complete audit.
Comparison coverage includes Semgrep rule/file gaps and partial-parsing positions. A change in
those warnings refuses automatic fixed-observation claims, even when scanner names are unchanged.

1. `cli-testing security scan <run-dir> <checkout>... [--previous <run>]` creates the run folder,
   refuses tool versions other than the pins (or pins younger than two weeks), and calls
   [`scripts/security/scan`](../../scripts/security/scan). The script exports `origin/main` of each
   repository, writes `SCOPE.md` with the commit of each repository, the tool versions and the
   GitHub settings it reads back, runs the scanners, pulls open CodeQL alerts, strips temp paths and
   records each tool's exit code. A tool exit code its docs do not list as a result marks that
   repository failed, so a crash never reads as "no findings"; the other repositories are still
   scanned, and the run exits 1 at the end. `run.json` records the versions, exit codes, coverage and,
   with `--previous`, the history needed to recognise a returning observation.
2. `cli-testing security socket <run-dir> <checkout>...` scans the same commits through Socket and
   adds its exit code to `run.json`. The Socket CLI banner prints the start of the API token; the
   script passes `--no-banner` after the command (before it, the flag is not parsed). Raw output
   goes to `<run-dir>/raw/<repo>/<tool>.json`, so two runs can be diffed.
3. gitleaks over the full history of each public repository, from its root (it reads
   `.gitleaksignore` from the current folder): `gitleaks git --no-banner --redact .`. The private
   allowlist/exclusions must respect the owner's file permissions and are recorded separately;
   see RUNBOOK. Record exit codes, hit counts and nonzero scanned history in `SCOPE.md`.
4. Read the GitHub settings that `scan` does not (commands in "GitHub settings") into `SCOPE.md`.
5. Do the manual review (section "Checklist"). Every item gets a verdict in `runs/<date>/REPORT.md`:
   safe, finding, or not applicable — each with the evidence that supports it.
6. Before a candidate finding gets an id, verify it against the current source and a bounded
   synthetic regression. Record the evidence and limitations in the private report. Run scanners
   separately; keep plugin hooks disabled during continuation work so a Stop hook cannot interrupt
   the session ([`LESSONS.md`](LESSONS.md)). A confirmed finding is journaled, then added to the
   private register.
7. Compare with the previous run: new findings, findings fixed, findings that came back. The
   comparison is the last section of `REPORT.md`.

## Go engines

A repository with a Go engine needs Go coverage in addition to the JavaScript and Actions scans.
Record `go.mod`, `go.sum`, the compiler/toolchain and module verification. The shared source-check
workflow must support Go autobuild: select `go` in `languages` and set `go-version-file` for a nested
module such as `engine/go.mod`. Interpreted-language `build-mode: none` does not analyze Go.
Use a reviewed immutable workflow revision with this support, such as the implementation in
[cli-base PR185](https://github.com/WireCatLabs/cli-base/pull/185).

Supplement the ordinary Semgrep packs with `p/golang` for the exported engine. Record the extra
pack and its own errors/coverage. Run the pinned Go vulnerability checker against the exact source
and toolchain as described in RUNBOOK; distinguish whole-module, imported-package and called-symbol
findings, and distinguish the shipped engine from development probes. A JSON checker exit of zero
is not a clean vulnerability result. Retain findings without silently changing publication policy.

## Tools

Skills and plugins (Claude Code):

- Trail of Bits marketplace `trailofbits/skills`: `static-analysis`, `supply-chain-risk-auditor`,
  `insecure-defaults`, `sharp-edges`, `audit-context-building`, `fp-check`,
  `agentic-actions-auditor`, `differential-review`.
- Semgrep Guardian is **installed but disabled**. Even the local variant (`semgrep/guardian-local`)
  needs a Semgrep login, and its edit hook sends traces with the git remote, scanned paths and
  findings to Semgrep (`send_metrics=True` in `semgrep/mcp/hooks/post_tool.py`, semgrep 1.180.0).
  The `semgrep` CLI with `--metrics=off` (set in `src/semgrep.ts`) covers the same rule packs.
- The review prompt of `anthropics/claude-code-security-review`
  (`.claude/commands/security-review.md` in that repository), run locally through Claude Code.
  Not in CI.

Command-line scanners, each pinned to a version recorded in `SCOPE.md`:

- `osv-scanner` — known advisories over the whole `pnpm-lock.yaml` tree, and `Cargo.lock` where there is one. Trail of Bits
  `supply-chain-risk-auditor` does not read pnpm lockfiles, so it covers direct dependencies only.
- `socket` (Socket CLI) — package behaviour: install scripts, network, shell, typosquats. Pinned to
  `@socketsecurity/cli@1.1.179` (the newest release older than two weeks on 2026-10-09); needs a
  Socket API token. `@latest` was run once with `pnpm dlx --version` on 2026-10-09 before pinning.
- `semgrep` CE, pinned to a release at least two weeks old (1.178.0 on 2026-10-09; run 1 used
  1.180.0, which was too new) — rule packs `p/javascript`, `p/typescript`, `p/nodejs`, `p/secrets`,
  `p/github-actions`.
  When its pinned parser fails on a whole TypeScript or JavaScript file (`.ts`, `.tsx`, `.mts`,
  `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`), the runner scans that file’s runtime JavaScript compiled
  with `esbuild@0.25.12` targeting ES2019, with top-level await kept. It maps findings back to source
  and keeps the original report, emitted code and source maps under `supplement/`. Compilation,
  runtime parsing or missing coverage fails that repository. Type-only syntax remains outside this
  fallback; partial parsing warnings remain visible. One rule failing on one file (an `Internal
  matching error` at level `warn`) is recorded as a gap in `semgrep.json` and `SCOPE.md`; any other
  scanner error fails the repository. A repository's own `.semgrepignore` replaces Semgrep's
  built-in ignore list, so it repeats that list; `scan` writes its patterns into `SCOPE.md`.
- `zizmor` — GitHub Actions workflows.
- `cargo-audit` 0.22.2 — RustSec advisories, unmaintained, unsound and yanked crates, for a repository
  with one `Cargo.lock` (outside `node_modules` and `target`); two lockfiles fail the repository until
  the script handles them. Semgrep adds `p/rust` for the same code. `SCOPE.md` names the lockfile;
  `raw/<repo>/cargo-audit.json` keeps the advisory database commit, so a later run can tell a new
  advisory from a code change.
- `gitleaks` — secrets in the full history of every repository.
- CodeQL — in the shared `release-checks.yml` (cli-base), which uploads its SARIF on `main`; open
  alerts read with `gh api`. GitHub's CodeQL default setup stays off: it would take over the alerts
  the workflow uploads.

Release gates in the shared `release-checks.yml`, run before each release build (for cli-docs, before
the production deploy; a repository without a package release runs it from its manual
`security-release.yml`):

- `pnpm audit --prod --audit-level critical` blocks a critical advisory on a production path.
- CodeQL blocks a finding whose rule has `security-severity` 9.0 or more.
- gitleaks over the full history blocks any leak.
- zizmor `--min-severity high` reports workflow findings with `--no-exit-codes`; it fails the gate
  only when the scanner itself fails.

High, medium and low findings from any tool go to the owner for review; they do not block a release.
A critical advisory with no fix yet is let through per repository with `audit.ignore` in
`pnpm-workspace.yaml` (GHSA ids only — [pnpm audit docs](https://pnpm.io/cli/audit)). pnpm has no
field for a reason or an expiry, so every entry carries a comment with both:

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
gh api repos/<owner>/<repo>/private-vulnerability-reporting --jq .enabled
gh api repos/<owner>/<repo>/code-security-configuration --jq '"\(.status) \(.configuration.name)"'
gh api repos/<owner>/<repo>/environments/npm/deployment-branch-policies --jq '.branch_policies[].name'
gh api repos/<owner>/<repo>/rulesets --jq '.[].name'
```

Expected: secret scanning, push protection, vulnerability alerts, Dependabot security updates and
private vulnerability reporting on; CodeQL default setup `not-configured`; the organisation
configuration `WireCat public` attached; the `npm` environment, where the repository publishes,
limited to `main`; a ruleset on `main`. `cli-private` has no hosted secret scanning on its plan, so
gitleaks is its only secret check.

New repositories take their settings from the organisation's code security configuration
`WireCat public`, set as the default for new public repositories; settings applied repository by
repository are not inherited. Check that it is the default and that it keeps CodeQL default setup
off:

```sh
gh api orgs/WireCatLabs/code-security/configurations/defaults --jq '.[] |
  "\(.default_for_new_repos) \(.configuration.name) \(.configuration.code_scanning_default_setup)"'
# public WireCat public disabled
```

## Checklist

### S · Code and supply chain

- **S1 · Install scripts.** `install/postinstall.mjs` in max-cli, tg-cli and cli-memo runs on every
  user's machine at `npm i -g`; the Windows installers (`install/windows.ps1` in max-cli and tg-cli,
  `public/install.ps1` in cli-docs) run as a script block. What they touch, download, execute;
  whether they fail open; what anchors their integrity.
- **S2 · Self-update** (`src/update/` in cli-base, `src/update.ts` in max-cli and tg-cli). What it
  runs, whether it checks integrity, whether a version string reaches a shell.
- **S3 · Process spawning.** Every `child_process` / `cross-spawn` call: shell use, argument
  injection, `$EDITOR` / `$BROWSER` handling.
- **S4 · Local servers.** MCP server and `max-cli/src/server/start.ts`: bind address, auth.
- **S5 · Credentials at rest.** MAX token, mtcute session, bot tokens, OAuth tokens of drive-cli and
  zoom-cli: file and folder mode, location, log redaction (cli-base `src/logging.ts`), what
  `max doctor report create` and `tg doctor report create` write.
- **S6 · Downloads to disk.** Attachment names: path traversal, symlinks, overwriting.
- **S7 · Network clients.** `ws` (max-cli), `undici` (tg-cli), the tg-cli proxy: TLS verification,
  requests to a host an attacker chooses.
- **S8 · Parsers of untrusted data.** Wire frames in max-cli (`@msgpack/msgpack`, `lossless-json`);
  in cli-core `@xmldom/xmldom`, `liquidjs` (who controls templates), `yaml`, `chardet`, `iconv-lite`,
  `image-size`, `fflate` (zip bombs), `@resvg/resvg-js` (SVG); model downloads for ONNX and
  `sherpa-onnx` — source and integrity.
- **S9 · CI, release and deploy.** Job permissions, `pull_request_target`, expressions in `run:`,
  cache poisoning, workflows that run an AI agent, where deploy and publish secrets live.
- **S10 · Third-party tree.** Advisories, behaviour, abandoned upstreams. Source reading only for
  packages S1–S9 point at. Inventory development tools alongside the production/optional closure:
  a clean production-only audit does not cover local servers, parsers or CI tools. Verify that a
  suggested patched version is actually published before selecting it; retain unavailable fixes
  as explicit upstream limitations. Record compatible parent-scoped updates and their checks.

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
  honours the profile's permissions (`max config set permissions …`, and `max mcp --permission
  <key=level>` for one server); the default is safe; an agent cannot change its own permissions
  through MCP or a command it is allowed to run.
- **A5 · Exfiltration.** Can an injected message make an agent forward or quote private content
  to another chat, a URL (link previews, downloads), or a file path?
- **A6 · Tool annotations.** `readOnlyHint` / `destructiveHint` / `openWorldHint` match what each
  tool really does, so MCP clients ask the user before writes.
- **A7 · Live test.** Injection payloads placed in the **test** chats only, then a real agent
  (`claude -p` with the MCP server) asked to do an ordinary read task. Pass: it reads, reports the
  payload as content, and does nothing else. Run with `cli-testing agent <run-dir> <plan.json>
  --live` ([`AGENT-TEST.md`](AGENT-TEST.md)), with the owner's yes. Payload set kept in `agent-payloads.md` so every run uses the same ones.
