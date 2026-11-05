#!/usr/bin/env bash
# Does wirecat-funnel keep Tailscale's log upload off? Builds the helper, starts it up to the Tailscale login link
# (no login), watches its connections and DNS lookups for 30 s, lists its files, stops it.
#   performance/funnel/logs-off/measure.sh /path/to/funnel-cli
set -euo pipefail
repo=${1:?path to a funnel-cli checkout}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
(cd "$repo" && CGO_ENABLED=0 nice -n 10 go build -p 4 -trimpath -ldflags "-s -w" -o "$work/wirecat-funnel" ./cmd/wirecat-funnel)
echo "binary: $(stat -c %s "$work/wirecat-funnel") bytes, $(cd "$repo" && go version | cut -d' ' -f3), $(uname -sm)"

export WIRECAT_FUNNEL_STATE_DIR="$work/state" GODEBUG=netdns=go+2
started=$(date +%s.%N)
state=$("$work/wirecat-funnel" start --json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["state"])')
echo "state after start: $state, $(python3 -c "print(round($(date +%s.%N) - $started, 2))") s"
pid=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "$work/state/control.json")

for _ in 1 2 3 4 5 6; do ss -tnpH | grep "pid=$pid," | awk '{print $5}'; sleep 5; done | sort | uniq -c \
  | sed 's/^/connection: /'
grep -oE 'hostLookupOrder\([^)]*\)' "$work/state/run.log" | sort | uniq -c | sed 's/^/lookup: /'
echo "log.tailscale.com resolves to: $(getent ahosts log.tailscale.com | awk '{print $1}' | sort -u | tr '\n' ' ')"
for f in "$work/state"/*; do echo "file: $(basename "$f") $(stat -c '%a %s' "$f")"; done

"$work/wirecat-funnel" stop >/dev/null
kill -0 "$pid" 2>/dev/null && echo "still running" || echo "stopped"
