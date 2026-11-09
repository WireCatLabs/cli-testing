#!/usr/bin/env bash
# Usage: sweep.sh <cli-core checkout> <output folder> [lock file]
# One run at a time; each run is its own process, so /usr/bin/time's peak RSS is that run's alone.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
core=$1 out=$2 lock=${3:-/tmp/embedding-batches.lock}
texts=${TEXTS:-2000}
mkdir -p "$out"
run() {
  local model=$1 batch=$2 window=$3 name=$1-b$2-w$3
  flock "$lock" /usr/bin/time -f "%M" -o "$out/$name.rss" \
    bun "$here/bench.ts" --cli-core "$core" --model "$model" --batch "$batch" --window "$window" \
    --texts "$texts" --out "$out/$name.f32" >"$out/$name.json"
  echo "$(cat "$out/$name.json") peak_rss_mb=$(( $(cat "$out/$name.rss") / 1024 ))"
}
compare() { bun "$here/bench.ts" --compare "$out/$1-b0-w0.f32" "$out/$1-b$2-w$3.f32" --dims "$4"; }
for model in e5-small:384 embeddinggemma:768; do
  name=${model%%:*} dims=${model##*:}
  run "$name" 0 0
  for setup in "8 8" "16 0" "32 0" "16 128"; do
    set -- $setup
    run "$name" "$1" "$2"
    compare "$name" "$1" "$2" "$dims"
  done
done
