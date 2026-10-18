#!/usr/bin/env bash
# usage: ./run.sh <built max-cli checkout> [runs] — what cli-base's standards entry costs `max --version` and
# `max --help`, and what a runtime-only entry would leave. Reuses ../what-the-cli-entry-loads for tracing and timing.
set -euo pipefail

max=$(cd "$1" && pwd)
runs=${2:-21}
here=$(cd "$(dirname "$0")" && pwd)
tools="$here/../what-the-cli-entry-loads"
out=$(mktemp -d)
export HOME="$out/home"
mkdir -p "$HOME"

std=$(cd "$max" && node -p 'path.dirname(require.resolve("@wirecat/cli-base/standards"))')
dev="audit lint identifiers vocabulary"
dev_files="audit lint identifiers vocabulary flags-how flags-what"

grep -vE "from \"\./(${dev// /|})\.js\"" "$std/index.js" | sed "s#from \"\./#from \"$std/#" >"$out/runtime-index.js"
echo "import \"$std/index.js\"" >"$out/all.mjs"
echo "import \"$out/runtime-index.js\"" >"$out/runtime.mjs"

echo "cli-base $(node -p "require('$std/../../package.json').version"), node $(node --version)"
echo "standards files: $(ls "$std"/*.js | wc -l), $(cat "$std"/*.js | wc -c) bytes"
echo "dev-only files ($dev_files): $(for f in $dev_files; do cat "$std/$f.js"; done | wc -c) bytes"

for args in --version --help; do
  for variant in before after; do
    env=()
    [ "$variant" = after ] && env=(SPLIT_INDEX="$out/runtime-index.js")
    trace="$out/$variant$args.tsv"
    env "${env[@]}" TRACE_OUT="$trace" node --import "$here/split-hook.mjs" --import "$tools/graph-hook.mjs" \
      "$max/dist/bin/max.js" "$args" >/dev/null
    files=$(cut -f2 "$trace" | grep '^file:' | sort -u)
    bytes=$(echo "$files" | sed 's#^file://##' | xargs cat | wc -c)
    echo "max $args $variant: $(echo "$files" | wc -l) files, $bytes bytes, standards files: $(echo "$files" | grep -c '/dist/standards/')"
  done
done

echo "import() of the entry alone, median and min of $runs:"
cache="NODE_COMPILE_CACHE=$out/cache"
node "$tools/time.mjs" "$runs" "- node -e 0" "$cache node $out/all.mjs" "$cache node $out/runtime.mjs"
node "$here/dev-cost.mjs" "$out/runtime-index.js" "$std/index.js" "$runs"
for args in --version --help; do
  echo "max $args, median and min of $runs:"
  node "$tools/time.mjs" "$runs" \
    "- node --import $here/split-hook.mjs $max/dist/bin/max.js $args" \
    "SPLIT_INDEX=$out/runtime-index.js node --import $here/split-hook.mjs $max/dist/bin/max.js $args"
done
echo "scratch: $out"
