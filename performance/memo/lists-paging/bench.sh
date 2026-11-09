#!/usr/bin/env bash
# First-page timings of memo's lists on a throwaway store; median of RUNS runs, and the answer's size.
set -euo pipefail
memo="$1"
home="$2"
runs="${RUNS:-5}"
[ "$home" != "$HOME" ] || { echo "give a throwaway folder, not your HOME" >&2; exit 1; }
export HOME="$home" XDG_CONFIG_HOME="$home/.config" XDG_STATE_HOME="$home/.state" XDG_DATA_HOME="$home/.data"
export XDG_CACHE_HOME="$home/.cache" MESSAGING_STORE="$home/store.db" DBUS_SESSION_BUS_ADDRESS=disabled: AI_AGENT= CLAUDECODE=

measure() {
  local label="$1"
  shift
  local times=() bytes
  for _ in $(seq "$runs"); do
    local start end
    start=$(date +%s%N)
    bytes=$(node "$memo" "$@" | wc -c)
    end=$(date +%s%N)
    times+=($(((end - start) / 1000000)))
  done
  local median
  median=$(printf "%s\n" "${times[@]}" | sort -n | sed -n "$(((runs + 1) / 2))p")
  printf "| %-58s | %6s ms | %9s bytes |\n" "$label" "$median" "$bytes"
}

fields="id,kind,text,status,scope,subject,subject_name,project,project_name,created_at"
measure "memories list --limit 500 --json" memories list --limit 500 --json
measure "memories list --limit 500 --json=<10 fields>" memories list --limit 500 "--json=$fields"
measure "memories list --limit 500 --page 4 --json" memories list --limit 500 --page 4 --json
measure "facts list --limit 500 --json" facts list --limit 500 --json
measure "facts list --limit 500 --json=<10 fields>" facts list --limit 500 "--json=$fields"
measure "actions list --limit 500 --json" actions list --limit 500 --json
measure "actions list --limit 500 --brief --json" actions list --limit 500 --brief --json
measure "actions list --limit 500 --page 4 --brief --json" actions list --limit 500 --page 4 --brief --json
measure "memories list --limit 1 --json (start-up floor)" memories list --limit 1 --json
