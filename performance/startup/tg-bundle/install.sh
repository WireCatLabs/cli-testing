#!/usr/bin/env bash
# install.sh <tarball> <dir> <npm|pnpm>: global install into <dir>, with HOME and XDG inside it; prints the tg path
set -eu
tb=$1; dir=$2; pm=$3
rm -rf "$dir"; mkdir -p "$dir/home"
export HOME=$dir/home XDG_CONFIG_HOME=$dir/home/.config XDG_DATA_HOME=$dir/home/.local/share XDG_STATE_HOME=$dir/home/.local/state XDG_CACHE_HOME=$dir/home/.cache MESSAGING_STORE=$dir/store.db WIRECAT_STATE_DIR=$dir/wstate
if [ "$pm" = npm ]; then
  npm install -g --prefix "$dir/prefix" --no-fund --no-audit --cache "${S_CACHE:?set S_CACHE to a cache folder}/npm" "$tb" >"$dir/install.log" 2>&1
  echo "$dir/prefix/bin/tg"
else
  export PNPM_HOME=$dir/pnpm PATH=$dir/pnpm/bin:$dir/pnpm:$PATH
  corepack pnpm add -g --store-dir "$S_CACHE/pnpm-store" "$tb" >"$dir/install.log" 2>&1
  ls "$dir/pnpm/bin/tg" "$dir/pnpm/tg" 2>/dev/null | head -1
fi
