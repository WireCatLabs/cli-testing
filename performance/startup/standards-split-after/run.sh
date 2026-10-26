#!/usr/bin/env bash
# usage: ./run.sh <built max-cli before> <built max-cli after> [runs] — files, bytes and time of `max --version` and
# `max --help` on two real builds: before and after cli-base's standards split. Reuses ../what-the-cli-entry-loads.
set -euo pipefail

before=$(cd "$1" && pwd)
after=$(cd "$2" && pwd)
runs=${3:-21}
here=$(cd "$(dirname "$0")" && pwd)
tools="$here/../what-the-cli-entry-loads"
out=$(mktemp -d)
export HOME="$out/home"
mkdir -p "$HOME"

for build in "$before" "$after"; do
  base=$(node -p "require('$build/node_modules/@wirecat/cli-base/package.json').version")
  core=$(node -p "require('$build/node_modules/@wirecat/cli-core/package.json').version")
  echo "$(basename "$build"): max $(git -C "$build" rev-parse --short HEAD), cli-base $base, cli-core $core"
done
echo "node $(node --version)"

for args in --version --help; do
  for build in "$before" "$after"; do
    trace="$out/$(basename "$build")$args.tsv"
    TRACE_OUT="$trace" node --import "$tools/graph-hook.mjs" "$build/dist/bin/max.js" "$args" >/dev/null
    files=$(cut -f2 "$trace" | grep '^file:' | sort -u)
    bytes=$(echo "$files" | sed 's#^file://##' | xargs cat | wc -c)
    standards=$(echo "$files" | grep '/cli-base/dist/standards/' | sed 's#.*/##' | sort | tr '\n' ' ')
    echo "max $args $(basename "$build"): $(echo "$files" | wc -l) files, $bytes bytes, standards: $standards"
  done
done

for args in --version --help; do
  echo "max $args, median and min of $runs alternating runs:"
  node "$tools/time.mjs" "$runs" "- node $before/dist/bin/max.js $args" "- node $after/dist/bin/max.js $args"
done
echo "scratch: $out"
