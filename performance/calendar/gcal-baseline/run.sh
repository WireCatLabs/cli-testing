#!/usr/bin/env bash
# Usage: run.sh <work dir from setup.sh> [rounds=15]
# Every measurement on this page, into results/. Takes about an hour on the machine in the README.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
WORK=$(cd "$1" && pwd); ROUNDS=${2:-15}
OUT=$here/results
mkdir -p "$OUT" "$WORK/stores"
"$here/startup.sh" "$WORK/pub" "$WORK/bundled" "$OUT" "$ROUNDS"
export BENCH_SYNC_ARGS="--timeout 30m"
for n in 5000 50000; do
  node "$here/build-store.mjs" "$WORK/stock" "$WORK/stores/stock-$n" "$n" > "$OUT/sync-stock-$n.json"
  node "$here/build-store.mjs" "$WORK/bundled" "$WORK/stores/cache-$n" "$n" > "$OUT/sync-cache-$n.json"
  "$here/reads.sh" "$WORK/stores/stock-$n" "$OUT/reads-$n" 10 stock="$WORK/stock/dist/bin/gcal.js" \
    bundled="$WORK/bundled/dist/bin/gcal.js" cache="$WORK/bundled/dist/bin/gcal-tsc.js"
done
for build in stock bundled; do
  taskset -c 0-3 node "$here/mcp-time.mjs" 15 gcal_read '{"command":"events list","arguments":{"words":["week"]}}' -- \
    "$here/gcal-in.sh" "$WORK/stores/stock-5000" "$WORK/$build/dist/bin/gcal.js" personal mcp serve > "$OUT/mcp-$build.json"
done
