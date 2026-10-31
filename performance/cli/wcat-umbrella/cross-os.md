# The `wcat` launcher on real installs: Linux, macOS, Windows

Checked 2026-10-31 in GitHub Actions with [`cross-os.mjs`](cross-os.mjs) beside this page and the workflow
[`wcat-cross-os.yml`](../../../.github/workflows/wcat-cross-os.yml). The start-up cost was measured on 2026-10-30
with [`hot-path.mjs`](hot-path.mjs) and [`cold-import.mjs`](cold-import.mjs).

## Why we ran it

Step 1 of cli-base's
[wcat umbrella plan](https://github.com/WireCatLabs/cli-base/blob/main/docs/dev/plans/2026-10-30-wcat-umbrella.md)
([cli-base PR #404](https://github.com/WireCatLabs/cli-base/pull/404)) works as follows:

- Each tool installs `wcat-<tool>`.
- On start, the tool writes a small `wcat` launcher into its bin folder: a `sh` script, or a `.cmd` and `.ps1` pair on
  Windows.
- `wcat tg …` then runs `wcat-tg …`.
- `wcat shortcuts add` makes short names.

cli-base's own tests run only on Linux, with an npm-like layout built by hand. The owner asked for a real install
check on Windows, macOS and Linux before the release (NEED-160 A). The question was whether the launcher, the
dispatch, the shortcuts and the repair work there. The answer decided whether cli-base 0.66.0 could ship.

## Setup

- GitHub-hosted runners: `ubuntu-latest`, `macos-latest` (arm64) and `windows-latest`, with Node 24.22.1.
- Package managers, pinned: npm 11.17.0, pnpm 12.11.2 and bun 1.3.14.
- cli-base is built and packed from the commit pinned in the workflow (`CLI_BASE_REF`). Its version still read 0.65.3
  before the release.
- The script packs two fixture CLIs, `wcat-fixture-alpha` and `wcat-fixture-beta`.
  - Each one's bin calls `wcatStart` first. It then answers `--version`, `args` (prints its arguments as JSON),
    `exit <n>` and `stdin`.
  - A local registry on `127.0.0.1` serves the fixtures and cli-base by name. Every other package is passed on to
    npmjs.
- Each package manager gets its own empty global folder: `NPM_CONFIG_PREFIX`, `PNPM_HOME` or `BUN_INSTALL`.
- Every check is typed as a command line into a shell: `bash` on Linux and macOS, and both `cmd` and PowerShell 7 on
  Windows.

```sh
node performance/cli/wcat-umbrella/cross-os.mjs <cli-base.tgz> <out-dir> [npm,pnpm,bun]
```

The checks, in order:

1. Install both fixtures. Run `wcat-alpha --version` once, then check that the launcher files are there, marked, and
   start `wcat-alpha`.
2. In each shell, check:
   - `wcat alpha --version`;
   - `wcat --help` and `wcat --json`, which list both tools with their descriptions;
   - `wcat beta exit 42`, which must exit with 42;
   - the arguments `"two words"`, `say "hi"` and `a&b`, which must arrive unchanged;
   - text piped into `wcat alpha stdin`;
   - `wcat nope --json`, which must exit 6 with `tool.not-installed`.
3. `wcat shortcuts add alpha`. Then, in each shell, the shortcut `alpha` must pass on `--version`, an exit code,
   the same arguments and stdin. Then `wcat shortcuts remove alpha`.
4. Uninstall alpha. `wcat` now fails, because its tool is gone. Run `wcat-beta` once, then check that the launcher
   starts `wcat-beta` and that `wcat beta --version` works in each shell.

## Results

Final run: [41150114335](https://github.com/WireCatLabs/cli-testing/actions/runs/41150114335), cli-base
`9785e6c`. Each job uploads `results.json` and `summary.md`.

| OS | npm 11.17.0 | pnpm 12.11.2 | bun 1.3.14 | shells |
| --- | --- | --- | --- | --- |
| Linux x64 | 23/23 | 23/23 | 23/23 | bash |
| macOS arm64 | 23/23 | 23/23 | 23/23 | bash |
| Windows x64 | 35/35 | 35/35 | 36/36 | cmd, PowerShell 7 |

Earlier runs found three bugs. Each was fixed in cli-base PR #404 before the final run:

| Run | Found | Fix |
| --- | --- | --- |
| local, before the first push | pnpm 12 keeps global commands in `$PNPM_HOME/bin`, not `$PNPM_HOME`, so no launcher was written | Look in `$PNPM_HOME/bin` first. Count a package under `PNPM_HOME` as pnpm's, whatever the folder is named |
| [41149422156](https://github.com/WireCatLabs/cli-testing/actions/runs/41149422156) | Windows, npm and pnpm, PowerShell: `a&b` reached the tool as `a`, then `cmd` ran `b`. PowerShell hands a `.cmd` its arguments unquoted | The `.ps1` launcher and shortcut start the `.ps1` that npm and pnpm write beside the `.cmd` |
| [41149422156](https://github.com/WireCatLabs/cli-testing/actions/runs/41149422156) | Windows, bun: the launcher was never repaired. bun leaves `wcat-alpha.exe` and `.bunx` behind after uninstall (as step 0 saw), so its tool looked installed | A target `.exe` counts as gone when the script its `.bunx` names is gone |

The second run, [41149717651](https://github.com/WireCatLabs/cli-testing/actions/runs/41149717651), confirmed the
PowerShell fix. It also recorded what the leftover `.bunx` holds: a UTF-16 path to the script, ending at `"`.

### What one start costs

These are cli-base's own costs on a tool's normal start, when it checks that the launcher works. Measured on Linux
x64, Node 24.19.0, 24 cores, at a load average of 10–22, so the numbers are noisy.

| What | Median |
| --- | ---: |
| `wcatStart` on a normal start, launcher kept: in-process, 2000 runs, warm file cache | 0.017 ms (p99 0.10 ms) |
| Loading `@wirecat/cli-base/wcat/start` cold, bundled with splitting as `cli-dev bundle` ships it: 41 paired runs | 2.1 ms |
| The same, unbundled (`dist/`, six files) | 3.9 ms |
| For comparison: a full PATH scan for every `wcat-*`, over 58 PATH entries | 2.3 ms |

```sh
node hot-path.mjs <cli-base>/dist <work-dir>
BASE_MODULE=<a trivial .mjs> node cold-import.mjs <cli-base>/dist/wcat/start.js 41
```

## What it showed

- **The launcher works with npm, pnpm and bun on all three systems** after the three fixes. Repair after an uninstall
  works too.
- **Dispatch keeps the exit code, stdin and quoted arguments**, through `bash`, `cmd` and PowerShell, both through
  `wcat` and through a shortcut.
- **On Windows, a PowerShell wrapper must not start a `.cmd` with user arguments.** PowerShell does not quote them
  for `cmd`. The same applies to anything else that wraps npm's `.cmd` files.
- **Loading the module costs more than the check itself.** The check is a few `stat` calls. Loading is about 2 ms
  in a bundled CLI, against a Node start of about 25 ms.

## What was not checked

- Windows PowerShell 5.1, Git Bash on Windows (no extensionless launcher is written there), zsh and fish.
- Volta, Yarn, mise and nvm. Global folders at the package managers' default places: every run used a throwaway
  folder.
- An upgrade of a tool, and two tools starting at the same moment.
- Signals other than through the Linux test in cli-base (SIGTERM passed on).
- A PNPM_HOME unset at run time, as when an AI app starts a tool without the shell's environment. No launcher is
  written then.
- The start-up cost on macOS and Windows.
