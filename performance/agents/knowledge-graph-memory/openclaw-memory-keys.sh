#!/usr/bin/env bash
# Gives each memory-plugin OpenClaw home (openclaw_runner.py install-plugin) its keys, read from the OS keyring:
#   the Anthropic key (service cli-memo, account anthropic) into that home's own auth store, on stdin;
#   the Supermemory or Mem0 key (service supermemory / mem0, account wirecat) into <home>/.openclaw/.env, mode 600,
#   which OpenClaw loads and substitutes into the plugin's "${KEY}" config value.
# No key reaches a command line, the screen or a log. The owner's ~/.openclaw is never touched.
# Usage: openclaw-memory-keys.sh [plugin ...]   (default: supermemory mem0; root from WIRECAT_OPENCLAW_ROOT)
set -euo pipefail

root=${WIRECAT_OPENCLAW_ROOT:-$HOME/.cache/wirecat-bench/openclaw}
openclaw=$root/pkg/node_modules/.bin/openclaw
[ -x "$openclaw" ] || { echo "OpenClaw is not installed in $root" >&2; exit 1; }
hide() { sed -E 's/(sk-ant|sm_|m0-)[A-Za-z0-9_-]*/<hidden>/g'; }

plugins=("$@")
[ ${#plugins[@]} -eq 0 ] && plugins=(supermemory mem0)

for plugin in "${plugins[@]}"; do
  case $plugin in
    supermemory) variable=SUPERMEMORY_OPENCLAW_API_KEY ;;
    mem0) variable=MEM0_API_KEY ;;
    *) echo "unknown plugin $plugin (supermemory or mem0)" >&2; exit 1 ;;
  esac
  base=$root/plugins/$plugin
  [ -f "$base/store.json" ] || { echo "$plugin is not installed: openclaw_runner.py install-plugin first" >&2; exit 1; }
  run() {
    env -i HOME="$base/home" OPENCLAW_HOME="$base/home" TMPDIR="$base/tmp" PATH="$root/node/bin:/usr/bin:/bin" \
      TERM=dumb TZ=UTC OPENCLAW_NO_AUTO_UPDATE=1 DBUS_SESSION_BUS_ADDRESS=disabled: MEM0_TELEMETRY=false \
      "$openclaw" "$@"
  }
  echo "== $plugin"
  secret-tool lookup service cli-memo account anthropic >/dev/null 2>&1 \
    || { echo "No key in the keyring under service cli-memo account anthropic" >&2; exit 1; }
  secret-tool lookup service "$plugin" account wirecat >/dev/null 2>&1 \
    || { echo "No key in the keyring under service $plugin account wirecat" >&2; exit 1; }

  secret-tool lookup service cli-memo account anthropic 2>/dev/null \
    | run models auth paste-api-key --provider anthropic --agent main 2>&1 | hide | tail -2

  # printf is a shell builtin, so the key is never an argument of a separate process.
  (umask 077 && printf '%s=%s\n' "$variable" "$(secret-tool lookup service "$plugin" account wirecat 2>/dev/null)" \
    > "$base/home/.openclaw/.env.new" && mv "$base/home/.openclaw/.env.new" "$base/home/.openclaw/.env")
  echo "$variable stored in $base/home/.openclaw/.env ($(stat -c %a "$base/home/.openclaw/.env"))"
  run models auth list --provider anthropic --agent main 2>&1 | hide | tail -2
done
