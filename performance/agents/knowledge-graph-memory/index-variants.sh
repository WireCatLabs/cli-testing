#!/usr/bin/env bash
# index-variants.sh <new work folder>: published cli-core, the fixture and both models, all inside that folder.
set -euo pipefail
work=$(realpath -m "$1")
here=$(dirname "$(realpath "$0")")
mkdir "$work"
export HOME="$work/home" XDG_CONFIG_HOME="$work/home/.config" XDG_STATE_HOME="$work/home/.local/state"
export XDG_DATA_HOME="$work/home/.local/share" XDG_CACHE_HOME="$work/home/.cache"
export WIRECAT_STATE_DIR="$work/wirecat-state" WIRECAT_CONFIG_DIR="$work/wirecat-config"
export npm_config_cache="$work/npm-cache" DBUS_SESSION_BUS_ADDRESS="disabled:" TZ=UTC
mkdir -p "$HOME" "$work/pkg"
echo '{"private":true}' >"$work/pkg/package.json"
npm install --prefix "$work/pkg" --ignore-scripts --no-audit --no-fund --silent @wirecat/cli-core@0.562.0
python3 "$here/run.py" --self-check --output "$work/fixture" >/dev/null
node "$here/index_variants.mjs" "$work/pkg/node_modules/@wirecat/cli-core" "$work/fixture" "$work/results"
