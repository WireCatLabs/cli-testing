#!/usr/bin/env bash
# Leaderboard-fairness check: memo may return only records dated on or before each question's ask time.
# Same stores, 20 records, answer model and judge as the unbounded 348/352-question runs. Resumable: every step skips
# what is already on disk (search rows, answers and verdicts are written one per line as they finish).
#
#   run-date-bounded.sh search    # memo searches with the date bound (free; Gemma queries under the heavy lock)
#   run-date-bounded.sh changed   # how many contexts changed, so how much answering and judging costs
#   run-date-bounded.sh answer    # answer the changed questions, reuse the rest; judge them; write the report
#   run-date-bounded.sh report    # tables only
# ONLY=e5-small (or embeddinggemma) limits a phase to one model.
set -euo pipefail

phase=${1:?search, changed, answer or report}
here=$(cd "$(dirname "$0")" && pwd)
B=${WCATBENCH_ROOT:-$HOME/.cache/wirecat-bench}
R=$B/lifebench/runs/leaderboard-style
K=${KG:-/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory}
LOCK=${HEAVY_LOCK:-/var/tmp/claude/claude-1000/-home-leemour-Projects-AI-wirecat-desktop/830d51be-bb40-4ef4-882d-f46fbe93cd19/scratchpad/heavy.lock}
export PATH=$B/memo-pkg-0.131.57/node_modules/.bin:$PATH
cd "$here"

# person, fixture, store suffix, folder of the unbounded answers and verdicts
persons=("fenghaoran $B/lifebench/pilots/fenghaoran-348 46 $R/348- $R/judge-348-"
         "maxiulan $B/lifebench/pilots/maxiulan-352 maxiulan $R/maxiulan/ $R/maxiulan/judge-")
models=("e5-small e5" "embeddinggemma gemma")

for person in "${persons[@]}"; do
  read -r p fixture suffix answers judged <<< "$person"
  out=$R/bounded/$p
  mkdir -p "$out"
  for model in "${models[@]}"; do
    read -r m short <<< "$model"
    [[ -n ${ONLY:-} && $m != "$ONLY" ]] && continue
    label="hybrid ($m), question verbatim"
    search=$out/search-$m.json
    name=memo-$short-top20
    case $phase in
      search)
        # e5-small queries are light; Gemma's query embedding waits for the heavy lock.
        lock=(); [[ $m == embeddinggemma ]] && lock=(flock "$LOCK")
        [[ -f $search ]] || "${lock[@]}" python3 -I -B context_search.py --baseline "$K/memo_baseline.py" \
          --store "$B/lifebench-memo-0.131.57-$m-$suffix" --fixture "$fixture" --label "$label" --limit 40 \
          --before-ask --output "$search" ;;
      changed)
        python3 -I - "$search" "$label" "${answers}$name/per-question.json" <<'PY'
import json, sys
new = {r["id"]: list(dict.fromkeys(r["hits"]))[:20] for r in json.load(open(sys.argv[1]))[sys.argv[2]]}
old = {r["id"]: r["context_records"] for r in json.load(open(sys.argv[3]))}
print(sys.argv[1], "changed contexts:", sum(new[q] != old[q] for q in old), "of", len(old))
PY
        ;;
      answer)
        [[ -f $out/$name/per-question.json ]] || python3 -I context_answer.py --fixture "$fixture" --top 20 \
          --setup "memo=$search#$label" --reuse "${answers}$name" --output "$out/$name" | grep -E "usd|reused"
        [[ -f $out/judge-$name.json ]] || python3 -I judge.py judge --fixture "$fixture" --run "$name=$out/$name" \
          --reuse "$name=${judged}$name.json" --workers 8 --output "$out/judge-$name.json" 2> "$out/judge-$name.log" \
          | grep -E "^$name:" ;;
    esac
  done
done
if [[ -z ${ONLY:-} && ( $phase == answer || $phase == report ) ]]; then
  for person in "${persons[@]}"; do
    read -r p fixture suffix answers judged <<< "$person"
    out=$R/bounded/$p
    python3 -I context_report.py --fixture "$fixture" \
      --run "gold=${answers}gold:${judged}gold.json" \
      --run "memo-e5-top20=$out/memo-e5-top20:$out/judge-memo-e5-top20.json" \
      --run "memo-gemma-top20=$out/memo-gemma-top20:$out/judge-memo-gemma-top20.json" \
      --output "$here/context-bounded-$p-results.json" > "$out/report.md"
  done
  python3 -I bounded_compare.py --output date-bounded-results.json
fi
