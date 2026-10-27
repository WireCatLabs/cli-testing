#!/usr/bin/env bash
# usage: installed.sh <out dir> <tarball> <command> <commands file> <mcp args...>
# Installs the tarball under npm (a temp prefix) and pnpm (its own PNPM_HOME and store), then for each: the commands
# (identity.sh), one MCP session (mcp-session.mjs) and every rewritten file path in dist/bundle (assets-probe.mjs).
# Outputs land in <out dir>/npm and <out dir>/pnpm; compare two runs with compare.sh.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
out=$1 tarball=$2 cmd=$3 cmds=$4; shift 4
export WORK=${WORK:-$HERE/work}
mkdir -p "$out" "$WORK"
npm_prefix=$(mktemp -d "$WORK/npm-XXXX")
pnpm_home=$(mktemp -d "$WORK/pnpm-XXXX")
HOME=$npm_prefix/home npm_config_cache=${NPM_CACHE:-$WORK/npmcache} npm install -g --prefix "$npm_prefix/prefix" "$tarball" \
  --no-audit --no-fund >"$out/npm-install.log" 2>&1 || { echo "npm install failed"; exit 1; }
(cd "$pnpm_home" && HOME=$pnpm_home PNPM_HOME=$pnpm_home PATH=$pnpm_home/bin:$PATH \
  npx -y pnpm@11.28.8 add -g --store-dir "${PNPM_STORE:-$WORK/pnpm-store}" "$tarball" >"$out/pnpm-install.log" 2>&1) ||
  { echo "pnpm install failed, see $out/pnpm-install.log"; exit 1; }
for layout in npm pnpm; do
  if [ $layout = npm ]; then bin=$npm_prefix/prefix/bin/$cmd; else bin=$pnpm_home/bin/$cmd; fi
  [ -e "$bin" ] || { echo "no $bin"; exit 1; }
  if [ $layout = npm ]; then js=$(realpath "$bin"); else
    js=$(realpath "$(find -L "$pnpm_home/global" -path "*/node_modules/*/dist/bin/$cmd.js" -not -path "*/.pnpm/*" | head -1)"); fi
  "$HERE/identity.sh" "$js" "$out/$layout" "$cmds"
  iso=$(cat "$out/$layout/iso")
  (export HOME=$iso/home XDG_CONFIG_HOME=$iso/config XDG_STATE_HOME=$iso/state XDG_CACHE_HOME=$iso/cache XDG_DATA_HOME=$iso/data
   export MESSAGING_STORE=$iso/store.db TMPDIR=$iso/tmp; unset DBUS_SESSION_BUS_ADDRESS
   node "$HERE/mcp-session.mjs" "$js" "$@" >"$out/$layout/mcp.json" 2>"$out/$layout/mcp.err") || echo "$layout: MCP session FAILED"
  bundle=$(dirname "$(dirname "$js")")/bundle
  if [ -d "$bundle" ]; then
    cp "$HERE/assets-probe.mjs" "$bundle/zz-assets-probe.mjs"
    node "$bundle/zz-assets-probe.mjs" >"$out/$layout.assets"; rm -f "$bundle/zz-assets-probe.mjs"
    echo "$layout: $(grep -c '^ok' "$out/$layout.assets") asset paths ok, $(grep -c '^MISSING' "$out/$layout.assets") missing"
  fi
  echo "$layout: $js"
done
