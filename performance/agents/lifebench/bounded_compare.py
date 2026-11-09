#!/usr/bin/env python3
"""Date-bounded memo search against the unbounded runs: what changed per question, and the leaderboard row.

    python3 -I bounded_compare.py --output date-bounded-results.json

Reads context-348-results.json and context-maxiulan-results.json (unbounded) and the context-bounded-<person>-
results.json files run-date-bounded.sh writes. Micro is the share of all questions right; macro is the mean of the nine
category accuracies, as LifeBench_eval's README reports both.
"""

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ORDER = ("Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update", "Causal",
         "Conflict", "Hidden_info", "Unanswerable")
SHORT = ("SH", "MH", "TR", "ND", "KU", "CR", "CD", "HI", "UA")
UNBOUNDED = {"fenghaoran": "context-348-results.json", "maxiulan": "context-maxiulan-results.json"}
FIXTURES = {"fenghaoran": "fenghaoran-348", "maxiulan": "maxiulan-352"}
SETUPS = ("memo-e5-top20", "memo-gemma-top20")
RESUME = ("/home/leemour/Projects/AI/cli-testing-wt-lifebench/performance/agents/lifebench/run-date-bounded.sh search "
          "&& /home/leemour/Projects/AI/cli-testing-wt-lifebench/performance/agents/lifebench/run-date-bounded.sh answer")


def mcnemar(first_only, second_only):
    discordant = first_only + second_only
    if not discordant:
        return 1.0
    return min(1.0, 2 * sum(math.comb(discordant, i) for i in range(min(first_only, second_only) + 1))
               / 2 ** discordant)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {"resume": RESUME, "persons": {}, "pooled": {}}
    pooled = {kind: defaultdict(lambda: defaultdict(list)) for kind in ("unbounded", "bounded")}
    for person, unbounded_file in UNBOUNDED.items():
        bounded_file = HERE / f"context-bounded-{person}-results.json"
        before = json.loads((HERE / unbounded_file).read_text())["runs"]
        oracle = Path.home() / ".cache/wirecat-bench/lifebench/pilots" / FIXTURES[person] / "oracle.json"
        categories = {row["id"]: row["categories"] for row in json.loads(oracle.read_text())}
        after = json.loads(bounded_file.read_text())["runs"]
        report["persons"][person] = {}
        for setup in (*SETUPS, "gold"):
            old = {q["id"]: q["correct"] for q in before[setup]["per_question"]}
            new = {q["id"]: q["correct"] for q in after[setup]["per_question"]}
            for kind, verdicts in (("unbounded", old), ("bounded", new)):
                for qid, correct in verdicts.items():
                    for category in ("All", *categories[qid]):
                        pooled[kind][setup][category].append(correct)
            if setup == "gold":
                continue
            gained = sum(new[q] and not old[q] for q in old)
            lost = sum(old[q] and not new[q] for q in old)
            report["persons"][person][setup] = {
                "unbounded": sum(old.values()), "bounded": sum(new.values()), "questions": len(old),
                "answers_reused": after[setup]["answers_reused"],
                "contexts_changed": len(old) - after[setup]["answers_reused"],
                "verdicts_wrong_to_right": gained, "verdicts_right_to_wrong": lost, "p": mcnemar(gained, lost),
                "answer_usd_billed": after[setup]["answer_usd_billed"], "judge_usd_billed": after[setup]["judge_usd_billed"],
            }
    for kind, setups in pooled.items():
        report["pooled"][kind] = {}
        for setup, cats in setups.items():
            per_category = {c: sum(cats[c]) / len(cats[c]) for c in ORDER if cats.get(c)}
            report["pooled"][kind][setup] = {"micro": sum(cats["All"]) / len(cats["All"]),
                                             "macro": statistics.mean(per_category.values()),
                                             "questions": len(cats["All"]), "per_category": per_category}
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print("| Setup | " + " | ".join(SHORT) + " | Micro | Macro |")
    print("| --- |" + " ---: |" * (len(SHORT) + 2))
    for kind in ("bounded", "unbounded"):
        for setup in ("gold", *SETUPS):
            row = report["pooled"][kind].get(setup)
            if not row or (setup == "gold" and kind == "bounded"):
                continue
            cells = [f"{100 * row['per_category'][c]:.1f}" for c in ORDER]
            label = "gold evidence" if setup == "gold" else f"{setup}, {kind}"
            print(f"| {label} | " + " | ".join(cells) + f" | {100 * row['micro']:.1f} | {100 * row['macro']:.1f} |")
    print("\n| Person | Setup | Unbounded | Bounded | Contexts changed | Wrong to right | Right to wrong | p |")
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for person, setups in report["persons"].items():
        for setup, row in setups.items():
            print(f"| {person} | {setup} | {row['unbounded']} | {row['bounded']} | {row['contexts_changed']} | "
                  f"{row['verdicts_wrong_to_right']} | {row['verdicts_right_to_wrong']} | {row['p']:.3f} |")
    spent = sum(r["answer_usd_billed"] + r["judge_usd_billed"] for s in report["persons"].values() for r in s.values())
    print(f"\nBilled for the bounded runs: ${spent:.2f}")


if __name__ == "__main__":
    main()
