#!/usr/bin/env bash
# usage: pack.sh <repo> <out dir> <cli-dev bundle args...>
# before.tgz: tsc's dist/ alone, as the CLI shipped before. after.tgz: the same dist/ bundled by cli-dev bundle.
set -eu
repo=$1 out=$2; shift 2
mkdir -p "$out"
cd "$repo"
[ "$(git rev-parse --show-toplevel)" = "$repo" ] || { echo "not in $repo"; exit 1; }
npx tsc --build --force && rm -rf dist/bundle
f=$(npm pack --ignore-scripts --pack-destination "$out" 2>/dev/null | tail -1); mv "$out/$f" "$out/before.tgz"
npx tsc --build --force && ${CLI_DEV:-npx cli-dev} bundle "$@"
f=$(npm pack --ignore-scripts --pack-destination "$out" 2>/dev/null | tail -1); mv "$out/$f" "$out/after.tgz"
ls -l "$out"/before.tgz "$out"/after.tgz | awk '{print $5, $9}'
