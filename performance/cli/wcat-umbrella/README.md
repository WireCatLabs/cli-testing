# Two packages that declare the same `wcat` command

Measured 2026-10-30 in GitHub Actions on Linux, macOS and Windows, with [`measure.mjs`](measure.mjs) beside this page
and the workflow [`wcat-umbrella.yml`](../../../.github/workflows/wcat-umbrella.yml).

## Why we ran it

Every WireCat CLI installs one short command: `tg`, `max`, `wa`, `zm`, `drive`, `memo`. The owner hit the problem that
another program with the same name can sit earlier on PATH, and then an agent, an AI app or a script runs the wrong
program without any sign of it. cli-base's
[wcat umbrella plan](https://github.com/WireCatLabs/cli-base/blob/main/docs/dev/plans/2026-10-30-wcat-umbrella.md)
fixes this with unique `wcat-<tool>` commands and one `wcat` command that runs them, like `git` runs `git-foo`.

The `wcat` code lives in cli-base, so every CLI carries a copy. The question is how `wcat` gets onto PATH:

- **A.** Every CLI package also declares `"bin": { "wcat": … }`. This works only if a package manager accepts a second
  package that declares a command the first one already installed, without failing and without taking the file.
- **B.** cli-base creates the `wcat` link itself in the tool's bin folder. This works only if the package managers leave
  such a link alone, or if cli-base can repair what they do to it.

This page is step 0 of that plan: it measures both, and the time `wcat` adds, so the plan can pick A or B.

## Setup

- GitHub-hosted runners: `ubuntu-latest` (ubuntu24 20261026.354.1), `macos-latest` (macos26 20261013.0424.1),
  `windows-latest` (win25-vs2026 20261021.278.1). Node 24.22.1 (Linux, Windows) and 24.21.0 (macOS).
- Package managers, pinned: npm 11.17.0, pnpm 12.11.2, bun 1.3.14, and Volta 2.0.2 (downloaded from its GitHub release
  and checked against a sha256 in the workflow) running Node 22.16.0.
- Fixtures, made and packed with `npm pack` by the script; nothing is published:
  - `wcat-fixture-a@1.0.0`: bins `wcat` (a small dispatcher) and `wcat-a`;
  - `wcat-fixture-b@1.0.0`: bins `wcat` and `wcat-b`;
  - `wcat-fixture-c@1.0.0` and `@1.1.0`: bin `wcat-c` only. For the upgrade test these are served by name from a local
    registry that the script starts on `127.0.0.1`, because bun refuses to replace one global tarball with another
    ("has a dependency loop").
- Every scenario gets its own empty global folder: npm `NPM_CONFIG_PREFIX`, `PNPM_HOME`, `BUN_INSTALL`, `VOLTA_HOME`.
- Each command `wcat` resolves to is run, and its answer (`wcat from wcat-fixture-a@1.0.0`) shows which package owns it.

```sh
node performance/cli/wcat-umbrella/measure.mjs <out-dir> [npm,pnpm,bun,volta]
```

The scenarios:

1. **Same bin in two packages.** Install a, install b, then uninstall a and b. Run twice: uninstalling a first, and b
   first.
2. **A link the manager did not make.** Install c@1.0.0. Add `wcat` in the same bin folder, pointing at c's
   `wcat-c.js`, as option B would: a symlink on Linux and macOS; on Windows the same three files npm writes (`wcat`,
   `wcat.cmd`, `wcat.ps1`), each running `node <path to wcat-c.js>`. Upgrade c to 1.1.0, then uninstall c.
3. **Time.** With npm, `wcat-a --version` against `wcat a --version`, where `wcat` finds `wcat-a` on PATH and starts it
   with inherited stdio. On Windows both go through `cmd` (`shell: true`), because Node cannot start a `.cmd` file
   without it. 3 warm-up pairs, then 20 alternating pairs; the median of each.

Runs: [41038310138](https://github.com/WireCatLabs/cli-testing/actions/runs/41038310138) (first version of the
script), [41038711678](https://github.com/WireCatLabs/cli-testing/actions/runs/41038711678) and
[41038989824](https://github.com/WireCatLabs/cli-testing/actions/runs/41038989824) (the tables below). Each job
uploads `results.json` with full output and exit codes as an artifact.

## Results

### 1. Two packages declaring `wcat`

The same on Linux, macOS and Windows, except where a cell says otherwise.

| manager | second install | exit | `wcat` after it | `wcat-b` | uninstall the owner of `wcat` | uninstall the other one |
| --- | --- | ---: | --- | --- | --- | --- |
| npm | **fails**: `EEXIST: file already exists … run npm with --force to overwrite files recklessly` | 1 | still a | not installed | `wcat` removed | `wcat` untouched |
| pnpm | **fails**: `ERR_PNPM_GLOBAL_BIN_CONFLICT … binary "wcat" would conflict with "wcat-fixture-a" that is already installed globally` | 1 | still a | not installed | `wcat` removed | `wcat` untouched |
| bun | **overwrites, silently**: nothing on stderr | 0 | now b | installed | `wcat` removed, though a is still installed; on Windows `wcat.exe` and `wcat.bunx` stay and fail | `wcat` untouched (still b) |
| Volta (Linux, macOS) | **fails**: `Volta error: Executable 'wcat' is already installed by wcat-fixture-a. Please remove wcat-fixture-a before installing wcat-fixture-b` | 126 | still a | not installed | `wcat` removed | `wcat` untouched |
| Volta (Windows) | not measured, see below | | | | | |

Whatever the order, the whole second package is refused by npm, pnpm and Volta: its own `wcat-b` is not installed
either.

### 2. A `wcat` link that cli-base made, pointing into c

| manager | after upgrading c 1.0.0 → 1.1.0 | after uninstalling c |
| --- | --- | --- |
| npm | kept; runs c@1.1.0 | kept, broken: a dangling symlink; on Windows the three files stay and fail with exit 1 |
| pnpm | kept, **broken**: the target was in c's versioned folder in pnpm's store (`.pnpm/wcat-fixture-c@1.0.0/…`) | kept, broken |
| bun | kept; runs c@1.1.0 | Linux, macOS: **removed by bun**. Windows: kept, broken |
| Volta (Linux, macOS) | kept; runs c@1.1.0 | kept, dangling |

In every case c's own `wcat-c` behaved normally: upgraded, then removed. One exception: bun on Windows leaves
`wcat-c.exe` and `wcat-c.bunx` behind after uninstalling, and they fail. Bun does the same in scenario 1, so this is
bun's behaviour for every package on Windows, not something the extra link caused.

### 3. Time `wcat` adds

Median of 20 runs, in ms, for each of the three runs:

| OS | `wcat-a --version` | `wcat a --version` | added |
| --- | ---: | ---: | ---: |
| Linux | 31.4 / 21.6 / 30.7 | 62.9 / 43.2 / 61.5 | 31.5 / 21.6 / 30.8 |
| macOS | 31.8 / 36.4 / 42.5 | 63.8 / 75.2 / 87.5 | 32.0 / 38.8 / 45.0 |
| Windows | 47.2 / 71.4 / 55.4 | 94.6 / 143.8 / 111.8 | 47.3 / 72.4 / 56.3 |

## What it showed

- **Option A is out.** npm, pnpm and Volta refuse to install a second package that declares `wcat`, and refuse the
  whole package. With A, installing a second WireCat CLI would fail for most people. bun installs it, but takes the
  file without a warning and removes `wcat` when its current owner goes, even while the other tool is still
  installed.
- **Option B works, if cli-base repairs the link on every run.** No manager removed or changed a link it did not make
  on install or upgrade. Uninstalling the package it points into leaves it dangling (npm, pnpm, Volta; on Windows the
  `.cmd`/`.ps1` files stay and fail), except bun on Linux and macOS, which removes it.
- **The link must not point at a versioned path.** pnpm keeps each version in its own folder in the store, so a link
  to c's file broke on the first upgrade. npm, bun and Volta keep the path across an upgrade. B needs a target that
  survives upgrades on every manager, for example a small script that starts an installed tool's stable command
  (`wcat-tg`) rather than a file inside its package.
- **`wcat` costs one more Node start**: about 20–30 ms on Linux, 30–45 ms on macOS and 45–70 ms on Windows, where `cmd`
  adds its own start. The plan already has MCP servers and WireCat Desktop call `wcat-tg` directly; these numbers
  support that.

## What was not measured

- **Volta on Windows.** Volta's Windows zip has no `node`/`npm` shims (its MSI installs them, which needs
  administrator rights). With `npm.exe` copied from `volta-shim.exe`, npm still installed into the runner's own Node
  folder and Volta's bin folder stayed empty, so those rows measure plain npm, not Volta. Volta is also
  [unmaintained](https://github.com/volta-cli/volta#readme), as its README says.
- **Yarn** global installs, **mise**, **nvm** with several Node versions, and Homebrew's Node.
- `npm install -g --force`, which overwrites, and the pnpm and bun equivalents.
- A real cli-base dispatcher. The fixture's dispatcher only searches PATH and spawns; it reads no `--wcat-describe`
  answers.
- The upgrade of a package that itself declares `wcat` (option A) across versions.
- PowerShell: on Windows the shims were started through `cmd`, not through `wcat.ps1`.
