#!/usr/bin/env bash
# variants.sh <store name> : the control (#2667's merge) and every RRF variant, reworded and original wording.
set -u
F="$(cd "$(dirname "$0")" && pwd)"; S=$1; BIN=$F/memo-src/dist/bin/memo.js
run() { python3 "$F/run.py" "$S-$1-$2" "$BIN" "$F/$S/memo" "$2" "${@:3}" 2>&1 | tail -1; }
for w in reworded plain; do
  run control $w SPIKE_MERGE=neighbour
  for k in 60 10 3; do for h in 1 0; do run k$k-h$h $w SPIKE_K=$k SPIKE_HEAD=$h; done; done
  run k60-h1-noscore $w SPIKE_K=60 SPIKE_HEAD=1 SPIKE_NOSCORE=1
done
