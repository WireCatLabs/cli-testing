#!/usr/bin/env python3
"""Judge every unjudged chunk of a stage, then print and save totals per arm and setup: correct (mean and range over
runs), questions citing an evidence session, answer cost, seconds."""

import json
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path("/var/tmp/locomo-bench")


def evidence_sessions(q):
    return {int(e.split(":")[0].lstrip("D")) for e in q["evidence"] if re.fullmatch(r"D\d+:\d+", e)}


def cost_of(row):
    usage = row.get("usage") or {}
    for value in (usage.get("estimated_cost_usd"), row.get("cost_usd"), row.get("cost_usd_list_price")):
        if value is not None:
            return float(value)
    return 0.0


def main(stage, ids_file=None):
    questions = {q["id"]: q for q in json.loads((ROOT / "questions.json").read_text())["questions"]}
    only = set(Path(ids_file).read_text().strip().split(",")) if ids_file else None
    network = ROOT / "runs/integrity/network.json"
    # An answer whose agent downloaded the LoCoMo dataset counts as wrong (it read the gold answers).
    fetched = {(r["stage"], r["arm"], r["setup"], r["run"], r["id"]): r["kind"]
               for r in (json.loads(network.read_text()) if network.exists() else [])}
    chunks = sorted((ROOT / "runs" / stage).glob("*/*/*/*/answers.json"))
    todo = [str(c.parent) for c in chunks if (c.parent / "run.json").exists() and not (c.parent / "judged.json").exists()]
    for chunk in todo:
        judged = subprocess.run(["python3", "-I", str(ROOT / "scripts/judge.py"), chunk], capture_output=True, text=True)
        if judged.returncode:
            print(f"judge failed, left unjudged: {chunk}: {judged.stderr.strip()[-200:]}", file=sys.stderr)
    runs = defaultdict(lambda: defaultdict(lambda: {"n": 0, "correct": 0, "cited": 0, "cost": 0.0, "seconds": [],
                                                     "judge": 0.0, "by_category": defaultdict(int),
                                                     "dataset": 0, "web": 0}))
    for chunk in chunks:
        if not (chunk.parent / "judged.json").exists():
            continue
        arm, setup, run, _ = chunk.parent.relative_to(ROOT / "runs" / stage).parts
        judged = json.loads((chunk.parent / "judged.json").read_text())
        labels = {r["id"]: r["correct"] for r in judged["rows"]}
        cell = runs[(arm, setup)][run]
        cell["judge"] += judged["judge_cost_usd"]
        for row in json.loads(chunk.read_text()):
            if only is not None and row["id"] not in only:
                continue
            q = questions[row["id"]]
            net = fetched.get((stage, arm, setup, run, row["id"]))
            correct = 0 if net == "dataset" else labels[row["id"]]
            if net:
                cell[net] += 1
            cell["n"] += 1
            cell["correct"] += correct
            cell["by_category"][q["category_name"]] += correct
            cell["cited"] += bool(set(row.get("sessions_cited") or []) & evidence_sessions(q))
            cell["cost"] += cost_of(row)
            cell["seconds"].append(row.get("seconds") or 0)
    table = []
    for (arm, setup), cells in sorted(runs.items()):
        correct = [c["correct"] for c in cells.values()]
        table.append({"arm": arm, "setup": setup, "runs": sorted(cells), "questions": [c["n"] for c in cells.values()],
                      "correct": correct, "correct_mean": statistics.mean(correct),
                      "correct_range": [min(correct), max(correct)],
                      "cited_mean": statistics.mean(c["cited"] for c in cells.values()),
                      "answer_cost_usd_per_run": statistics.mean(c["cost"] for c in cells.values()),
                      "answer_cost_usd_total": sum(c["cost"] for c in cells.values()),
                      "judge_cost_usd": sum(c["judge"] for c in cells.values()),
                      "dataset_fetches": sum(c["dataset"] for c in cells.values()),
                      "web_uses": sum(c["web"] for c in cells.values()),
                      "median_seconds": statistics.median(s for c in cells.values() for s in c["seconds"]),
                      "by_category_mean": {k: statistics.mean(c["by_category"][k] for c in cells.values())
                                           for k in ("multi-hop", "temporal", "open-domain", "single-hop")}})
    name = f"summary-{Path(ids_file).stem}.json" if ids_file else "summary.json"
    (ROOT / "runs" / stage / name).write_text(json.dumps(table, indent=2) + "\n")
    print("| Arm | Setup | Runs | Q/run | Correct mean | Range | Cited mean | $/run | Median s | Dataset / web |")
    print("|---|---|---|---|---:|---|---:|---:|---:|---|")
    for t in table:
        print(f"| {t['arm']} | {t['setup']} | {','.join(t['runs'])} | {t['questions'][0]} | {t['correct_mean']:.1f} | "
              f"{t['correct_range'][0]}–{t['correct_range'][1]} | {t['cited_mean']:.1f} | "
              f"{t['answer_cost_usd_per_run']:.3f} | {t['median_seconds']:.0f} | {t['dataset_fetches']} / {t['web_uses']} |")


if __name__ == "__main__":
    main(*sys.argv[1:3])
