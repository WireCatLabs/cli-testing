#!/usr/bin/env bash
# Every model on both fixtures, one at a time; each run takes the shared lock on its own, so other agents can
# interleave. A run whose result file exists is skipped, so the script can be started again after a stop.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
lock=${HEAVY_LOCK:?set HEAVY_LOCK to the shared lock file}
out=${OUT:-$HOME/.cache/wirecat-bench/model-compare-results}
models=$HOME/.cache/wirecat-bench/models-compare
old=/var/tmp/claude/fastembed_cache
bench=$HOME/.cache/wirecat-bench
mkdir -p "$out"

run() {
  local fixture=$1 model=$2 cache=$3; shift 3
  local file=$out/$fixture-$model.json
  [ -e "$file" ] && { echo "skip $file"; return; }
  free -g | sed -n 2p
  flock "$lock" /usr/bin/time -v -o "$out/$fixture-$model.time" \
    uv run --with fastembed==0.9.1 python3 -I "$here/eval_models.py" --model "$model" --cache-dir "$cache" \
    --threads 4 --output "$file" "$@" > "$out/$fixture-$model.log" 2>&1
  echo "$(date +%T) $fixture $model exit $? $(tail -c 400 "$out/$fixture-$model.log" | tail -1 | cut -c1-300)"
}

v3=(--fixture "$bench/kg-fixture-v3" --paraphrased "$bench/kg-fixture-v3-paraphrased" --batch-size 32)
lb=(--fixture "$bench/lifebench/fixtures/fenghaoran" --batch-size 16)

run v3 embeddinggemma-300m "$old" "${v3[@]}"
run v3 e5-small "$old" "${v3[@]}"
run v3 gte-multilingual-base "$models" "${v3[@]}"
run v3 bge-m3 "$models" "${v3[@]}"
run v3 arctic-l-v2 "$models" "${v3[@]}"
run v3 qwen3-0.6b "$models" "${v3[@]}"
run lifebench gte-multilingual-base "$models" "${lb[@]}"
run lifebench bge-m3 "$models" "${lb[@]}"
run lifebench arctic-l-v2 "$models" "${lb[@]}"
run lifebench qwen3-0.6b "$models" "${lb[@]}"
run lifebench embeddinggemma-300m "$old" "${lb[@]}"
