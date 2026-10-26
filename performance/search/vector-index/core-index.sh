#!/bin/sh
# usage: core-index.sh <n> <cli-core checkout, built> <store dir>
# Builds a synthetic store of <n> message vectors with cli-core's vector index, then measures the index against the
# scan in new processes, page cache dropped (cold) and full (warm). Appends JSON lines to core-results-<n>.jsonl.
set -eu
N=$1
CORE=$2
DIR=$3
OUT=$(cd "$(dirname "$0")" && pwd)/core-results-$N.jsonl
cd "$(dirname "$0")"
node core-index.mjs build "$DIR" "$N" "$CORE" | tee -a "$OUT"
PARAMS=$(tail -1 "$OUT" | node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0, "utf8")).build.params))')
evict() { python3 -I evict.py "$DIR"/wirecat.db "$DIR"/wirecat.db-wal "$DIR"/wirecat.db-shm; }
for c in all recent chat; do
  for mode in index scan; do
    for r in 1 2 3; do
      evict
      node core-index.mjs query "$DIR" "$CORE" mode=$mode case=$c label=cold params="$PARAMS" queries=1 >>"$OUT"
    done
    node core-index.mjs query "$DIR" "$CORE" mode=$mode case=$c label=prime params="$PARAMS" queries=1 >/dev/null
    for r in 1 2 3; do
      node core-index.mjs query "$DIR" "$CORE" mode=$mode case=$c label=warm params="$PARAMS" queries=6 >>"$OUT"
    done
  done
done
du -sh "$DIR" | tee -a "$OUT.du"
