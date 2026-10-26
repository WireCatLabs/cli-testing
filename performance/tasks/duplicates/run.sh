#!/usr/bin/env bash
# Regenerates the set, checks it matches the committed one, runs the chain with and without the certain rules, and
# replays it with the messages linked to a task read and unread; then reads and replays the Spanish pairs.
set -euo pipefail
cd "$(dirname "$0")"
node generate.mjs | cmp - tasks.jsonl
node evaluate.mjs --certain plan
echo
node evaluate.mjs --certain none
echo
node linked.mjs
echo
node spanish.mjs
node linked.mjs spanish.jsonl results-spanish.json
