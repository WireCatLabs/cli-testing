#!/usr/bin/env python3
"""Tables for the leaderboard-style runs: accuracy per category, how much evidence the context held, cost.

    python3 -I context_report.py --fixture <pilot> --run gold=<answers>:<judge.json> --run memo-e5=... \
        --output context-results.json

Published accuracy is LifeBench_eval's README at 7f16350 (3,380 questions, ten people, DeepSeek-V4-Flash answering
unless named).
"""

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

ORDER = ("Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update", "Causal",
         "Conflict", "Hidden_info", "Unanswerable")
PUBLISHED = {
    "Gold evidence": (98.14, 94.85, 94.91, 93.73, 96.14, 94.10, 98.11, 93.30, 100.00, 97.28),
    "Hindsight": (83.43, 53.98, 44.34, 58.75, 85.09, 67.83, 80.66, 49.48, 75.56, 71.98),
    "Mem0": (78.09, 41.41, 32.45, 48.48, 75.84, 52.55, 78.07, 32.47, 55.73, 61.54),
}
# Macro: the mean of the nine category accuracies, as LifeBench_eval's README reports it.
PUBLISHED_MACRO = {"Gold evidence": 95.92, "Hindsight": 66.57, "Mem0": 55.01}


def wilson(right, total, z=1.96):
    """95% interval of a share, in percent; Wilson's, so it stays inside 0-100 on small categories."""
    share, scale = right / total, 1 + z * z / total
    centre = share + z * z / (2 * total)
    half = z * math.sqrt(share * (1 - share) / total + z * z / (4 * total * total))
    return round(100 * (centre - half) / scale), round(100 * (centre + half) / scale)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--run", action="append", required=True, metavar="NAME=ANSWERS:JUDGE")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    oracle = {row["id"]: row for row in json.loads((args.fixture / "oracle.json").read_text())}
    report = {}
    for spec in args.run:
        name, paths = spec.split("=", 1)
        answers_dir, judge_path = paths.split(":", 1)
        answers = {r["id"]: r for r in json.loads((Path(answers_dir) / "per-question.json").read_text())}
        judged = json.loads(Path(judge_path).read_text())["runs"][name]
        groups = defaultdict(list)
        for verdict in judged["results"]:
            for category in ("All", *verdict["categories"]):
                groups[category].append(verdict["is_correct"])
        coverage, any_hit = [], []
        for qid, truth in oracle.items():
            gold = set(truth["required_citations"])
            if gold:
                held = gold & set(answers[qid]["context_records"])
                coverage.append(len(held) / len(gold))
                any_hit.append(bool(held))
        report[name] = {
            "accuracy": {k: [sum(v), len(v)] for k, v in groups.items()},
            "evidence_in_context_mean": statistics.mean(coverage), "questions_with_evidence_in_context":
                sum(any_hit) / len(any_hit),
            "context_records_median": statistics.median(len(a["context_records"]) for a in answers.values()),
            "prompt_tokens_median": statistics.median(a["usage"].get("prompt_tokens", 0) for a in answers.values()),
            "answer_usd_billed": sum(a["usage"].get("cost", 0) for a in answers.values() if not a.get("reused")),
            "answers_reused": sum(bool(a.get("reused")) for a in answers.values()),
            "judge_usd_billed": judged.get("judge_usd_billed"), "failed_votes": judged["failed_votes"],
            "answer_failures": {qid: a["problem"] for qid, a in answers.items() if a["problem"]},
            "per_question": [{"id": v["id"], "correct": v["is_correct"], "votes": v["votes"], "answer": v["answer"],
                              "reference": v["reference"], "judge_reasoning": v["reasoning"]}
                             for v in judged["results"]],
        }
    names = list(report)
    print("| Category | Questions | " + " | ".join(names) + " | " + " | ".join(f"{p} (published)" for p in PUBLISHED)
          + " |")
    print("| --- | ---: |" + " ---: |" * (len(names) + len(PUBLISHED)))
    for category in ("All", *ORDER):
        count = report[names[0]]["accuracy"].get(category, [0, 0])[1]
        if not count:
            continue
        cells = [f"{right / total:.0%} ({'–'.join(map(str, wilson(right, total)))})" for right, total in
                 (report[n]["accuracy"].get(category, [0, 0]) for n in names)]
        published = [f"{values[-1 if category == 'All' else ORDER.index(category)]:.1f}%" for values in
                     PUBLISHED.values()]
        print(f"| {category} | {count} | " + " | ".join(cells) + " | " + " | ".join(published) + " |")
    macro = {n: statistics.mean(report[n]["accuracy"][c][0] / report[n]["accuracy"][c][1] for c in ORDER
                                if report[n]["accuracy"].get(c, [0, 0])[1]) for n in names}
    for name in names:
        report[name]["macro"] = macro[name]
    print("| Macro (mean of categories) | | " + " | ".join(f"{macro[n]:.0%}" for n in names) + " | "
          + " | ".join(f"{PUBLISHED_MACRO[p]:.1f}%" for p in PUBLISHED) + " |")
    print("\n| Setup | Evidence records in context (mean) | Questions with any evidence in context | Records given "
          "(median) | Prompt tokens (median) | Answers, billed | Judge, billed | Failed answers |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for name, run in report.items():
        print(f"| {name} | {run['evidence_in_context_mean']:.2f} | {run['questions_with_evidence_in_context']:.0%} | "
              f"{run['context_records_median']:.0f} | {run['prompt_tokens_median']:.0f} | "
              f"${run['answer_usd_billed']:.3f} | ${run['judge_usd_billed']:.3f} | {len(run['answer_failures'])} |")
    total = sum(r["answer_usd_billed"] + r["judge_usd_billed"] for r in report.values())
    print(f"\nTotal billed: ${total:.2f}")
    args.output.write_text(json.dumps({"runs": report, "published": PUBLISHED, "total_usd_billed": total},
                                      ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
