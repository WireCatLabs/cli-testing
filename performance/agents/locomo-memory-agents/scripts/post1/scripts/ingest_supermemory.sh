#!/bin/sh
cd /var/tmp/locomo-bench/harness
for c in conv-26 conv-30; do
  start=$(date +%s)
  python3 provider_retrieval.py --service supermemory --fixture /var/tmp/locomo-bench/fixtures/$c --output /var/tmp/locomo-bench/runs/ingest/supermemory-$c --rewrites verbatim --wait-minutes 40
  echo "$c wall $(( $(date +%s) - start ))s"
  sleep 2
done
