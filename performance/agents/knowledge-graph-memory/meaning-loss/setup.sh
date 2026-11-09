#!/usr/bin/env bash
# Builds, next to this script, the patched memo copy (memo-pkg/) and a copy of one benchmark store (<name>/memo).
# Usage: setup.sh [store folder under ~/.cache/wirecat-bench] [copy name]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BENCH="$HOME/.cache/wirecat-bench"
FROM="$BENCH/${1:-memo-0.131.50-search-v3-paraphrased}/memo"
NAME="${2:-store}"
PKG="$BENCH/memo-pkg-0.131.50/node_modules"

if [ ! -d "$HERE/memo-pkg" ]; then
  mkdir -p "$HERE/memo-pkg/node_modules/@wirecat"
  for entry in "$PKG"/* "$PKG"/.bin; do
    [ "$(basename "$entry")" = "@wirecat" ] || ln -s "$entry" "$HERE/memo-pkg/node_modules/"
  done
  for entry in "$PKG"/@wirecat/*; do
    [ "$(basename "$entry")" = "cli-memo" ] || ln -s "$entry" "$HERE/memo-pkg/node_modules/@wirecat/"
  done
  cp -a "$PKG/@wirecat/cli-memo" "$HERE/memo-pkg/node_modules/@wirecat/"
  python3 "$HERE/patch.py"
fi

mkdir -p "$HERE/$NAME/memo/wirecat-state"
(cd "$FROM" && cp -a home memo-config memo-state "$HERE/$NAME/memo/")
ln -sfn "$FROM/wirecat-state/models" "$HERE/$NAME/memo/wirecat-state/models"
cp "$FROM/wirecat-state/wirecat.db" "$HERE/$NAME/memo/wirecat-state/"
echo "store copy: $HERE/$NAME/memo"
