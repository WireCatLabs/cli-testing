#!/usr/bin/env bash
# The best build end to end: a fresh store embedded from nothing (sync count, index time), both question sets on it,
# then the full-precision model on a copy of it.
set -euo pipefail
H=/home/leemour/.cache/wirecat-bench
V=$H/memo-src-vecstudy
LOCK=/var/tmp/claude/claude-1000/-home-leemour-Projects-AI-wirecat-desktop/830d51be-bb40-4ef4-882d-f46fbe93cd19/scratchpad/heavy.lock
K=/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory
MEMO=/home/leemour/Projects/AI/cli-memo-wt-gemma-bench/dist/bin/memo.js
ref=${1:?cli-core ref}
flock $LOCK $V/build.sh "$ref"
store=$H/memo-src-final-embeddinggemma-v3-paraphrased
[ -f $store/results.json ] || flock $LOCK python3 $K/memo_baseline.py --fixture $H/kg-fixture-v3-paraphrased --output $store \
  --memo $MEMO --model embeddinggemma
[ -f $V/variants/final-embeddinggemma/results.json ] || flock $LOCK python3 $V/variant.py --baseline $K/memo_baseline.py \
  --memo $MEMO --store $store --model embeddinggemma --output $V/variants/final-embeddinggemma
[ -f $V/variants/final-embeddinggemma-full/results.json ] || flock $LOCK python3 $V/variant.py --baseline $K/memo_baseline.py \
  --memo $MEMO --store $store --model embeddinggemma-full --seed-model $V/models/embeddinggemma-full \
  --output $V/variants/final-embeddinggemma-full
