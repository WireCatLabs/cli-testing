# Check a packed installation

Use the install suite before a release or when a package-manager update changes installation. It checks a
packed tarball, its global executable and a documented command without opening an account. Each tool supplies
its package, version, binary, documentation link and follow-up arguments in a plan.

Build cli-testing, install the exact versions in `INSTALL_PINS` from `src/ux.ts`, then run:

```sh
pnpm build
npm run ux:plan -- .install-tooling
node dist/main.js ux install <new-run-directory> .install-tooling/plan.json
```

The plan helper packs six exact published releases; edit those pins deliberately when selecting newer
releases. For a local candidate, replace a tool's `tarball` with its absolute packed path and set the expected
version. The install commands use the documented global-install form with that tarball substituted for the
package name. Each run prints one row per tool and package manager. `--help` is the initial account-free
follow-up; a tool repository can supply a different offline command. This does not exercise login or native
SQLite operations.

The plan has `reason`, a nonempty `managers` array (`npm`, `pnpm`, `bun`) and a `tools` array. Each tool has
`name`, `package`, `version`, `command`, `tarball`, `afterInstall` (arguments) and `documentation`. Paths are
resolved from the caller's working directory. A plan with `--help` as follow-up never needs a profile.

The runner verifies package-manager and publint versions, runs publint on each tarball, installs globally
into an isolated prefix, checks that prefix's launcher and exact version, then runs the follow-up command.
HOME, configuration, cache, state, npm config and the shared store point inside that row's directory. It
inherits only platform executable/temporary-directory settings, never messenger credentials or profiles.
The test bin directory precedes PATH, preventing a preinstalled CLI from satisfying the launcher check.
Install lifecycle scripts run with the selected manager's defaults; the suite records warnings about blocked
scripts and global PATH configuration. Warnings alone do not fail a row. Nonzero exits, wrong versions,
missing launchers and publint errors do. Raw stdout/stderr and the invoked commands are in each row's
`stages.json`; `install.json` records Node/system versions, tarball SHA256, pins, timestamps and all results.
Recorded plans cannot be overwritten; use a new directory after an interrupted run.

Operational results belong in a private run directory. Synthetic, account-free measurements can be retained
under `performance/` with their reproducer and a README explaining the question. Never commit account data.
The `Packed installation` workflow runs on demand or as a reusable workflow across Linux, macOS and Windows,
with Node 22.16.0 and 24. It retains diagnostics for seven days even when a row fails. It does not run on PRs.
The site's Windows installer check remains in cli-docs: it checks the website's PowerShell installer,
persistent PATH and agent skill setup, which differ from direct tarball installation.
