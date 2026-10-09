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

## Releasing

`bin/release` on a clean `main` publishes the version in `package.json` through GitHub Actions and
tags it; `bin/release --local` publishes from this machine with the npm token from the keyring. When
npm already has the version, it commits the next free one and publishes that.

## Licence

MIT.
