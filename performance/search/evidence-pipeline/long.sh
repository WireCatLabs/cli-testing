#!/usr/bin/env bash
# Usage: long.sh SPLIT OUTDIR MODEL_CACHE PYTHON — the long-message measures (and, on blind, the follow-up gate)
set -euo pipefail
split=$1 out=$2 models=$3 python=$4
here=$(cd "$(dirname "$0")" && pwd)
[ ! -e "$out" ] || { echo "refuse to overwrite $out" >&2; exit 1; }
mkdir -p "$out"
fresh() {
  local t
  t=$(mktemp -d -p /var/tmp evidence-run-XXXXXX)
  HOME=$t MESSAGING_STORE=$t/store WIRECAT_STATE_DIR=$t/state TMPDIR=$t "$@"
}
cd "$here"
fresh "$python" -I validate.py "$split" > "$out/validate.json"
fresh node core/discover.mjs "$out/discovery.json" "questions/$split" corpus/"$split"/*.json \
  --question-mark-punctuation --digit-colon-literal
fresh /usr/bin/time -v -o "$out/pipeline.time" "$python" -I pipeline.py --split "$split" --discovery "$out/discovery.json" \
  --models "$models" --output "$out/arms.json" --pools 100 --budgets 8192 --fixed-models '' --mmr-lambda 0.9 --long
"$python" -I long_report.py "$out/arms.json" > "$out/report.md"
[ "$split" != blind ] || "$python" -I blind_gate.py "$out/arms.json" > "$out/gate.json"
echo "$out"
