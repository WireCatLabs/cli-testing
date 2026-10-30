#!/usr/bin/env bash
# Usage: startup.sh <published dir> <bundled gcal checkout> <results dir> <rounds>
# Cold-start timings of gcal 0.1.1 as published, gcal bundled with `cli-dev bundle`, and drive, memo and tg as
# published, alternating, pinned to CPUs 0-3, each variant with its own warm compile cache.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
PUB=$1; BUNDLED=$2; OUT=$3; ROUNDS=$4
mkdir -p "$OUT"
caches=$(mktemp -d)
bin() { readlink -f "$PUB/node_modules/.bin/$1"; }
for args in "--version" "--help" "commands" "doctor"; do
  name=${args#--}
  node -e '
    const [caches, args, gcal, bundled, drive, memo, tg] = process.argv.slice(1)
    const variants = { "gcal 0.1.1": gcal, "gcal bundled": bundled, "drive 0.46.0": drive, "memo 0.123.0": memo, "tg 0.107.0": tg }
    console.log(JSON.stringify(Object.entries(variants).map(([label, file]) =>
      ({ label, argv: ["node", file, args], cache: `${caches}/${label.replace(/\W+/g, "-")}` }))))
  ' "$caches" "$args" "$(bin gcal)" "$BUNDLED/dist/bin/gcal.js" "$(bin drive)" "$(bin memo)" "$(bin tg)" > "$caches/spec-$name.json"
  echo "== $args"
  taskset -c 0-3 node "$here/ab.mjs" "$caches/spec-$name.json" "$ROUNDS" "$OUT/startup-$name.json"
done
for cli in gcal drive memo tg; do
  for args in --version --help; do
    : > "$OUT/.count"
    env -u DBUS_SESSION_BUS_ADDRESS HOME="$caches" MESSAGING_STORE="$caches/w.db" GCAL_NO_UPDATE_CHECK=1 DRIVE_NO_UPDATE_CHECK=1 \
      MEMO_NO_UPDATE_CHECK=1 TG_NO_UPDATE_CHECK=1 COUNT_OUT="$OUT/.count" \
      node --import "$here/count-modules.mjs" "$(bin $cli)" "$args" > /dev/null 2>&1 || true
    echo "{\"cli\":\"$cli\",\"args\":\"$args\",\"modules\":$(tail -1 "$OUT/.count")}"
  done
done > "$OUT/modules.jsonl"
: > "$OUT/.count"
env -u DBUS_SESSION_BUS_ADDRESS HOME="$caches" MESSAGING_STORE="$caches/w.db" GCAL_NO_UPDATE_CHECK=1 COUNT_OUT="$OUT/.count" \
  node --import "$here/count-modules.mjs" "$BUNDLED/dist/bin/gcal.js" --help > /dev/null 2>&1
echo "{\"cli\":\"gcal bundled\",\"args\":\"--help\",\"modules\":$(tail -1 "$OUT/.count")}" >> "$OUT/modules.jsonl"
rm -f "$OUT/.count"
