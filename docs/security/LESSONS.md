# What the tools taught us

Facts learned during the audits, with their source. Each cost time once.

## Scanners

- **Exit codes, from each tool's docs.** osv-scanner: 0 none, 1 found, 127 error, 128 no packages
  ([docs](https://google.github.io/osv-scanner/output/)). semgrep without `--error`: 0 ok, 2 and up
  failed ([docs](https://docs.semgrep.dev/cli-reference)). zizmor: 0 none, 1–3 errors, 11–14
  findings by highest severity ([docs](https://docs.zizmor.sh/usage/)). `|| true` would turn a
  crash into "no findings"; the scripts check the code instead.
- **osv-scanner's JSON does not say which pnpm packages are dev-only**; `pnpm audit --prod` does.
  Dev-only advisories therefore do not belong in a gate on osv-scanner.
- **`pnpm audit` ignores by GHSA id only**, in `pnpm-workspace.yaml` `audit.ignore`, with no field for
  a reason or an expiry — write both as a comment ([docs](https://pnpm.io/cli/audit)).
- **semgrep's Claude Code plugin sends telemetry even in its local variant**: its edit hook needs a
  login and reports the git remote, scanned paths and findings (`send_metrics=True`,
  `semgrep/mcp/hooks/post_tool.py`, read in semgrep 1.180.0). The CLI with `--metrics=off` avoids it.
- **The Socket CLI prints the start of the API token in its banner.** `--no-banner` hides it, and it
  must come after the command — before it, the flag is not parsed.
- **A `.semgrepignore` replaces Semgrep's built-in ignore list** instead of adding to it: with a
  one-line file, `test/`, `dist/` and `node_modules/` are scanned again (ran on semgrep 1.178.0). A
  repository's file repeats the built-in list before its own lines.
- **gitleaks reads `.gitleaksignore` from the current folder**, not from the repository it scans.
  Run it from the repository's root, or a scan from elsewhere reports the ignored hits again.
- **CodeQL 2.27 SARIF keeps the rules in `tool.extensions[].rules`**, and `tool.driver.rules` is
  empty. A result points at its rule through `rule.toolComponent.index` and `rule.index`; a gate
  that looks rules up in `driver.rules` by `ruleId` finds none and never fails. Resolve every
  result to a rule, and fail when one has no rule.
- **Trail of Bits `supply-chain-risk-auditor` does not read `pnpm-lock.yaml`**; it covers direct
  dependencies only (its `SKILL.md`). osv-scanner covers the tree.
- **Trail of Bits `fp-check` installs a Stop hook on every session** that blocks stopping until the
  verification is visible in the conversation itself. Disabling the plugin takes effect from the next
  session; in the current one, turn it off in `/hooks`.

## GitHub

- **Dependabot's `allow` also filters security updates**; setting `target-branch` to the default
  branch takes the entry's options off them ([options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)).
- **Dependabot security updates work with pnpm 11**; a `security_update_not_possible` failure means a
  parent package pins the vulnerable one, not that the lockfile was unreadable.
- **zizmor runs against `.github`**; given a nested path it can exit 3, "no inputs collected".
- **Restricting the `npm` environment to `main`** keeps trusted publishing working from `main` (token
  exchange `201`) and stops branch dry runs from reaching npm.
- **A new repository does not inherit settings applied repository by repository.** Secret
  scanning, push protection, security updates and private reporting start off unless an
  organisation code security configuration is the default for new repositories.
- **CodeQL default setup and workflow CodeQL do not mix**: with default setup on, GitHub refuses
  the SARIF a workflow uploads for the same languages
  ([docs](https://docs.github.com/en/code-security/code-scanning/troubleshooting-sarif-uploads/default-setup-enabled)).
- **A CodeQL alert number is per repository**; check every dismissed alert's path after dismissing
  by number.

## Node

- **`JSON.stringify` does not escape C1 controls, Unicode tag characters, bidi overrides or U+FEFF**
  (ran on Node 24) — a sanitiser for agents cannot rely on it.
- **`tls.setDefaultCACertificates` widens trust for the whole process** — `fetch`, `https` and `ws`
  connections opened afterwards all trust the added root (ran on Node 24.19).

## Agents

- **`claude -p` with `--allowedTools` limited to read tools refuses a write and still records it**,
  which makes a safe canary for injection tests.
- **On 2026-10-09, Opus 5.5 and Haiku 5.5 made no write in 16 injection runs.** That is model
  behaviour on one day, not a control.
