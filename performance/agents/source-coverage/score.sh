#!/usr/bin/env bash
# Scores answer sheets blind: each sheet gets a random letter, and a separate agent scores it against the key without
# knowing whose it is. The letters are written to <out-dir>/blind-key.txt; do not show that file to the scorer.
# Usage: score.sh <key-file> <out-dir> <contestant>=<answers-file>...
set -euo pipefail
key=$(realpath "$1"); out=$(realpath -m "$2"); shift 2
model=${SCORE_MODEL:-claude-sonnet-5-5}
mkdir -p "$out/sheets"; cp "$key" "$out/sheets/key.md"; : > "$out/blind-key.txt"
letters=($(printf '%s\n' V W X Y Z Q R S T U | head -n $# | shuf))
i=0
for pair in "$@"; do
  letter=${letters[$i]}; i=$((i + 1))
  cp "$(realpath "${pair#*=}")" "$out/sheets/answers-$letter.md"
  echo "$letter=${pair%%=*}" >> "$out/blind-key.txt"
done
# SCORE_RULES names a file with other rules, for a question set laid out differently.
[ -n "${SCORE_RULES:-}" ] && rules=$(cat "$SCORE_RULES") || rules="Rules. Questions 1-10: 1 = the expected fact plus a source (chat and date); 0.5 = the fact without a source;
0 = not found or wrong. Mark CW (confidently wrong) when the sheet asserts a wrong fact without a hedge. Questions
11-15: count the checklist points found; a point counts when its main substance is present; list missing secondary
details in brackets. Strict variant: a point counts only with every element present."
cd "$out/sheets"
for sheet in answers-*.md; do
  letter=${sheet#answers-}; letter=${letter%.md}
  claude -p "You are a blind scorer. Read only key.md and $sheet in this folder; do not try to find out who wrote the
sheet. Score the sheet against the key. $rules
Write the scores in the layout the rules ask for; without one: a table for questions 1-10 (score and a short quote
with its chat and date), then for each of 11-15 the points found of the total, which ones, missing details in brackets
and the strict count, then totals: A of 10, B of 5 (each task = found/total), B strict of 5, and the number of CW." \
    --model "$model" --no-session-persistence --setting-sources project --allowedTools Read \
    > "$out/scores-$letter.md"
  echo "scored $letter"
done
