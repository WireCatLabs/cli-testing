#!/usr/bin/env bash
# Recall of `search all` before and after, on every question set:
#   all_sets.sh BEFORE_MEMO_JS AFTER_MEMO_JS V3_STORE TENK_STORE
# A store is the `memo` folder memo_baseline.py leaves in its output; each run reads a copy, never the owner's store.
set -euo pipefail
here=$(dirname "$(readlink -f "$0")")
bench=$HOME/.cache/wirecat-bench
for memo in "$1" "$2"; do
  for rewrite in verbatim or; do
    for spec in "$3 reworded kg-fixture-v3-paraphrased --reworded" "$3 plain kg-fixture-v3" \
      "$4 plain kg-fixture-10k"; do
      read -r store label fixture flag <<<"$spec"
      printf '%s | %s | %s | %s | ' "$memo" "$fixture" "$label" "$rewrite"
      python3 "$here/hybrid_eval.py" --memo "$memo" --store "$store" --fixture "$bench/$fixture" \
        --rewrite "$rewrite" ${flag:-}
    done
  done
done
