#!/usr/bin/env bash
# Usage: floor.sh SPLIT DISCOVERY_JSON OUTDIR MODEL_CACHE PYTHON
# Scores the meaning floors of PROTOCOL.md "Meaning floor" on a stored discovery run.
set -euo pipefail
split=$1 discovery=$2 out=$3 models=$4 python=$5
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
t=$(mktemp -d -p /var/tmp evidence-run-XXXXXX)
HOME=$t MESSAGING_STORE=$t/store WIRECAT_STATE_DIR=$t/state TMPDIR=$t \
  /usr/bin/time -v -o "$out/pipeline.time" "$python" -I "$here/pipeline.py" --split "$split" --discovery "$discovery" \
  --models "$models" --output "$out/floors.json" --pools 100 --budgets 8192 --mmr-lambda 0.9 --fixed-models '' \
  --floors 0.80,0.82,0.84,0.86,0.88
