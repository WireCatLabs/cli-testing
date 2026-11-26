#!/usr/bin/env python3
"""Prints the README's interval tables from data/*.jsonl, with the same bootstrap as post1/scripts/ci.py and
post3/scripts/ci.py (seed 1, 10,000 draws, a fresh generator per table, rows in the same order).
Post 1: a dataset fetch counts as wrong. Post 3: an empty answer counts as wrong; the reference is post 1's
Hermes + DeepSeek Flash + WireCat. Usage: python3 -I tables.py [data folder]"""

import json
import random
import sys
from collections import defaultdict
from pathlib import Path

DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data"
DRAWS = 10_000


def interval(rng, values):
    means = sorted(sum(rng.choice(values) for _ in values) for _ in range(DRAWS))
    return means[int(0.025 * DRAWS)], means[int(0.975 * DRAWS)]


def rows(name):
    return [json.loads(line) for line in (DATA / name).read_text().splitlines()]


def post1(stage, answers, also=None, arms=None):
    rng = random.Random(1)
    scores = defaultdict(lambda: defaultdict(list))
    for r in answers:
        if r["stage"] in (stage, also) and (arms is None or (r["arm"], r["setup"]) in arms):
            scores[(r["arm"], r["setup"])][r["id"]].append(0 if r["network"] == "dataset" else r["correct"])
    print(f"\nPost 1, stage {stage}{' + ' + also if also else ''}\n")
    print("| Arm | Setup | Questions | Runs | Correct | 95% interval | vs files (paired) |")
    print("|---|---|---:|---:|---:|---|---|")
    for (arm, setup), per_q in sorted(scores.items()):
        ids = sorted(per_q)
        mean = {q: sum(v) / len(v) for q, v in per_q.items()}
        lo, hi = interval(rng, [mean[q] for q in ids])
        base = scores.get((arm, "files"))
        paired = ""
        if base and setup != "files":
            diffs = [mean[q] - sum(base[q]) / len(base[q]) for q in ids if q in base]
            dlo, dhi = interval(rng, diffs)
            paired = f"{sum(diffs):+.1f} ({dlo:+.1f}…{dhi:+.1f})"
        runs = max(len(v) for v in per_q.values())
        print(f"| {arm} | {setup} | {len(ids)} | {runs} | {sum(mean.values()):.1f} | {lo:.1f}–{hi:.1f} | {paired} |")


def post3(answers, reference):
    rng = random.Random(1)
    base_scores = defaultdict(list)
    for r in reference:
        if r["arm"] == "hermes-deepseek-flash" and r["setup"] == "wirecat":
            base_scores[r["id"]].append(int(r["correct"]) if str(r["answer"]).strip() else 0)
    base = {q: sum(v) / len(v) for q, v in base_scores.items()}
    by_model = defaultdict(lambda: defaultdict(list))
    for r in answers:
        by_model[r["model"]][r["id"]].append(int(r["correct"]) if str(r["answer"]).strip() else 0)
    print("\nPost 3\n")
    print("| Model | Questions | Runs | Correct | 95% interval | vs DeepSeek Flash (paired) |")
    print("|---|---:|---:|---:|---|---|")
    for model, scores in sorted(by_model.items()):
        mean, runs = {q: sum(v) / len(v) for q, v in scores.items()}, max(map(len, scores.values()))
        ids = sorted(mean)
        lo, hi = interval(rng, [mean[q] for q in ids])
        diffs = [mean[q] - base[q] for q in ids if q in base]
        dlo, dhi = interval(rng, diffs)
        print(f"| {model} | {len(ids)} | {runs} | {sum(mean.values()):.1f} | {lo:.1f}–{hi:.1f} | "
              f"{sum(diffs):+.1f} ({dlo:+.1f}…{dhi:+.1f}) |")


if __name__ == "__main__":
    first = rows("post1-answers.jsonl")
    post1("full", first)
    post1("full-iso2", first)
    post1("full", first, also="ext", arms={("claude-sonnet", "files"), ("claude-sonnet", "wirecat")})
    post3(rows("post3-answers.jsonl"), first)
