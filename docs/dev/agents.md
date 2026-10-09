# Running agents on cli-testing

The guards are copied from tg-cli's
[`docs/dev/agents.md`](https://github.com/leemour/tg-cli/blob/main/docs/dev/agents.md), where each was
measured; `bin/check-agents` proves they hold here.

## What an agent may do, and what stops it

| | How |
|---|---|
| **File edits only in this project, cli-messaging and cli-core** | [`.claude/hooks/writes-stay-inside.sh`](../../.claude/hooks/writes-stay-inside.sh) on Edit, Write and NotebookEdit, in every mode. Allowed: this checkout, cli-messaging, cli-core, the session's scratch folders and this project's memory. It refuses the guards themselves — `.claude/settings*.json` and `.claude/hooks/` in any checkout |
| **Shell commands in the same folders** | the Bash sandbox in [`.claude/settings.json`](../../.claude/settings.json): writes only there, to `max-cli/docs_ai/.git`, the pnpm and npm caches and `/tmp`. A `*` inside a folder name (`cli-messaging-*/**`) is ignored by the sandbox — measured 2026-10-04 — so a worktree beside the repositories stays read-only from the shell. **Every worktree goes in `.worktrees/` of this checkout**, which `.gitignore` excludes: `git -C ../cli-messaging worktree add .worktrees/<name>/cli-messaging …`. Local sockets are open, so the keyring over D-Bus works — `gh` needs it |
| **No way out of the sandbox** | [`.claude/hooks/sandbox-stays-on.sh`](../../.claude/hooks/sandbox-stays-on.sh) refuses any Bash call that asks for `dangerouslyDisableSandbox` |
| **Git** | over SSH: `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.npmrc` and `~/.pypirc` are unreadable; only `~/.ssh/id_ed25519.pub` and `known_hosts` are re-opened, and the SSH agent's socket signs and pushes. The sandbox masks `.git/config`, so **push without `-u`** and **branch with `--no-track`** |
| **Refused, in every mode** | `sudo` |

## Checking the guards

From a terminal, never from inside a Claude session:

```sh
bin/check-agents                 # a headless session in bypass mode tries each item; each says what must happen
bin/trust-folder <worktree>...   # a new worktree's .claude/settings.json is ignored until the folder is trusted
```

## The private trail

The plan, journal and decisions for this package live in max-cli's private `docs_ai`. Agents write
them only through a worktree in `.worktrees/`, never in the main `docs_ai` checkout, which other
sessions use:

```sh
git -C ../max-cli/docs_ai worktree add --no-track -b journal/<topic> "$PWD/.worktrees/private-<topic>" origin/main
```

Its commits and the journal's id counter land in `max-cli/docs_ai/.git`, which
[`bin/allow-private-trail`](../../bin/allow-private-trail), run by the owner from a terminal, opens
to the sandbox. Measured 2026-10-04: the journal written and merged this way.
