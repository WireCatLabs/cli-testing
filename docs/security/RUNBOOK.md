# Security audit — runbook

Use this before starting an audit to prepare the checkouts, validate the tools and record each
stage without overstating coverage. Why each step exists: [`METHOD.md`](METHOD.md). The
first run was 2026-10-09; its results are private (`cli-private/security/runs/2026-10-09/`).

## 0. Tools, pinned

A version at least two weeks old on the day of the run, recorded in `SCOPE.md` by the scripts.
`cli-testing security scan` refuses any other version.

```sh
AUDIT_TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/wirecat-audit/semgrep-1.178.0"
test -x "$AUDIT_TOOLS/bin/python" || uv venv "$AUDIT_TOOLS"
uv pip install --python "$AUDIT_TOOLS/bin/python" semgrep==1.178.0 zizmor==1.30.1
export PATH="$AUDIT_TOOLS/bin:$PATH"
export SEMGREP_SEND_METRICS=off SEMGREP_ENABLE_VERSION_CHECK=0
# gitleaks: the release binary, checked against its checksums file the same way as osv-scanner
# osv-scanner: the release binary, checked against the release's own SHA256SUMS
V=2.6.0; D=$(mktemp -d); cd "$D"
gh release download v$V -R google/osv-scanner -p osv-scanner_linux_amd64 -p osv-scanner_SHA256SUMS
grep ' osv-scanner_linux_amd64$' osv-scanner_SHA256SUMS | sha256sum -c - && install -m 755 osv-scanner_linux_amd64 ~/.local/bin/osv-scanner
```

Keep the audit environment first on PATH for the whole run: Semgrep also starts `osemgrep`
through PATH. This preserves any different global installation.

Socket CLI runs through `pnpm dlx @socketsecurity/cli@1.1.179` inside the script. Log in once,
**in your own terminal**, never through an agent: `pnpm dlx @socketsecurity/cli@1.1.179 login`.

Claude Code plugins: `claude plugin marketplace add trailofbits/skills`, then install
`static-analysis supply-chain-risk-auditor insecure-defaults sharp-edges audit-context-building
fp-check agentic-actions-auditor differential-review` (`claude plugin install <name>@trailofbits`).
Disable `fp-check` again after the run — its Stop hook fires on every session.

## Preflight and baseline

Run from a clean cli-testing worktree built from the commit you intend to use. This does not
require a globally installed executable:

```sh
P="$HOME/Projects/AI"
TESTING="$P/cli-testing"
PRIVATE="$P/max-cli/docs_ai"
RUN="$PRIVATE/security/runs/$(date +%F)"
C=("$P/max-cli" "$P/tg-cli" "$P/cli-core" "$P/cli-base" "$P/cli-memo" "$P/drive-cli" "$P/zoom-cli" "$P/cli-docs"
  "$P/cli-testing" "$P/community" "$P/wirecat-github")
cd "$TESTING"
pnpm install --frozen-lockfile
pnpm build
node "$TESTING/dist/main.js" security preflight "${C[@]}"
```

Set `TESTING` to the clean tooling worktree and `PRIVATE` to the private checkout in use. Verify
that the output directory is inside that private checkout. The public source repositories are
exported from `origin/main`; unrelated local edits are not scanned. Fetch the intended refs before
preflight. Record both source commits and the cli-testing commit in the new scope.

A local `cli-core` symlink to `cli-messaging` is supported: keep the canonical `cli-core` name in
`C`, and do not include both aliases. Preflight rejects duplicate physical checkouts, unrecognized GitHub
origins, private source repositories, unavailable commands,
unsupported scanner pins, unreadable CodeQL analysis and invalid comparison metadata. It only
reads Git/GitHub metadata and tool versions; it does not scan source, create a run, read credential
files, log in, change settings or authorize live tests. Socket authentication remains a separate
owner-terminal check; preflight does not start Socket or fetch a token.

For the first valid scanner baseline, omit `--previous`. An older report may still be used as
manual historical evidence; never change its `complete` flag or manufacture missing outputs.
For a later comparison, set an existing complete baseline explicitly:

```sh
PREVIOUS=/absolute/path/to/a/completed-private-run
node "$TESTING/dist/main.js" security preflight "${C[@]}" --previous "$PREVIOUS"
```

The baseline needs a complete security `run.json` and recorded coverage. `compare` additionally
requires identical repository/scanner coverage. A missing analysis, failed parser or absent stage
is a gap, not a fixed finding. A CodeQL 404 may mean absent analysis or insufficient access; resolve
it or record the repository as incomplete. Never replace it with an empty alerts array. A
successful scanner stage is not a complete METHOD audit: track manual review, false-positive
verification, Socket, full-history secret scanning and A7 separately in the report.

## 1. GitHub settings — read back, then apply approved changes

First read settings with the commands in METHOD. An audit does not authorize settings changes.
Apply the following only when the owner has approved the specific correction, then read it back.

