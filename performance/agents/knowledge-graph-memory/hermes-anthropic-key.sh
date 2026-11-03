#!/usr/bin/env bash
# Gives each benchmark Hermes configuration the owner's Anthropic API key, read from the OS keyring
# (service cli-memo, account anthropic) and piped on stdin into that configuration's own throwaway auth store:
# it never reaches a command line, the screen or a log, and ~/.hermes is never touched.
# Usage: hermes-anthropic-key.sh [configuration ...]   (default: alone wirecat supermemory mem0)
set -euo pipefail

bench="${WIRECAT_BENCH:-$HOME/.cache/wirecat-bench}"
python="$HOME/.hermes/hermes-agent/venv/bin/python"
script="$HOME/.hermes/hermes-agent/hermes"
hide() { sed -E 's/sk-ant[A-Za-z0-9_-]*/<hidden>/g'; }

secret-tool lookup service cli-memo account anthropic >/dev/null 2>&1 \
  || { echo "No key in the keyring under service cli-memo account anthropic" >&2; exit 1; }
mkdir -p "$bench/codex-empty"

configs=("$@")
[ ${#configs[@]} -eq 0 ] && configs=(alone wirecat supermemory mem0)

for name in "${configs[@]}"; do
  base="$bench/hermes/$name"
  mkdir -p "$base/hermes-home" "$base/home"
  # setsid drops the controlling terminal: getpass then reads the key from the pipe instead of /dev/tty.
  run() {
    setsid -w env -i PATH="$PATH" LANG=C.UTF-8 HOME="$base/home" HERMES_HOME="$base/hermes-home" \
      CODEX_HOME="$bench/codex-empty" DBUS_SESSION_BUS_ADDRESS=disabled: PYTHONDONTWRITEBYTECODE=1 \
      "$python" "$script" "$@"
  }
  echo "== $name"
  if run auth list </dev/null 2>/dev/null | grep -q '^anthropic'; then
    echo "already has an Anthropic key"
    continue
  fi
  secret-tool lookup service cli-memo account anthropic 2>/dev/null \
    | run auth add anthropic --type api-key --label keyring 2>&1 | hide | grep '^Added' || true
  run auth list </dev/null 2>&1 | hide | grep -A1 '^anthropic' || echo "no Anthropic key stored for $name" >&2
done
