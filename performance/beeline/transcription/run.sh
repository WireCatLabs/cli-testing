#!/usr/bin/env bash
# Usage: run.sh <profile> <beeline-cli checkout> [calls]
# Reads the profile's token from the keyring, then runs beeline in a throwaway HOME with no D-Bus,
# so the run never changes the owner's own state or keyring entry.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: $0 <profile> <beeline-cli checkout> [calls]" >&2; exit 2; }
profile=$1 root=$2 n=${3:-3}
BEELINE_TOKEN=$(secret-tool lookup service beeline-cli username "token:$profile" 2>/dev/null) || true
[ -n "$BEELINE_TOKEN" ] || { echo "no token for profile $profile" >&2; exit 1; }
export BEELINE_TOKEN
sandbox=$(mktemp -d); trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/data/WireCat/models"
ln -s "$HOME/.local/share/WireCat/models/audio" "$sandbox/data/WireCat/models/audio"
b() { HOME="$sandbox" XDG_CONFIG_HOME="$sandbox/config" XDG_DATA_HOME="$sandbox/data" XDG_STATE_HOME="$sandbox/state" \
  XDG_CACHE_HOME="$sandbox/cache" MESSAGING_STORE="$sandbox/wirecat.db" DBUS_SESSION_BUS_ADDRESS=disabled: \
  BEELINE_NO_UPDATE_CHECK=1 node "$root/dist/bin/beeline.js" "$profile" "$@"; }
since=$(node -p 'new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) + "T00:00:00Z"')
b meetings sync --since-time "$since" --json >/dev/null
start=$(date +%s.%N)
b meetings transcribe --max-meetings "$n" --json 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).item
const wall=(Date.now()/1e3)-Number(process.argv[1]);
console.log(`calls ${r.transcribed}, audio ${Math.round(r.audio_seconds)} s, wall ${Math.round(wall)} s, ` +
`speed ${(r.audio_seconds/wall).toFixed(1)}x real time, failed ${r.failed.length}`)})' "$start"
