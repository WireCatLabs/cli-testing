#!/usr/bin/env python3
"""How many verdicts change when the same question is answered and judged again from the same 20 records.

    python3 -I noise_compare.py --output noise-results.json

Reads run-noise.sh's reruns and the date-bounded run's verdicts (~/.cache/wirecat-bench/lifebench/runs/leaderboard-style/
bounded). The context of every sampled question is checked to be the same records in the same order. Resume with
/home/leemour/Projects/AI/cli-testing-wt-lifebench/performance/agents/lifebench/run-noise.sh
"""

import argparse
import json
import math
from pathlib import Path

R = Path.home() / ".cache/wirecat-bench/lifebench/runs/leaderboard-style/bounded"
PERSONS = ("fenghaoran", "maxiulan")
SETUPS = ("memo-e5-top20", "memo-gemma-top20")
RESUME = "/home/leemour/Projects/AI/cli-testing-wt-lifebench/performance/agents/lifebench/run-noise.sh"


def wilson(right, total, z=1.96):
    share, scale = right / total, 1 + z * z / total
    centre = share + z * z / (2 * total)
    half = z * math.sqrt(share * (1 - share) / total + z * z / (4 * total * total))
    return round(100 * (centre - half) / scale, 1), round(100 * (centre + half) / scale, 1)


def results(path):
    return {r["id"]: r for r in next(iter(json.loads(path.read_text())["runs"].values()))["results"]}


def pooled(rows):
    keys = ("questions", "first_correct", "second_correct", "flipped", "to_right", "to_wrong", "answer_text_same", "usd")
    total = {key: sum(r[key] for r in rows) for key in keys}
    total["flip_share_ci95"] = wilson(total["flipped"], total["questions"])
    return total


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {"resume": RESUME, "missing": [], "rows": [], "by_person": {}, "totals": {}}
    for person in PERSONS:
        for setup in SETUPS:
            if not (R / "noise" / person / f"judge-{setup}.json").exists():
                report["missing"].append(f"{person} {setup}")
                continue
            first = results(R / person / f"judge-{setup}.json")
            second = results(R / "noise" / person / f"judge-{setup}.json")
            context_first = {r["id"]: r["context_records"]
                             for r in json.loads((R / person / setup / "per-question.json").read_text())}
            rerun = {r["id"]: r for r in json.loads((R / "noise" / person / setup / "per-question.json").read_text())}
            mismatched = [q for q in second if context_first[q] != rerun[q]["context_records"]]
            if mismatched:
                raise SystemExit(f"{person} {setup}: contexts differ for {mismatched}")
            ids = sorted(second)
            to_right = sum(second[q]["is_correct"] and not first[q]["is_correct"] for q in ids)
            to_wrong = sum(first[q]["is_correct"] and not second[q]["is_correct"] for q in ids)
            usd = sum(r["usage"].get("cost", 0) for r in rerun.values()) + sum(
                r["usage"].get("cost", 0) for r in second.values())
            report["rows"].append({
                "person": person, "setup": setup, "questions": len(ids),
                "first_correct": sum(first[q]["is_correct"] for q in ids),
                "second_correct": sum(second[q]["is_correct"] for q in ids),
                "flipped": to_right + to_wrong, "to_right": to_right, "to_wrong": to_wrong,
                "answer_text_same": sum(first[q]["answer"].strip() == second[q]["answer"].strip() for q in ids),
                "usd": usd, "flip_share_ci95": wilson(to_right + to_wrong, len(ids))})
    for person in PERSONS:
        report["by_person"][person] = pooled([r for r in report["rows"] if r["person"] == person])
    report["totals"] = pooled(report["rows"])
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print("| Person | Setup | Sampled | Right, first run | Right, rerun | Verdicts changed | Wrong to right | "
          "Right to wrong | Changed share (95%) | Same answer text |")
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    summary = [{"person": p, "setup": "both models", **row} for p, row in report["by_person"].items()]
    for row in [*report["rows"], *summary, {"person": "all", "setup": "both models", **report["totals"]}]:
        low, high = row["flip_share_ci95"]
        print(f"| {row['person']} | {row['setup']} | {row['questions']} | {row['first_correct']} | "
              f"{row['second_correct']} | {row['flipped']} | {row['to_right']} | {row['to_wrong']} | "
              f"{100 * row['flipped'] / row['questions']:.1f}% ({low}–{high}) | {row['answer_text_same']} |")
    totals = report["totals"]
    print(f"\nBilled for the rerun: ${totals['usd']:.2f}")
    if report["missing"]:
        print(f"Not rerun yet, left out: {', '.join(report['missing'])}. Resume with {RESUME}")


if __name__ == "__main__":
    main()
