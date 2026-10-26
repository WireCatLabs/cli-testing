# Packed installation

This check was run because npm's blocked install-script warnings and pnpm's changed global-bin layout made
launch installation uncertain. It verifies the new install suite against six published tarballs without
opening an account, before broader platform validation.

## Reproduce

From the cli-testing checkout, install the test tools at the exact versions in `src/ux.ts` and put their
executables on PATH: npm 11.17.0, pnpm 12.11.2, Bun 1.3.14 and publint 0.3.25. Then run:

```sh
sh performance/startup/packed-install/reproduce.sh <new-artifact-directory>
```

The reproducer builds cli-testing, packs the exact releases listed in `scripts/ux-plan.mjs`, and runs
`cli-testing ux install`. Replace a plan's tarball path to check a local candidate. Full logs and installed
artifacts remain in the specified directory; the committed JSON contains only versions, hashes and totals.

## Results

Linux x64, Node v24.19.0; every row passed publint, global installation, exact binary version and `--help`.
The JSON records the exact tarball hashes, tool pins and run times.

| Tool | Release | npm | pnpm | Bun |
| --- | --- | --- | --- | --- |
| max | 0.71.0 | pass | pass | pass |
| tg | 0.84.0 | pass | pass | pass |
| memo | 0.90.0 | pass | pass | pass |
| wa | 0.6.0 | pass | pass | pass |
| drive | 0.26.0 | pass | pass | pass |
| zm | 0.39.0 | pass | pass | pass |

All 18 rows passed. Warning-line counts remain separate from pass/fail in
[the aggregate results](linux-2026-10-24.json); they include manager and dependency diagnostics and do not
count distinct problems. The runner records warnings from stdout and stderr, including blocked lifecycle
scripts. No warning was promoted to a failure. Nonzero commands, missing launchers and incorrect versions
remain failures.

## What this showed

The six tarballs install and provide account-free help under all three pinned managers on this Linux host.
The isolation setup must give pnpm 12 a `PNPM_HOME/bin` directory already on PATH. Bun needs an existing
global manifest to keep parent-directory package discovery out of repeated runs. The runner creates both
inside each row's test directory. Bun's documented global-directory settings are described in
[its configuration reference](https://bun.sh/docs/runtime/bunfig#installglobaldir).

This did not measure login, message access, native SQLite use, upgrade preservation, installer scripts or
real accounts. macOS, Windows and Node 22.16.0 are configured in the on-demand workflow and were not run on
this Linux host. The site's PowerShell installer check remains separate because it tests persistent PATH
and agent setup. A successful `--help` cannot establish that blocked dependency install scripts are harmless
for other commands.


## Platform validation

The first real Windows run failed before installation because Node escaped an already quoted
`cmd.exe` line. Further checks exposed bare batch-launcher resolution, selection of bundled npm
instead of the pin under an isolated HOME, and omission of the Windows platform marker required
by native install scripts. The runner resolves launchers from PATH, preserves its explicit quoting
and retains `OS=Windows_NT`; the workflow prepends a dedicated pinned-toolchain prefix.
Account/profile settings remain excluded from the environment.

[The corrected matrix](https://github.com/WireCatLabs/cli-testing/actions/runs/40110853350) passes
all 108 rows. The exact execution commit, tarball hashes, manager pins and platform versions are in
[the aggregate results](platforms-2026-10-24.json). Every platform runs the same 18 rows in the tool
table above, including publint, installation, exact CLI version and `--help`.

| System | Architecture | Node | Passed |
| --- | --- | --- | --- |
| Linux | x64 | 22.16.0 | 18/18 |
| Linux | x64 | 24.21.0 | 18/18 |
| macOS | arm64 | 22.16.0 | 18/18 |
| macOS | arm64 | 24.22.1 | 18/18 |
| Windows | x64 | 22.16.0 | 18/18 |
| Windows | x64 | 24.22.1 | 18/18 |

Reproduce the matrix from the reviewed checkout with `gh workflow run ux-install.yml --ref main
--repo WireCatLabs/cli-testing`; confirm the run's source commit before comparing it. To collect
its six passing artifacts and create a new aggregate:

```sh
node performance/startup/packed-install/collect-ci.mjs <run-id> <new-artifact-directory> <new-result.json>
```

The collector rejects incomplete or failed matrices and differing toolchain pins or tarball hashes.
CI artifacts expire after seven days; the workflow, exact package plan and execution commit remain
reproducible. Node 24 and runner-image selectors may resolve to newer patches/images on a later run;
each report records what actually executed. This validates the packed CLI install and help flow,
including native Windows postinstall, and does not establish login or message behavior.
