#!/usr/bin/env bash
# index-variants-facts.sh [work folder]: arm 5. Claude Haiku rewrites every record into facts, once, then all arms
# are scored again with the facts beside them. A second run reuses facts.json and calls nothing.
set -euo pipefail
work=$(realpath -m "${1:-$HOME/.cache/wirecat-bench/index-variants/facts}")
here=$(dirname "$(realpath "$0")")
mkdir -p "$work"
# Two copies at once both pay for every call (it happened on 2026-11-03); the second one stops here instead.
exec 9>"$work/.lock"
flock -n 9 || { echo "facts: another run is using $work; wait for it to finish" >&2; exit 1; }

# Read before D-Bus is turned off below: the keyring is reached over it. The key goes to one process's environment,
# never to argv, a URL or the screen.
key=$(secret-tool lookup service cli-memo account anthropic 2>/dev/null || true)

export HOME="$work/home" XDG_CONFIG_HOME="$work/home/.config" XDG_STATE_HOME="$work/home/.local/state"
export XDG_DATA_HOME="$work/home/.local/share" XDG_CACHE_HOME="$work/home/.cache"
export WIRECAT_STATE_DIR="$work/wirecat-state" WIRECAT_CONFIG_DIR="$work/wirecat-config"
export npm_config_cache="$work/npm-cache" DBUS_SESSION_BUS_ADDRESS="disabled:" TZ=UTC
mkdir -p "$HOME" "$work/pkg"
if [ ! -d "$work/pkg/node_modules/@anthropic-ai/sdk" ]; then
  echo '{"private":true}' >"$work/pkg/package.json"
  npm install --prefix "$work/pkg" --ignore-scripts --no-audit --no-fund --silent \
    @wirecat/cli-core@0.562.0 @anthropic-ai/sdk@1.4.0
fi
[ -d "$work/fixture" ] || python3 "$here/run.py" --self-check --output "$work/fixture" >/dev/null

if ! ANTHROPIC_API_KEY="$key" node "$here/extract_facts.mjs" "$work/pkg" "$work/fixture" "$work/facts.json"; then
  unset key
  echo "facts: extraction stopped; nothing above shows the key. With no key: secret-tool store --label='Anthropic' service cli-memo account anthropic" >&2
  exit 1
fi
unset key
node "$here/index_variants.mjs" "$work/pkg/node_modules/@wirecat/cli-core" "$work/fixture" \
  "$work/results-$(date -u +%Y%m%dT%H%M%SZ)" "$work/facts.json"
