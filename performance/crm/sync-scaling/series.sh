#!/usr/bin/env bash
set -euo pipefail
core="$1"; out="$2"; shift 2
work="$(mktemp -d)"
mkdir -p "$work/home" "$out"
for n in "$@"; do
  HOME="$work/home" XDG_CONFIG_HOME="$work/home/.config" XDG_DATA_HOME="$work/home/.local/share" \
    XDG_STATE_HOME="$work/home/.local/state" XDG_CACHE_HOME="$work/home/.cache" \
    MESSAGING_STORE="$work/unused.db" DBUS_SESSION_BUS_ADDRESS=disabled: \
    node "$(dirname "$0")/bench.mjs" "$core" "$n" "$work" > "$out/n$n.json"
  node -e 'const d=require(process.argv[1]); for (const r of d.results) console.log(d.n, r.run, r.seconds+"s", "deal ms/item first/last tenth", r.dealMsFirstTenth, r.dealMsLastTenth, "rss", d.peakRssMb+"MB")' "$out/n$n.json"
done
echo "stores in $work"
