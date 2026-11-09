#!/usr/bin/env python3
"""The pilot's tables from judge.json and each run's per-question.json: accuracy per category, cost, time, failures.

    python3 -I pilot_report.py --judged <judge.json> --run memo=<answer dir> --run files=<answer dir> \
        [--extra-usd 0.19] --output pilot-results.json

Cost is recomputed from the token counts at Anthropic's list price for Claude Sonnet 5.5 ($2 in, $10 out, $0.20
cache read, cache write at 1.25 times input: $2.50; claude-api skill price table, cached 2026-10-06), next to
OpenClaw's own estimate, which prices cache writes lower. --extra-usd is spend outside these runs (smoke runs, the
judge validation), so the total is the whole pilot's.
"""

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

ORDER = ("Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update", "Causal",
         "Conflict", "Hidden_info", "Unanswerable")
PRICE = {"input": 2.00, "output": 10.00, "cacheRead": 0.20, "cacheWrite": 2.50}


def list_price(usage):
    return sum((usage or {}).get(field, 0) * rate for field, rate in PRICE.items()) / 1e6


def failure(row):
    if row["exit"] != 0:
        return f"exit {row['exit']}"
    if row.get("problem"):
        return row["problem"]
    if row.get("error"):
        return "error in envelope"
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--judged", type=Path, required=True)
    parser.add_argument("--run", action="append", required=True, metavar="NAME=DIR")
    parser.add_argument("--extra-usd", type=float, default=0.0)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    judged = json.loads(args.judged.read_text())
    report = {"judge_model": judged["judge_model"], "votes": judged["votes"], "prices_per_mtok": PRICE, "runs": {}}
    accuracy = {}
    for spec in args.run:
        name, folder = spec.split("=", 1)
        rows = {r["id"]: r for r in json.loads((Path(folder) / "per-question.json").read_text())}
        verdicts = judged["runs"][name]["results"]
        groups = defaultdict(list)
        for verdict in verdicts:
            groups["All"].append(verdict)
            for category in verdict["categories"]:
                groups[category].append(verdict)
            if "Unanswerable" not in verdict["categories"]:
                groups["Answerable"].append(verdict)
        accuracy[name] = {k: (sum(v["is_correct"] for v in rows_), len(rows_)) for k, rows_ in groups.items()}
        costs = [list_price(r["usage"]) for r in rows.values()]
        report["runs"][name] = {
            "questions": len(rows), "accuracy": accuracy[name],
            "agent_usd_list_price": sum(costs), "agent_usd_openclaw_estimate":
                sum(r["list_price_usd_estimate"] or 0 for r in rows.values()),
            "usd_per_question_mean": statistics.mean(costs), "usd_per_question_max": max(costs),
            "seconds_median": statistics.median(r["seconds"] for r in rows.values()),
            "seconds_max": max(r["seconds"] for r in rows.values()),
            "tool_calls_median": statistics.median(r["tool_calls"] or 0 for r in rows.values()),
            "failures": {qid: failure(r) for qid, r in rows.items() if failure(r)},
            "judge_usd": judged["runs"][name]["judge_usd"],
            "failed_votes": judged["runs"][name]["failed_votes"],
            "split_verdicts": sum(v["votes"]["correct"] > 0 and v["votes"]["wrong"] > 0 for v in verdicts),
            "per_question": [{"id": v["id"], "categories": v["categories"], "correct": v["is_correct"],
                              "votes": v["votes"], "weighted_score": v["weighted_score"],
                              "seconds": rows[v["id"]]["seconds"], "usd": round(list_price(rows[v["id"]]["usage"]), 4),
                              "answer": v["answer"], "reference": v["reference"], "judge_reasoning": v["reasoning"]}
                             for v in verdicts],
        }
    names = list(report["runs"])
    lines = ["| Category | Questions | " + " | ".join(names) + " |", "| --- | ---: | " + " | ".join("---:" for _ in names)
             + " |"]
    for category in ("All", "Answerable", *ORDER):
        if category not in accuracy[names[0]]:
            continue
        total = accuracy[names[0]][category][1]
        cells = []
        for name in names:
            right, count = accuracy[name].get(category, (0, 0))
            cells.append(f"{right} ({right / count:.0%})" if count else "-")
        lines.append(f"| {category} | {total} | " + " | ".join(cells) + " |")
    print("\n".join(lines))
    print()
    print("| Setup | Agent USD (list price) | OpenClaw estimate | USD a question (mean / max) | Median s (max) | "
          "Median tool calls | Failures | Split verdicts |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for name, run in report["runs"].items():
        print(f"| {name} | {run['agent_usd_list_price']:.2f} | {run['agent_usd_openclaw_estimate']:.2f} | "
              f"{run['usd_per_question_mean']:.3f} / {run['usd_per_question_max']:.3f} | {run['seconds_median']:.0f} "
              f"({run['seconds_max']:.0f}) | {run['tool_calls_median']:.0f} | {len(run['failures'])} | "
              f"{run['split_verdicts']} |")
    judge = sum(r["judge_usd"] for r in report["runs"].values())
    agents = sum(r["agent_usd_list_price"] for r in report["runs"].values())
    report["total_usd"] = {"agents": agents, "judge": judge, "extra": args.extra_usd,
                           "all": agents + judge + args.extra_usd}
    print(f"\nTotal: agents ${agents:.2f} + judge ${judge:.2f} + smoke and validation ${args.extra_usd:.2f} = "
          f"${report['total_usd']['all']:.2f}")
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
