#!/usr/bin/env bash
# identity.sh <bin> <outdir> <commands-file> — runs each line of commands-file (args) against bin in an isolated home.
set -u
bin=$1; outdir=$2; cmds=$3
S=${WORK:-$(cd "$(dirname "$0")" && pwd)/work}
mkdir -p "$S"; iso=$(mktemp -d "$S/iso-XXXX")
mkdir -p "$outdir" "$iso"/{home,config,state,cache,data,tmp}
export HOME=$iso/home XDG_CONFIG_HOME=$iso/config XDG_STATE_HOME=$iso/state XDG_CACHE_HOME=$iso/cache XDG_DATA_HOME=$iso/data TMPDIR=$iso/tmp
export MESSAGING_STORE=$iso/store.db
unset DBUS_SESSION_BUS_ADDRESS
for p in TG MAX WA WHATSAPP ZM ZOOM MEMO DRIVE GCAL; do export ${p}_NO_UPDATE_CHECK=1; done
export NO_COLOR=1 CI=1
i=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  i=$((i+1))
  eval "args=($line)"
  node "$bin" "${args[@]}" >"$outdir/$i.out" 2>"$outdir/$i.err" </dev/null
  echo "exit=$?" >>"$outdir/$i.err"
  echo "$line" >"$outdir/$i.cmd"
done <"$cmds"
echo "$iso" >"$outdir/iso"
