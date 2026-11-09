#!/usr/bin/env bash
# guards.sh <store name> : the rare-word guard for #2667's merge, true cosine with each source's best first, and RRF k=3.
set -u
F="$(cd "$(dirname "$0")" && pwd)"; S=$1; BIN=$F/memo-src/dist/bin/memo.js
g() { python3 "$F/guard.py" "$S-$1" "$BIN" "$F/$S/memo" "${@:2}" 2>&1 | tail -1; }
g c2667 SPIKE_MERGE=neighbour SPIKE_NOSCORE=1
g cos-h1 SPIKE_MERGE=neighbour
g k3-h0 SPIKE_K=3 SPIKE_HEAD=0
g k3-h1 SPIKE_K=3 SPIKE_HEAD=1
g k60-h0 SPIKE_K=60 SPIKE_HEAD=0
