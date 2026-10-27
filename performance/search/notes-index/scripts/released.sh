#!/usr/bin/env bash
# released.sh <memo version> <question> [runs]
# Installs that memo globally, runs `memo search all <question>` read-only, and prints per run the seconds, the
# hit count and a hash of the 20 result refs — never the results themselves.
set -euo pipefail
version=$1 question=$2 runs=${3:-3}
npm install -g "@wirecat/cli-memo@$version" >/dev/null 2>&1
echo "memo $(memo --version | tail -1)"
for run in $(seq 1 "$runs"); do
  start=$(date +%s.%N)
  summary=$(memo search all "$question" --limit 20 --json 2>/dev/null | python3 -I -c '
import hashlib, json, sys
items = json.load(sys.stdin).get("items", [])
refs = "|".join(str(i.get("ref") or i.get("id")) for i in items)
print(len(items), hashlib.sha256(refs.encode()).hexdigest()[:12])')
  end=$(date +%s.%N)
  echo "run $run: $(python3 -c "print(round($end - $start, 2))") s, hits and refs hash: $summary"
done