New public repositories get their settings from the organisation configuration `WireCat public`;
check that it is still the default with the command in [`METHOD.md`](METHOD.md#github-settings).
For a repository whose read-back shows a setting off, per repository `<owner>/<repo>`:

```sh
r=<owner>/<repo>
gh api -X PATCH repos/$r --input - <<'EOF'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
EOF
gh api -X PUT repos/$r/vulnerability-alerts
gh api -X PUT repos/$r/automated-security-fixes
gh api -X PUT repos/$r/private-vulnerability-reporting
```

A repository that publishes to npm also gets the `npm` environment, limited to `main`:

```sh
gh api -X PUT repos/$r/environments/npm --input - <<'EOF'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
gh api -X POST repos/$r/environments/npm/deployment-branch-policies -f name=main -f type=branch
```

CodeQL default setup stays off: CodeQL runs in `release-checks.yml`, and default setup would take
over the alerts that workflow uploads. Read back with the commands in
[`METHOD.md`](METHOD.md#github-settings); default setup reads `not-configured`. A repository whose
`dependabot.yml` limits npm updates with `allow` needs `target-branch: main` on that entry, or the
`allow` list also filters security updates ([`LESSONS.md`](LESSONS.md)).

## 2. Scanners, Socket and gitleaks

Every public repository, with stable distinct checkout names (the local `.github` checkout is
`wirecat-github`; its GitHub identity is recorded separately):

Use the variables from preflight. Start a new baseline with:

```sh
node "$TESTING/dist/main.js" security scan "$RUN" "${C[@]}"
node "$TESTING/dist/main.js" security socket "$RUN" "${C[@]}"
for c in "${C[@]}"; do
  (cd "$c" && gitleaks git --no-banner --redact .; echo "$(basename "$c") gitleaks exit=$?")
done
```

For a complete approved previous baseline, add `--previous "$PREVIOUS"` to `security scan`.
Run Socket only after a completed scanner stage and the owner's authentication/source-upload
approval. If it is unavailable, record that stage as not run; do not call the METHOD audit complete.

The private repository never goes through hosted source scanners. Respect the owner's allowed
paths. Its CI-compatible secret check covers tracked Markdown/workflow history, excluding
`secrets/`; it is narrower than the public full-history checks:

```sh
(cd "$PRIVATE" && gitleaks git --no-banner --redact \
  --log-opts="--all -- *.md .github/workflows/*.yml :(exclude)secrets/**" .)
```

Record the private allowlist, excluded paths, exit code, hits and actual scanned commit count.
Do not widen it to local casts, credentials or raw account artifacts. Verify the configured scan
with a separate temporary synthetic repository and a known-positive fixture, and confirm a
nonzero history before accepting a clean result. Do not put literal quotes inside `--log-opts`.

A failed repository does not stop the others: `scan` names it on stderr and exits 1 after the last
one. Rerun that repository into a new run folder once the cause is fixed. gitleaks runs from each
repository's root, where it finds that repository's `.gitleaksignore`; record each exit code and
hit count in `SCOPE.md`.

## 3. CodeQL triage

Group the open alerts per repository and rule from `raw/<repo>/codeql.json`. For each alert decide:
real · not reachable (shipped, input not attacker-controlled) · not shipped (tests, `scripts/`,
`bench/` — check `package.json` `files`) · false positive · fixed. Dismiss on GitHub only what is
not shipped or verified false, then re-read the dismissed alerts and check each path really is a
test, script or a verified file before trusting the dismissals:

```sh
gh api -X PATCH repos/<owner>/<repo>/code-scanning/alerts/<n> -f state=dismissed \
  -f dismissed_reason="used in tests" -f dismissed_comment="<why, with the run date>"
```

## 4. Manual review

A clean export of `origin/main` of each repository into a scratch folder, then one read-only
reviewer per area, in parallel, with the prompts in [`review-prompts.md`](review-prompts.md).
Every claim a reviewer makes is checked against the code before it gets an id; a statement says
whether it was read, run or inferred.

## 5. fp-check

Every candidate finding, and every alert dismissed as a false positive, through the `fp-check`
skill: Step 0, route, phases 1–5, the 13 devil's-advocate questions, six gates, PoC and negative PoC,
verdict. PoCs local only — a fake HOME, synthetic data, bounded memory (`ulimit -v`, `timeout`).
Write each part to the run folder and keep an index of verdicts with the line of each gate review.

## 6. Agent test

[`AGENT-TEST.md`](AGENT-TEST.md). Needs the owner's yes and the approved list of payloads, every
time.

## 7. Record

Use the [regression checklist](REGRESSIONS.md) for positive and negative controls and the per-stage
completion ledger. Include the accepted-risk input and exact source/release boundary.

`REPORT.md` in the run folder: scanner results, verdict per checklist item with its basis, finding
details, what this run did not cover, and the comparison with the previous run. Each finding into
the private register. Fixes go in as pull requests, one per repository and theme.
