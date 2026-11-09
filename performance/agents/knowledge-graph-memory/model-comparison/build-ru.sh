#!/usr/bin/env bash
# build-ru.sh [out folder]: builds the Russian v3 subset with Claude Haiku. Safe to run again: finished batches are
# read from the cache and not paid for twice.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bench=$HOME/.cache/wirecat-bench
out=${1:-$bench/kg-fixture-v3-ru-build}
exec 9>"$out.lock"
flock -n 9 || { echo "build-ru: another run is using $out; wait for it to finish" >&2; exit 1; }

# The key goes to one process's environment, never to argv, a URL or the screen.
key=$(secret-tool lookup service cli-memo account anthropic 2>/dev/null || true)
[ -n "$key" ] || { echo "build-ru: no key in the keyring under service cli-memo account anthropic" >&2; exit 1; }
ANTHROPIC_API_KEY="$key" uv run --with anthropic python3 -I "$here/build_ru.py" --v3 "$bench/kg-fixture-v3" \
  --paraphrased "$bench/kg-fixture-v3-paraphrased" --neighbours "$here/results" --out "$out"
