#!/usr/bin/env bash
# Signs the owner's ChatGPT (Codex) account into each benchmark configuration's own throwaway HERMES_HOME.
# Never touches ~/.hermes or ~/.codex. One device-code approval per configuration that is not signed in yet.
set -euo pipefail

bench="${WIRECAT_BENCH:-$HOME/.cache/wirecat-bench}"
python="$HOME/.hermes/hermes-agent/venv/bin/python"
script="$HOME/.hermes/hermes-agent/hermes"
mkdir -p "$bench/codex-empty"

for config in "${@:-alone wirecat supermemory mem0}"; do
  for name in $config; do
    base="$bench/hermes/$name"
    mkdir -p "$base/hermes-home" "$base/home"
    run() {
      env -i PATH="$PATH" TERM="${TERM:-xterm}" LANG=C.UTF-8 HOME="$base/home" HERMES_HOME="$base/hermes-home" \
        CODEX_HOME="$bench/codex-empty" DBUS_SESSION_BUS_ADDRESS=disabled: PYTHONDONTWRITEBYTECODE=1 "$python" "$script" "$@"
    }
    if run auth list 2>/dev/null | grep -q openai-codex; then
      echo "$name: already signed in"
      continue
    fi
    echo
    echo "== $name: sign in with your ChatGPT account (open the link, enter the code) =="
    run auth add openai-codex --type oauth --no-browser
  done
done
echo
echo "Done. Check: python3 $(dirname "$0")/hermes_runner.py --help"
