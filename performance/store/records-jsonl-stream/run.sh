#!/usr/bin/env bash
# Usage: [HEAP_CAP_MB=64] run.sh <cli-core package dir> [sizes...]   (sizes default to 0 1000 10000 100000 300000)
# One size at a time, each step its own process, on a throwaway store in a temp folder. With HEAP_CAP_MB the import
# runs under node --max-old-space-size and only the import is measured.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
core="$(cd "$1" && pwd)"
shift
sizes=("${@:-0 1000 10000 100000 300000}")
cap="${HEAP_CAP_MB:-}"
work="$(mktemp -d -t records-jsonl-XXXXXX)"
results="$here/results"
searches="$here/../../search/business-lane/results"
mkdir -p "$results" "$searches"
if [ -n "$cap" ]; then
  imports="$results/import-heap-$cap.jsonl"
  node_flags=(--max-old-space-size="$cap")
else
  imports="$results/import.jsonl"
  node_flags=()
  : >"$searches/search.jsonl"
fi
: >"$imports"

wait_for_memory() {
  while :; do
    available=$(free -g | awk '/^Mem:/ { print $7 }')
    [ "$available" -ge 8 ] && return
    echo "only ${available} GB available, waiting" >&2
    sleep 60
  done
}

for size in ${sizes[*]}; do
  file="$work/records-$size.jsonl"
  store="$work/store-$size.db"
  node "$here/generate.mjs" "$size" "$file"
  wait_for_memory
  MESSAGING_STORE="$store" /usr/bin/time -v -o "$work/time-$size.txt" \
    node ${node_flags[@]+"${node_flags[@]}"} "$here/import.mjs" "$core" "$file" "$store" >"$work/import-$size.json"
  peak_kb=$(awk -F': ' '/Maximum resident set size/ { print $2 }' "$work/time-$size.txt")
  node -e 'const r = JSON.parse(process.argv[1]); const cap = process.argv[4]; console.log(JSON.stringify({ records: +process.argv[2], ...(cap ? { heap_cap_mb: +cap } : {}), ...r, time_max_rss_mb: Math.round(process.argv[3] / 102.4) / 10 }))' \
    "$(cat "$work/import-$size.json")" "$size" "$peak_kb" "$cap" | tee -a "$imports"
  if [ "$size" -gt 0 ] && [ -z "$cap" ]; then
    wait_for_memory
    MESSAGING_STORE="$store" node "$here/../../search/business-lane/search.mjs" "$core" "$store" "$size" |
      tee -a "$searches/search.jsonl"
  fi
done
echo "temp folder: $work" >&2
