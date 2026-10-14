#!/usr/bin/env bash
# Times a header-only probe of one memo mail account and prints totals only — never senders or subjects.
set -euo pipefail
account=${1:?usage: probe.sh <memo mail account>}
start=$(date +%s)
memo mail probe "$account" --json --limit-groups 1 |
  jq -c --arg s "$(( $(date +%s) - start ))" '{emails, gb: (.bytes / 1e9 | . * 100 | round / 100), groups, sent, seconds: ($s | tonumber)}'
