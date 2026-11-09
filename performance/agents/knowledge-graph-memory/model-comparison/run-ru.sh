#!/usr/bin/env bash
# Gemma and bge-m3 on the Russian subset, its English control and the mixed case; one run per lock hold. A run whose
# result file exists is skipped, so the script can be started again after a stop.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
lock=${HEAVY_LOCK:?set HEAVY_LOCK to the shared lock file}
build=${BUILD:-$HOME/.cache/wirecat-bench/kg-fixture-v3-ru-build}
out=${OUT:-$here/results}
logs=$build/logs
declare -A cache=([embeddinggemma-300m]=/var/tmp/claude/fastembed_cache
                  [bge-m3]=$HOME/.cache/wirecat-bench/models-compare)
[ -e "$build/summary.json" ] || { echo "run-ru: $build is not built yet (build-ru.sh)" >&2; exit 1; }
mkdir -p "$logs"

for set in en ru mixed; do
  for model in embeddinggemma-300m bge-m3; do
    file=$out/ru-subset-$set-$model.json
    [ -e "$file" ] && { echo "skip $file"; continue; }
    free -g | sed -n 2p
    flock "$lock" /usr/bin/time -v -o "$logs/$set-$model.time" \
      uv run --with fastembed==0.9.1 python3 -I "$here/eval_models.py" --model "$model" --cache-dir "${cache[$model]}" \
      --fixture "$build/$set" --paraphrased "$build/$set-paraphrased" --batch-size 32 --threads 4 --output "$file" \
      > "$logs/$set-$model.log" 2>&1
    echo "$(date +%T) $set $model exit $?"
  done
done
