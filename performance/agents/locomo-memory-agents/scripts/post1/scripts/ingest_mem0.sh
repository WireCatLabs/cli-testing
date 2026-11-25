#!/bin/sh
cd /var/tmp/locomo-bench/harness
for c in conv-26 conv-30; do
  start=$(date +%s)
  python3 provider_retrieval.py --service mem0 --fixture /var/tmp/locomo-bench/fixtures/$c --output /var/tmp/locomo-bench/runs/ingest/mem0-$c --rewrites verbatim --wait-minutes 30
  echo "$c wall $(( $(date +%s) - start ))s exit $?"
  sleep 2
done
