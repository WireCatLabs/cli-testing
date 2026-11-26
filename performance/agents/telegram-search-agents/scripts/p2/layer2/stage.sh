#!/usr/bin/env bash
# One stage: every arm given, both models, the ids given; arms one after another, never in parallel.
# Usage: stage.sh "<arms>" <H-id>...
set -u
cd "${EXP:-$HOME/.cache/wirecat-experiment-b}/p2/layer2"
arms=$1; shift
echo "== stage $(date +%T) ids: $*"; free -g | head -2; df -h /home | tail -1; uptime
for arm in $arms; do for model in haiku sonnet; do python3 -I run.py "$model" "$arm" "$@"; done; done
echo "== stage done $(date +%T)"
