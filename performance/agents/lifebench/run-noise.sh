#!/usr/bin/env bash
# Run-to-run noise: the same question, the same 20 records, asked and judged again. A seeded sample of 70 questions
# per person, the same for both models, compared with the date-bounded run's verdicts. Resumable like
# run-date-bounded.sh (answers and verdicts land one per line; a rerun skips them).
#
#   /home/leemour/Projects/AI/cli-testing-wt-lifebench/performance/agents/lifebench/run-noise.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
B=${WCATBENCH_ROOT:-$HOME/.cache/wirecat-bench}
R=$B/lifebench/runs/leaderboard-style/bounded
cd "$here"
for person in "fenghaoran fenghaoran-348" "maxiulan maxiulan-352"; do
  read -r p fixture <<< "$person"
  sample=$R/noise/$p/fixture
  if [[ ! -f $sample/oracle.json ]]; then
    mkdir -p "$sample"
    python3 -I - "$B/lifebench/pilots/$fixture" "$sample" <<'PY'
import json, random, shutil, sys
from pathlib import Path
src, out = Path(sys.argv[1]), Path(sys.argv[2])
oracle = json.loads((src / "oracle.json").read_text())
ids = set(random.Random(20261109).sample(sorted(r["id"] for r in oracle), 70))
shutil.copyfile(src / "corpus.jsonl", out / "corpus.jsonl")
for name in ("oracle.json", "queries.json"):
    rows = [r for r in json.loads((src / name).read_text()) if r["id"] in ids]
    (out / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
PY
  fi
  for model in "e5-small e5" "embeddinggemma gemma"; do
    read -r m short <<< "$model"
    name=memo-$short-top20
    out=$R/noise/$p/$name
    [[ -f $out/per-question.json ]] || python3 -I context_answer.py --fixture "$sample" --top 20 \
      --setup "memo=$R/$p/search-$m.json#hybrid ($m), question verbatim" --output "$out" | grep -E '"usd"'
    [[ -f $R/noise/$p/judge-$name.json ]] || python3 -I judge.py judge --fixture "$sample" --run "$name=$out" \
      --workers 8 --output "$R/noise/$p/judge-$name.json" 2> "$R/noise/$p/judge-$name.log" | grep -E "^$name:"
  done
done
python3 -I noise_compare.py --output noise-results.json
