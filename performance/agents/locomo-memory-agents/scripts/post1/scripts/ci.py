"""95% intervals for post 1 tables. Per arm and setup: each question's score is its mean over
runs; the interval resamples questions (bootstrap, 10 000 draws). The paired column compares each setup with
'files' on the same questions and runs. A dataset fetch counts as wrong, as in summarize.py.
Usage: python3 -I ci.py <stage> [ids-file]"""
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path("/var/tmp/locomo-bench")
DRAWS = 10_000
stage = sys.argv[1]
only = set(Path(sys.argv[2]).read_text().strip().split(",")) if len(sys.argv) > 2 else None
network = ROOT / "runs/integrity/network.json"
fetched = {(r["stage"], r["arm"], r["setup"], r["run"], r["id"]) for r in json.loads(network.read_text())
           if r["kind"] == "dataset"} if network.exists() else set()
scores = defaultdict(lambda: defaultdict(list))
for judged in sorted((ROOT / "runs" / stage).glob("*/*/*/*/judged.json")):
    arm, setup, run, _ = judged.parent.relative_to(ROOT / "runs" / stage).parts
    for row in json.loads(judged.read_text())["rows"]:
        if only is None or row["id"] in only:
            wrong = (stage, arm, setup, run, row["id"]) in fetched
            scores[(arm, setup)][row["id"]].append(0 if wrong else row["correct"])
rng = random.Random(1)


def interval(values):
    n = len(values)
    means = sorted(sum(rng.choice(values) for _ in range(n)) for _ in range(DRAWS))
    return means[int(0.025 * DRAWS)], means[int(0.975 * DRAWS)]


print("| Arm | Setup | Questions | Runs | Correct | 95% interval | vs files (paired) |")
print("|---|---|---:|---:|---:|---|---|")
for (arm, setup), per_q in sorted(scores.items()):
    ids = sorted(per_q)
    mean = {q: sum(v) / len(v) for q, v in per_q.items()}
    total = sum(mean.values())
    lo, hi = interval([mean[q] for q in ids])
    base = scores.get((arm, "files"))
    paired = ""
    if base and setup != "files":
        common = [q for q in ids if q in base]
        diffs = [mean[q] - sum(base[q]) / len(base[q]) for q in common]
        dlo, dhi = interval(diffs)
        paired = f"{sum(diffs):+.1f} ({dlo:+.1f}…{dhi:+.1f})"
    runs = max(len(v) for v in per_q.values())
    print(f"| {arm} | {setup} | {len(ids)} | {runs} | {total:.1f} | {lo:.1f}–{hi:.1f} | {paired} |")
