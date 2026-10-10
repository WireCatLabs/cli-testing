# @wirecat/cli-testing

Test suites for the WireCat command-line tools — max-cli and tg-cli first. A suite drives a CLI the
way a user or an agent does: through its built binary, its MCP server and its published package,
never through its source code. Each CLI adds this package as a development dependency, so users
never install it.

Suites come in groups, and each runs on its own:

| Group | What it checks |
|---|---|
| `security` | dependency advisories, static analysis, workflow safety, package behaviour, prompt injection through an agent, secrets or personal data in output |
| `contract` | machine-mode output, exit codes, MCP tool schemas, protocol drift |
| `performance` | start time, command speed, long-running servers, bad networks |
| `ux` | installing and upgrading on each package manager and system, whether an agent finds the right tool |
| `analyzers` | heavier linters and static analyzers than a pull request runs |
| `live` | shape-only checks on real test accounts, started by the owner |
| `seed` | synthetic data for search, reports, templates and docs |

None of them runs on every change: they run when a version is released, on demand or on a schedule,
so they never slow down work on the CLIs.

## Run a suite

Install this package as a development dependency and build it before running from a checkout.
Give every scan a new private output directory; a recorded stage is never overwritten.

```sh
cli-testing security scan <run-dir> <checkout>...
cli-testing security socket <run-dir> <checkout>...
cli-testing compare security <run-a> <run-b>
```

Install the pinned tools from the [runbook](docs/security/RUNBOOK.md#0-tools-pinned).
Scans export `origin/main`; Socket reads the same commits from `SCOPE.md`. Runs contain
`SCOPE.md`, `raw/`, `REPORT.md` and `run.json`. A completed scan still needs manual review:
scanner observations are candidates, not confirmed vulnerabilities. Comparison reports
`new`, `fixed`, `cameBack` and `unchanged` observation identifiers. Pass `--previous <run>`
to a new scan to carry the history needed to recognize a returning observation. Legacy
scanner folders can be compared without changing them. Repository/scanner coverage must match, so
omitting a repository or Socket stage cannot look like fixed observations.

For an agent run, prepare a private plan and test cast as described in
[the agent test](docs/security/AGENT-TEST.md#run-the-agent-command), then run:

```sh
cli-testing agent <run-dir> <plan.json> --live
```

The canary runs first. A failed canary stops payloads. Each payload checks whether the agent
attempted a write and whether its answer contains the expected task-specific fragment;
these are reported separately in its summary. Runtime failures leave a run incomplete.
The owner's approval applies only to the test profiles, chats and payloads listed in the plan.

## Search experiments

Offline synthetic search-quality benchmarks, model explanations and resource probes live in
[`performance/search/`](performance/search/README.md). They run on demand against an explicitly
selected cli-messaging build; they are separate from the published suite package.

## Security audits

How an audit is run and repeated: [`docs/security/METHOD.md`](docs/security/METHOD.md), the commands
in [`RUNBOOK.md`](docs/security/RUNBOOK.md), the agent injection test in
[`AGENT-TEST.md`](docs/security/AGENT-TEST.md). Results stay private.

## CI and check budgets

[The CI guide](docs/ci/README.md) describes local hooks, PR checks, release validation, and monthly
checks across WireCat projects. See the [timing table](docs/ci/TIMINGS.md) for approximate costs
and the [monthly runbook](docs/ci/MONTHLY.md) for schedules and failure handling.

## Releasing

`bin/release` on a clean `main` publishes the version in `package.json` through GitHub Actions and
tags it; `bin/release --local` publishes from this machine with the npm token from the keyring. When
npm already has the version, it commits the next free one and publishes that.

## Licence

[Apache License 2.0](LICENSE).
