#!/usr/bin/env bash
# LifeBench pilot end to end: pilot fixture, an OpenClaw root of its own, the memo store and files workspace, then
# answers, the English judge and a per-category table. Free steps run on their own; nothing is spent without --yes.
#
#   run-pilot.sh [--memo-version 0.131.50] [--agents memo,files] [--only id,id] [--label pilot] [--max-usd 4] [--no-judge] [--yes]
#
# KG is performance/agents/knowledge-graph-memory of perf/kg-memory-10k-prep at 2a59831 (its runner and memo_baseline;
# the runner is unchanged since 676e46a). The judge needs the keyring, so it never runs with D-Bus off.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
bench=${WCATBENCH_ROOT:-$HOME/.cache/wirecat-bench}
kg=${KG:-/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory}
persona=fenghaoran
size=50
seed=20261108
version=0.131.50
agents=memo,files
only=
label=pilot
max_usd=4
yes=0
judge=1
model=anthropic/claude-sonnet-5-5
judge_model=deepseek/deepseek-chat
while (($#)); do
  case $1 in
    --memo-version) version=$2; shift 2 ;;
    --agents) agents=$2; shift 2 ;;
    --only) only=$2; shift 2 ;;
    --label) label=$2; shift 2 ;;
    --max-usd) max_usd=$2; shift 2 ;;
    --judge-model) judge_model=$2; shift 2 ;;
    --yes) yes=1; shift ;;
    --no-judge) judge=0; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

data=$bench/lifebench/src/life_bench_data/version2/data_en
pilot=$bench/lifebench/pilots/$persona-${size}u5
pkg=$bench/memo-pkg-$version
root=$bench/oc-lifebench-$persona-memo-$version
runs=$bench/lifebench/runs/memo-$version
runner=$kg/openclaw_runner.py
oc() { python3 -I -B "$here/openclaw_lifebench.py" --runner "$runner" --root "$root" "$@"; }

[[ $(git -C "$kg" rev-parse --short=7 HEAD) == 2a59831 ]] \
  || echo "note: $kg is at $(git -C "$kg" rev-parse --short=7 HEAD), not 2a59831" >&2
[[ -d $pilot ]] || python3 -I "$here/pilot.py" --fixture "$bench/lifebench/fixtures/$persona" \
  --qa "$data/$persona/QA_all/QA.json" --size "$size" --seed "$seed" --output "$pilot" > /dev/null
[[ -x $pkg/node_modules/.bin/memo ]] \
  || npm install --prefix "$pkg" --no-audit --no-fund "@wirecat/cli-memo@$version" > /dev/null
# memo_baseline imports mail through the mail CLI found on PATH.
export PATH=$pkg/node_modules/.bin:$PATH
command -v mail > /dev/null || { echo "the mail CLI is not on PATH" >&2; exit 1; }

if [[ ! -d $root ]]; then
  oc setup-root --from "$bench/openclaw-10k"
  "$kg/openclaw-anthropic-key.sh" "$root" > "$root/logs/anthropic-key.txt" 2>&1
  grep -q "anthropic:manual" "$root/logs/anthropic-key.txt" \
    || { echo "no Anthropic key given, see $root/logs" >&2; exit 1; }
fi
if [[ ! -f $root/prepare.json ]]; then
  echo "== prepare (free): memo $version store and OpenClaw's files index, $(date -u +%H:%M:%S)"
  free -g | sed -n 2p
  oc prepare --fixture "$pilot" --memo "$pkg/node_modules/.bin/memo" > "$root/logs/prepare.txt"
fi

count=$size
[[ -n $only ]] && count=$(tr ',' '\n' <<< "$only" | grep -c .)
smoke=()
for dir in "$runs"/smoke-*; do [[ -f $dir/per-question.json ]] && smoke+=(--smoke "$dir"); done
judged=()
[[ -f $runs/smoke/judge.json ]] && judged=(--judged "$runs/smoke/judge.json")
python3 -I "$here/judge.py" estimate --questions "$count" --agents "$agents" --model "$judge_model" \
  "${smoke[@]}" "${judged[@]}"
echo "  stops before the next question once \$$max_usd is spent on answers"
if ((!yes)); then
  echo "Nothing spent. Add --yes to run it."
  exit 0
fi

out=$runs/$label
mkdir -p "$out"
specs=()
for agent in ${agents//,/ }; do
  echo "== answers: $agent, $(date -u +%H:%M:%S)"
  status=0
  oc answer --fixture "$pilot" --agent "$agent" --model "$model" --output "$out-$agent" --max-usd "$max_usd" \
    ${only:+--only "$only"} > "$out-$agent.log" 2>&1 || status=$?
  grep -E "exit=|spent|stopped|not trusted" "$out-$agent.log" || true
  ((status == 0)) || { echo "the $agent run failed, see $out-$agent.log" >&2; exit 1; }
  specs+=(--run "$agent=$out-$agent")
done
((judge)) || exit 0
echo "== judge: $judge_model, $(date -u +%H:%M:%S)"
python3 -I "$here/judge.py" judge --fixture "$pilot" --model "$judge_model" "${specs[@]}" --output "$out/judge.json"
