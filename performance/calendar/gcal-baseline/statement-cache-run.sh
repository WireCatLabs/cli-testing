#!/usr/bin/env bash
# Usage: statement-cache-run.sh <gcal-cli checkout> <built cli-core checkout> <work dir>
# Builds two gcal v0.1.1 worktrees, gives one the compiled driver of the cli-core checkout (swap-driver.mjs), then
# runs build-store.mjs on each in turn: three 5k pairs and one 50k pair, into results/statement-cache-*.jsonl.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
GCAL=$1; CORE=$(cd "$2" && pwd); WORK=$(mkdir -p "$3" && cd "$3" && pwd)
for variant in stock cache; do
  git -C "$GCAL" worktree add -q --detach "$WORK/$variant" v0.1.1
  (cd "$WORK/$variant" && pnpm install --frozen-lockfile > /dev/null && pnpm build > /dev/null)
done
node "$here/swap-driver.mjs" "$WORK/cache" "$CORE"
export BENCH_SYNC_ARGS="--timeout 30m"
unset DBUS_SESSION_BUS_ADDRESS
for n in 5000 5000 5000 50000; do
  for variant in stock cache; do
    store=$(mktemp -d "$WORK/store-$variant-$n-XXXX")
    node "$here/build-store.mjs" "$WORK/$variant" "$store" "$n" >> "$here/results/statement-cache-$variant-$n.jsonl"
  done
done
