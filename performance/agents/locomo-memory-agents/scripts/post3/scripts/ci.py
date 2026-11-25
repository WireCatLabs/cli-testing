"""95% intervals for post 3: Hermes + WireCat, one model per folder. Run 1 is the s2, s5 and s50
folders, run 2 the r2* folders (the latest per stage and conversation wins); an empty answer is wrong; each question's score is its mean over runs, the interval resamples
questions (bootstrap, 10 000 draws). The paired column compares with Hermes + DeepSeek Flash + WireCat from post 1
(3 runs) on the same questions. Usage: python3 -I ci.py"""
import json
import random
import re
from collections import defaultdict
from pathlib import Path

RUNS = Path("/var/tmp/locomo-bench-p3/runs")
BASE = Path("/var/tmp/locomo-bench/runs/full/hermes-deepseek-flash/wirecat")
DRAWS = 10_000
rng = random.Random(1)


def interval(values):
    means = sorted(sum(rng.choice(values) for _ in values) for _ in range(DRAWS))
    return means[int(0.025 * DRAWS)], means[int(0.975 * DRAWS)]


def per_question(folders):
    scores = defaultdict(list)
    for judged in folders:
        for row in json.loads(judged.read_text())["rows"]:
            scores[row["id"]].append(int(row["correct"]) if str(row["answer"]).strip() else 0)
    return {q: sum(v) / len(v) for q, v in scores.items()}, max(map(len, scores.values()))


base, _ = per_question(sorted(BASE.glob("*/*/judged.json")))
print("| Model | Questions | Runs | Correct | 95% interval | vs DeepSeek Flash (paired) |")
print("|---|---:|---:|---:|---|---|")
for model in sorted(p for p in RUNS.iterdir() if p.is_dir() and p.name != "probe"):
    latest = {}
    for judged in sorted(model.glob("*/judged.json"), key=lambda p: p.parent.name):
        m = re.fullmatch(r"(r2)?(s\d+)-(conv-\d+)-\d+", judged.parent.name)
        if m:
            latest[m.groups()] = judged
    if not latest:
        continue
    runs_of = defaultdict(list)
    for (r2, _, _), judged in latest.items():
        runs_of[bool(r2)].append(judged)
    scores = defaultdict(list)
    for folders in runs_of.values():
        for judged in folders:
            for row in json.loads(judged.read_text())["rows"]:
                scores[row["id"]].append(int(row["correct"]) if str(row["answer"]).strip() else 0)
    mean, runs = {q: sum(v) / len(v) for q, v in scores.items()}, max(map(len, scores.values()))
    ids = sorted(mean)
    lo, hi = interval([mean[q] for q in ids])
    diffs = [mean[q] - base[q] for q in ids if q in base]
    dlo, dhi = interval(diffs)
    print(f"| {model.name} | {len(ids)} | {runs} | {sum(mean.values()):.1f} | {lo:.1f}–{hi:.1f} | "
          f"{sum(diffs):+.1f} ({dlo:+.1f}…{dhi:+.1f}) |")
