#!/usr/bin/env bash
# Usage: reads.sh <store sandbox> <results file prefix> <rounds> <label>=<gcal bin.js>...
# Offline reads on one synthetic store (build-store.mjs), each command timed over every gcal build given, alternating,
# pinned to CPUs 0-3, each build with its own warm compile cache.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
D=$1; OUT=$2; ROUNDS=$3; shift 3
first=${1#*=}
id=$("$here/gcal-in.sh" "$D" "$first" personal events list week --json --limit 1 |
  node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).items[0].id)')
caches=$(mktemp -d)
n=0
while IFS= read -r cmd; do
  n=$((n + 1))
  node -e '
    const [here, store, caches, cmd, ...builds] = process.argv.slice(1)
    console.log(JSON.stringify(builds.map((pair) => {
      const [label, bin] = pair.split("=")
      return { label: `${label} | ${cmd}`, argv: [`${here}/gcal-in.sh`, store, bin, "personal", ...cmd.split(" "), "--json"],
        cache: `${caches}/${label}` }
    })))
  ' "$here" "$D" "$caches" "$cmd" "$@" > "$OUT-spec-$n.json"
  taskset -c 0-3 node "$here/ab.mjs" "$OUT-spec-$n.json" "$ROUNDS" "$OUT-$n.json"
  rm "$OUT-spec-$n.json"
done <<LIST
events list today
events list week
events show $id
search roadmap
search budget review
people list
links review
status
LIST
