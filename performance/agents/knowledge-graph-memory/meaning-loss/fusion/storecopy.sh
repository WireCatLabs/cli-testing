#!/usr/bin/env bash
# storecopy.sh <bench store folder> <copy name>: a writable copy of a benchmark store next to this script; the models
# folder is linked, not copied.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FROM="$HOME/.cache/wirecat-bench/$1/memo"
TO="$HERE/$2/memo"
rm -rf "$HERE/$2"; mkdir -p "$TO/wirecat-state"
for d in home memo-config memo-state wirecat-config; do [ -d "$FROM/$d" ] && cp -a "$FROM/$d" "$TO/"; done
ln -s "$FROM/wirecat-state/models" "$TO/wirecat-state/models"
cp "$FROM/wirecat-state/wirecat.db" "$TO/wirecat-state/"
echo "$TO"
