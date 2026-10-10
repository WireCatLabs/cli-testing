# Continuous integration

The WireCat check policy aims to catch mistakes early while keeping local commits fast.
The shared presets and hook configuration live in
[community](https://github.com/WireCatLabs/community/tree/main/standards).
This folder records the project schedule, approximate costs, and monthly operating procedure.

| Stage | Checks |
| --- | --- |
| Local commit | Staged Biome lint/formatting and staged secret detection, in parallel |
| Local push | No check hook |
| PR and main-branch push | Config integrity, repository lint, Markdown lint, secrets, and `ci:quick` |
| Release | Full validation and release security before publication |
| Monthly or manual | Full validation and security without publication |

`ci:quick` runs typechecking for the nine CLI packages. The docs site runs its synthetic
unit suite instead, avoiding generated documentation, site builds, and browsers at this stage.
One docs test file, `scripts/command-groups.test.ts`, needs generated command-reference files
and remains in full validation; the other 31 test files run in ordinary CI.
The step has a two-minute failure ceiling; that is not its expected duration.
Full coverage and the large Telegram, MAX, and messaging test suites stay in full validation.
Superseded ordinary CI runs are cancelled when a new commit arrives.

The typecheck catches incompatible arguments, missing exports, and errors in tests or scripts
that syntax linting cannot catch. Existing import restrictions still apply. The docs unit tests
catch regressions in documentation tooling without building the website.

The package's own tests use synthetic fixtures and injected process runners. This policy never
automatically starts `cli-testing agent`, live messenger suites, or scans against private accounts.
Those remain owner-started operations under the [security runbook](../security/RUNBOOK.md).

## Guides

- [Timings by package and check](TIMINGS.md)
- [Monthly schedule, manual runs, and failure handling](MONTHLY.md)
- [Offline CLI output and MCP contracts](CONTRACTS.md)
- [Release artifacts and checks that run once](RELEASES.md)
- [Package test isolation and coverage](../dev/TESTING.md)

This rollout takes effect after the corresponding project PR merges. Scheduled workflows run on
the default branch; adding a schedule to a PR does not activate it.

Stateful preservation, retired-schema rejection and leak-check scope are documented in
[upgrade checks](UPGRADES.md).
