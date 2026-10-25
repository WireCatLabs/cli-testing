#!/bin/sh
# usage: [STAGES=…] [QUERIES=20] run.sh <n> <cli-core checkout> [store root, default /var/tmp/vector-bench]
# Builds a synthetic store of <n> chunks and measures every candidate; appends JSON lines to results-<n>.jsonl.
set -eu
N=$1
CORE=$2
ROOT=${3:-/var/tmp/vector-bench}
DIR=$ROOT/s$N
OUT=$(dirname "$0")/results-$N.jsonl
NODE=${NODE:-node}
BUN=${BUN:-bun}
Q=${QUERIES:-20}
cd "$(dirname "$0")"

evict() { python3 -I evict.py "$DIR"/store.db "$DIR"/store.db-wal "$DIR"/ann/*.idx 2>/dev/null || true; }
# Each measurement twice in fresh processes: page cache dropped, then page cache hot.
both() {
  rt=$1; shift
  cmd=$1; dir=$2; shift 2
  evict; $rt bench.mjs "$cmd" "$dir" "$@" queries=$Q label=cold >>"$OUT"
  $rt bench.mjs "$cmd" "$dir" "$@" queries=$Q label=warm >>"$OUT"
}
index() { $NODE bench.mjs scan "$DIR" case=$1 variant=$2 explain=1 index=$3 >>"$OUT"; }

scans() {
  index conversation current drop
  for c in conversation image; do
    both $NODE scan "$DIR" case=$c variant=current
    for v in sql-only read-only view-dot; do $NODE bench.mjs scan "$DIR" case=$c variant=$v queries=$Q label=warm >>"$OUT"; done
    both $NODE scan "$DIR" case=$c variant=account-direct
    both $BUN scan "$DIR" case=$c variant=current
  done
  $NODE bench.mjs scan "$DIR" case=account variant=exact queries=$Q label=warm >>"$OUT"
  $NODE bench.mjs scan "$DIR" case=account variant=embeddings-only queries=$Q label=warm >>"$OUT"
}

type_position() {
  index image current type-position
  index conversation current type-position
  both $NODE scan "$DIR" case=image variant=current
  index image current drop
}

shortlist() {
  index conversation account-direct account-type
  index image shortlist account-type
  # With this index SQLite sorts the whole account on every page: one query is enough to show it.
  $NODE bench.mjs scan "$DIR" case=conversation variant=account-direct queries=2 label=warm >>"$OUT"
  $NODE bench.mjs scan "$DIR" case=image variant=account-direct queries=$Q label=warm >>"$OUT"
  for c in conversation image account; do
    for v in shortlist shortlist-i8 shortlist-i8-rescore; do both $NODE scan "$DIR" case=$c variant=$v; done
    both $BUN scan "$DIR" case=$c variant=shortlist
  done
}

vec0() {
  for v in vec0-f32 vec0-i8; do
    $NODE bench.mjs vec0 "$DIR" variant=$v build=1 >>"$OUT"
    for c in conversation image account; do
      for k in 100 400; do both $NODE vec0 "$DIR" case=$c variant=$v k=$k; done
    done
  done
  both $BUN vec0 "$DIR" case=conversation variant=vec0-f32 k=400
}

ann() {
  for lib in usearch usearch-i8 hnswlib; do
    $NODE bench.mjs ann "$DIR" lib=$lib build=1 >>"$OUT"
    load=view
    [ $lib = hnswlib ] && load=load
    for c in conversation image account; do
      for k in 100 400; do both $NODE ann "$DIR" case=$c lib=$lib k=$k load=$load; done
      # The search list is max(ef, k): a wider one buys recall with time.
      both $NODE ann "$DIR" case=$c lib=$lib k=400 ef=1024 load=$load
    done
    if [ $lib = usearch ]; then both $NODE ann "$DIR" case=conversation lib=$lib k=400 load=load; fi
  done
}

packed() {
  $NODE bench.mjs packed "$DIR" build=1 >>"$OUT"
  for c in conversation image account; do
    both $NODE packed "$DIR" case=$c
    both $BUN packed "$DIR" case=$c
  done
}

narrow() {
  for f in 0.1 0.01; do
    $NODE bench.mjs scan "$DIR" case=conversation variant=current since=$f queries=$Q label=warm >>"$OUT"
    for s in 400 4000; do
      $NODE bench.mjs packed "$DIR" case=conversation since=$f shortlist=$s queries=$Q label=warm >>"$OUT"
    done
  done
}

maintain() { $NODE bench.mjs maintain "$DIR" >>"$OUT"; }

[ -f "$DIR/store.db" ] || $NODE bench.mjs build "$DIR" n="$N" core="$CORE" >>"$OUT"
# STAGES picks up a run that stopped part way, e.g. STAGES="vec0 ann".
for stage in ${STAGES:-scans type_position shortlist vec0 ann packed narrow maintain}; do $stage; done
echo done >&2
