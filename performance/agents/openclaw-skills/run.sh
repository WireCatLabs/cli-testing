#!/usr/bin/env bash
# Lists the skills OpenClaw sees, once with the WireCat CLIs on PATH and once without, in a throwaway home.
# Usage: run.sh <dir with node 24.22.1+ bin> <PATH entries holding the WireCat CLIs>
set -euo pipefail

node_bin=$1
cli_path=$2
openclaw_version=2026.10.8
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

PATH="$node_bin:/usr/bin:/bin" npm_config_cache="$work/npm" HOME="$work/home" \
  npm install --silent --no-audit --no-fund --prefix "$work/pkg" "openclaw@$openclaw_version"

mkdir -p "$work/home/.agents" "$work/ws"
cp -r "$HOME/.agents/skills" "$work/home/.agents/"

list() {
  (cd "$work/ws" && env -i HOME="$work/home" PATH="$1" TERM=dumb NO_COLOR=1 \
    "$work/pkg/node_modules/.bin/openclaw" skills list --json) |
    node -e '
      let s = ""
      process.stdin.on("data", d => s += d).on("end", () => {
        for (const x of JSON.parse(s).skills)
          if (/^(tg|max|whatsapp|zoom|drive)-cli$|^cli-memo$/.test(x.name))
            console.log(x.name, x.source, x.eligible ? "ready" : "missing " + x.missing.bins.join(","))
      })'
}

echo "== with the CLIs on PATH"
list "$node_bin:$cli_path:/usr/bin:/bin"
echo "== without them"
list "$node_bin:/usr/bin:/bin"
