#!/usr/bin/env bash
# usage: run.sh <scale> <build runtimes...>
set -euo pipefail
cd "$(dirname "$0")"
scale=$1; shift
dir=runs/x$scale; mkdir -p "$dir"
log=$dir/results.jsonl; : > "$log"
r() { "$@" 2>&1 | grep -v ExperimentalWarning | tee -a "$log"; }
r node bench.mjs "$dir/base.db" build:base "$scale"
for opt in base B A A2 C; do
  for b in "$@"; do
    cp "$dir/base.db" "$dir/$opt.run.db"
    [ "$opt" = base ] || r $b bench.mjs "$dir/$opt.run.db" build:$opt "$scale"
    if [ "$b" = node ]; then
      for q in node bun; do r $q bench.mjs "$dir/$opt.run.db" query:$opt "$scale"; done
      for q in node bun; do r $q bench.mjs "$dir/$opt.run.db" write:$opt "$scale"; done
      ls -l "$dir/$opt.run.db" | tee -a "$dir/sizes.txt"
    fi
    rm -f "$dir/$opt.run.db" "$dir/$opt.run.db-wal" "$dir/$opt.run.db-shm"
  done
done
