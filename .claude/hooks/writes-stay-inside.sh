#!/bin/sh
# Refuses an Edit, Write or NotebookEdit outside the folders agents may change: this project and its
# worktrees, cli-messaging and its worktrees, cli-core, the session's scratch folders and this
# project's memory. Runs in every permission mode, bypass included; the sandbox in settings.json
# holds shell commands to the same folders.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
main=$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")
beside=$(dirname "$main")
path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -n "$path" ] || exit 0
real=$(realpath -m -- "$path")
# The guards themselves are the owner's to change, in any checkout: an agent that could edit them could lift them.
case "$real" in
  */.claude/settings.json | */.claude/settings.local.json | */.claude/hooks/*)
    echo "refused: $real is one of the guards agents run under — the owner changes it" >&2
    exit 2
    ;;
esac
uid=$(id -u)
case "$real/" in
  "$main"/* | "$beside"/cli-tasks-*/* | "$beside"/cli-messaging/* | "$beside"/cli-messaging-*/* | "$beside"/cli-core/*) exit 0 ;;
  "$beside"/max-cli-private-wt-*/* | "$beside"/max-cli/docs_ai/.git/*) exit 0 ;;
  /tmp/claude-"$uid"/* | /var/tmp/claude/claude-"$uid"/*) exit 0 ;;
  "$HOME"/.*/projects/-home-*-cli-tasks*/memory/*) exit 0 ;;
esac
echo "refused: $real is outside the folders this project may change — $main, $beside/cli-messaging, $beside/cli-core (docs/dev/agents.md)" >&2
exit 2
