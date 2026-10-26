#!/usr/bin/env bash
# Usage: run.sh SPLIT OUTDIR MODEL_CACHE PYTHON DISCOVER_FLAG|"" [pipeline.py options]
set -euo pipefail
split=$1 out=$2 models=$3 python=$4 discover_flag=$5
shift 5
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
fresh() {
  local t
  t=$(mktemp -d -p /var/tmp evidence-run-XXXXXX)
  HOME=$t MESSAGING_STORE=$t/store WIRECAT_STATE_DIR=$t/state TMPDIR=$t "$@"
}
fresh "$python" -I "$here/validate.py" "$split" > "$out/validate.json"
fresh node "$here/core/discover.mjs" "$out/discovery.json" "$here/questions/$split" "$here"/corpus/"$split"/*.json ${discover_flag:+"$discover_flag"}
fresh /usr/bin/time -v -o "$out/pipeline.time" "$python" -I "$here/pipeline.py" --split "$split" \
  --discovery "$out/discovery.json" --models "$models" --output "$out/arms.json" "$@"
"$python" -I "$here/report.py" "$out/arms.json" > "$out/report.md"
echo "$out/report.md"
