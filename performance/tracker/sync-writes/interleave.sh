#!/bin/sh
# Runs bench.test.ts in turns on two versions of the tracker sync, so both share the disk's load of the moment.
# CORE: a cli-core checkout holding the "after" code and src/tracker/zz-bench-sync-writes.test.ts.
# BEFORE: the commit to compare with. OUT: the results file. DIR: where the stores go.
set -e
CORE=${CORE:?a cli-core checkout}
BEFORE=${BEFORE:-origin/main}
OUT=${OUT:-$PWD/interleaved.txt}
DIR=${DIR:-/var/tmp}
FILES="src/tracker/sync.ts src/store/sqlite/tracker.ts"
KEEP=$(mktemp -d)
cd "$CORE"
for f in $FILES; do mkdir -p "$KEEP/after/$(dirname $f)" "$KEEP/before/$(dirname $f)"; cp $f "$KEEP/after/$f"; git show "$BEFORE:$f" > "$KEEP/before/$f"; done
for i in 1 2 3 4 5; do
  for v in before after; do
    for f in $FILES; do cp "$KEEP/$v/$f" $f; done
    echo "== $v round $i ($(uptime | sed 's/.*load/load/'))" >> "$OUT"
    BENCH_DIR=$DIR BENCH_RUNS=1 BENCH_OUT=$OUT pnpm exec vitest run src/tracker/zz-bench-sync-writes.test.ts >/dev/null 2>&1
  done
done
for f in $FILES; do cp "$KEEP/after/$f" $f; done
rm -r "$KEEP"
