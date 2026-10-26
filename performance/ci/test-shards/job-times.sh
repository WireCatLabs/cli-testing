#!/usr/bin/env bash
# Job times of one GitHub Actions run, and its span from the first job's start to the last job's end.
#   job-times.sh <owner/repo> <run id>
set -euo pipefail
gh run view "$2" -R "$1" --json jobs -q '.jobs[] | select(.conclusion != "skipped" and (.completedAt | startswith("0001") | not)) | "\(.name)\t\(.startedAt)\t\(.completedAt)"' |
  python3 -c '
import sys, datetime as d
p = lambda s: d.datetime.fromisoformat(s.replace("Z", "+00:00"))
rows = [(n, p(s), p(e)) for n, s, e in (l.rstrip("\n").split("\t") for l in sys.stdin)]
for n, s, e in sorted(rows, key=lambda r: r[1]):
    print(f"{int((e - s).total_seconds()):5d}s  {s:%H:%M:%S}-{e:%H:%M:%S}  {n}")
print(f"span {int((max(r[2] for r in rows) - min(r[1] for r in rows)).total_seconds())}s")'
