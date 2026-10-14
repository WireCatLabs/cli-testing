# Security audit — runbook

The commands of one audit run, in order. Why each step exists: [`METHOD.md`](METHOD.md). The
first run was 2026-10-09; its results are private (`cli-private/security/runs/2026-10-09/`).

## 0. Tools, pinned

A version at least two weeks old on the day of the run, recorded in `SCOPE.md` by the scripts.
`cli-testing security scan` refuses any other version.

```sh
uv tool install semgrep==1.178.0
uv tool install zizmor==1.30.1
# gitleaks: the release binary, checked against its checksums file the same way as osv-scanner
# osv-scanner: the release binary, checked against the release's own SHA256SUMS
V=2.6.0; D=$(mktemp -d); cd "$D"
gh release download v$V -R google/osv-scanner -p osv-scanner_linux_amd64 -p osv-scanner_SHA256SUMS
grep ' osv-scanner_linux_amd64$' osv-scanner_SHA256SUMS | sha256sum -c - && install -m 755 osv-scanner_linux_amd64 ~/.local/bin/osv-scanner
```

Socket CLI runs through `pnpm dlx @socketsecurity/cli@1.1.179` inside the script. Log in once,
**in your own terminal**, never through an agent: `pnpm dlx @socketsecurity/cli@1.1.179 login`.

Claude Code plugins: `claude plugin marketplace add trailofbits/skills`, then install
`static-analysis supply-chain-risk-auditor insecure-defaults sharp-edges audit-context-building
fp-check agentic-actions-auditor differential-review` (`claude plugin install <name>@trailofbits`).
Disable `fp-check` again after the run — its Stop hook fires on every session.

## 1. GitHub settings — apply, then read back

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

Every public repository, each checkout in a folder named after its repository (the runner refuses
two checkouts with the same folder name):

```sh
RUN=~/Projects/AI/cli-private/security/runs/$(date +%F)
P=~/Projects/AI
C=($P/max-cli $P/tg-cli $P/cli-core $P/cli-base $P/cli-memo $P/drive-cli $P/zoom-cli $P/cli-docs
  $P/cli-testing $P/community $P/.github)
cli-testing security scan "$RUN" "${C[@]}" --previous <previous-run>
cli-testing security socket "$RUN" "${C[@]}"
for c in "${C[@]}" $P/cli-private; do
  (cd "$c" && gitleaks git --no-banner --redact .; echo "$(basename "$c") gitleaks exit=$?")
done
```

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

`REPORT.md` in the run folder: scanner results, verdict per checklist item with its basis, finding
details, what this run did not cover, and the comparison with the previous run. Each finding into
the private register. Fixes go in as pull requests, one per repository and theme.
