#!/usr/bin/env bash
set -euo pipefail
BENCH_CORE=$(cd "$1" && pwd)
BENCH_HERE=$(cd "$(dirname "$0")" && pwd)
BENCH_WORK=$(mktemp -d "${TMPDIR:-/tmp}/mail-index-synthetic.XXXXXX")
mkdir -p "$BENCH_WORK/models"
MESSAGING_STORE="$BENCH_WORK/source.db" WIRECAT_STATE_DIR="$BENCH_WORK/state" node "$BENCH_HERE/seed-synthetic.mjs" "$BENCH_CORE" "$BENCH_WORK/source.db"
XDG_CONFIG_HOME="$BENCH_WORK/config" XDG_STATE_HOME="$BENCH_WORK/state" XDG_CACHE_HOME="$BENCH_WORK/cache" MESSAGING_STORE_SOURCE="$BENCH_WORK/source.db" MODELS_DIR="$BENCH_WORK/models" "$BENCH_HERE/run.sh" "$BENCH_CORE" 300 300 0
printf 'Synthetic fixture retained at %s\n' "$BENCH_WORK"
