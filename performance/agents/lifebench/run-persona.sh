#!/usr/bin/env bash
# One persona end to end: the memo store (words, then e5-small hybrid), then vectors alone with two models.
# MEMO_BASELINE is knowledge-graph-memory/memo_baseline.py of branch perf/kg-memory-10k-prep (c5eac56); main's copy
# cannot load mail on memo 0.131.50. NOISY=1 also runs it unchanged, every mail and note titled rNNNN.
set -euo pipefail

persona=${1:?usage: run-persona.sh <persona>}
here=$(cd "$(dirname "$0")" && pwd)
bench=${WCATBENCH_ROOT:-$HOME/.cache/wirecat-bench}
baseline=${MEMO_BASELINE:?set MEMO_BASELINE to knowledge-graph-memory/memo_baseline.py of perf/kg-memory-10k-prep}
fixture=$bench/lifebench/fixtures/$persona
export PATH=$bench/memo-pkg-0.131.50/node_modules/.bin:$PATH

python3 -I -B "$here/memo_clean.py" --baseline "$baseline" --fixture "$fixture" \
  --output "$bench/lifebench-memo-$persona" --memo memo --mail mail
if [[ ${NOISY:-0} == 1 ]]; then
  python3 -I -B "$baseline" --fixture "$fixture" --output "$bench/lifebench-memo-$persona-rnnnn" --memo memo --mail mail
fi
mkdir -p "$bench/lifebench/vectors"
for model in intfloat/multilingual-e5-small google/embeddinggemma-300m; do
  uv run --with fastembed python3 -I "$here/eval_embeddings.py" --fixture "$fixture" --model "$model" \
    --output "$bench/lifebench/vectors/$persona-${model##*/}.json"
done
