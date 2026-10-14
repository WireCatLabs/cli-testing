#!/usr/bin/env bash
# Regenerates the set, checks it matches the committed one, and runs the chain with and without the certain rules.
set -euo pipefail
cd "$(dirname "$0")"
node generate.mjs | cmp - tasks.jsonl
node evaluate.mjs --certain plan
echo
node evaluate.mjs --certain none
