#!/usr/bin/env bash
# Gives both benchmark OpenClaw agents the owner's Anthropic API key, read from the OS keyring
# (service cli-memo, account anthropic) and piped on stdin: it never reaches a command line, the screen or a log.
# OpenClaw keeps it in its own store inside the throwaway folder, which goes when that folder is cleaned up.
# Usage: openclaw-anthropic-key.sh [root]   (default ~/.cache/wirecat-bench/openclaw)
set -euo pipefail

root=${1:-$HOME/.cache/wirecat-bench/openclaw}
openclaw=$root/pkg/node_modules/.bin/openclaw
[ -x "$openclaw" ] || { echo "OpenClaw is not installed in $root" >&2; exit 1; }

run() {
  env -i HOME="$root/home" OPENCLAW_HOME="$root/home" TMPDIR="$root/tmp" PATH="$root/node/bin:/usr/bin:/bin" \
    TERM="${TERM:-xterm}" TZ=UTC OPENCLAW_NO_AUTO_UPDATE=1 DBUS_SESSION_BUS_ADDRESS=disabled: "$openclaw" "$@"
}
hide() { sed -E 's/sk-ant[A-Za-z0-9_-]*/<hidden>/g'; }

secret-tool lookup service cli-memo account anthropic >/dev/null 2>&1 \
  || { echo "No key in the keyring under service cli-memo account anthropic" >&2; exit 1; }

for agent in files memo; do
  echo "== $agent"
  secret-tool lookup service cli-memo account anthropic 2>/dev/null \
    | run models auth paste-api-key --provider anthropic --agent "$agent" 2>&1 | hide | tail -3
  run models auth list --provider anthropic --agent "$agent" 2>&1 | hide | tail -2
done
echo "== Claude models this key offers"
run models list --provider anthropic --refresh --agent files 2>&1 | hide | grep -i -E "model|sonnet|opus|haiku" | head -12
