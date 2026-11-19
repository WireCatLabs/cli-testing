#!/usr/bin/env bash
# One question, one session, under a budget (round 4): each line of <questions-file> is asked alone through ask.sh,
# with budget.py stopping the session at BUDGET_SECONDS (60) or after BUDGET_CALLS (10) tool calls.
# Usage: daily.sh <contestant> <questions-file> <run-dir> [export-dir]
# Writes <run-dir>/<contestant>/answers.md (one numbered answer per question) and times.tsv.
set -euo pipefail
here=$(dirname "$(realpath "$0")")
who=$1; questions=$(realpath "$2"); run=$(realpath -m "$3"); edir=${4:-}
export ASK_RUNNER="python3 -I $here/budget.py"
export ASK_RULES="Answer within ${BUDGET_SECONDS:-60} seconds and ${BUDGET_CALLS:-10} tool calls; one command per call, no scripts."
mkdir -p "$run/$who"; : > "$run/$who/answers.md"; printf 'q\tseconds\ttool_calls\tbudget\n' > "$run/$who/times.tsv"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  n=${line%%.*}
  printf '%s\n' "$line" > "$run/$who/q$n.txt"
  "$here/ask.sh" "$who" "$run/$who/q$n.txt" "$run/q$n" $edir < /dev/null > /dev/null || true
  t="$run/q$n/$who/transcript.jsonl"
  answer=$(jq -rs 'map(select(.type == "result")) | last | .result // "out of budget: no answer"' "$t")
  calls=$(jq -s '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use")] | length' "$t")
  ms=$(jq -s 'map(select(.type == "result")) | last | .duration_ms // 0' "$t")
  budget=$(jq -rs 'map(select(.type == "result")) | last | if .subtype == "budget" then "out" else "in" end' "$t")
  printf '%s. %s\n\n' "$n" "${answer#"$n". }" >> "$run/$who/answers.md"
  printf '%s\t%s\t%s\t%s\n' "$n" "$((ms / 1000))" "$calls" "$budget" >> "$run/$who/times.tsv"
  echo "$who q$n: $budget, $calls calls, $((ms / 1000)) s"
done < "$questions"
