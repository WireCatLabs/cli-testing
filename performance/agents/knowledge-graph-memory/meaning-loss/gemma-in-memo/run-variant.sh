#!/usr/bin/env bash
# run-variant.sh <label> <cli-core ref> [models...]: build memo on that cli-core commit, then score it on copies of the
# finished e5-small and EmbeddingGemma stores. Every step holds the machine-wide heavy lock.
set -euo pipefail
label=$1 ref=$2; shift 2
models=${*:-embeddinggemma e5-small}
H=/home/leemour/.cache/wirecat-bench
V=$H/memo-src-vecstudy
LOCK=/var/tmp/claude/claude-1000/-home-leemour-Projects-AI-wirecat-desktop/830d51be-bb40-4ef4-882d-f46fbe93cd19/scratchpad/heavy.lock
BASE=/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory/memo_baseline.py
flock $LOCK $V/build.sh "$ref"
for model in $models; do
  out=$V/variants/$label-$model
  [ -f $out/results.json ] && continue
  rm -rf $out
  flock $LOCK python3 $V/variant.py --baseline $BASE --memo /home/leemour/Projects/AI/cli-memo-wt-gemma-bench/dist/bin/memo.js \
    --store $H/memo-src-$model-v3-paraphrased --model $model --output $out
done
