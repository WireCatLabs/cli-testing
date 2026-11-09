#!/usr/bin/env python3
"""Several persons' context_report.py results side by side and pooled, with a paired test between two setups.

    python3 -I persons_report.py --person fenghaoran=context-348-results.json --person maxiulan=... \
        --pair memo-e5-top20,memo-gemma-top20 --output persons-results.json

The paired test is an exact McNemar test: on the questions where the two setups disagree, is one right more often
than a coin would allow? Pooled numbers count every question once.
"""

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

ORDER = ("All", "Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update",
         "Causal", "Conflict", "Hidden_info", "Unanswerable")


def wilson(right, total, z=1.96):
    share, scale = right / total, 1 + z * z / total
    centre = share + z * z / (2 * total)
    half = z * math.sqrt(share * (1 - share) / total + z * z / (4 * total * total))
    return round(100 * (centre - half) / scale), round(100 * (centre + half) / scale)


def mcnemar(first_only, second_only):
    discordant = first_only + second_only
    if not discordant:
        return 1.0
    tail = sum(math.comb(discordant, i) for i in range(min(first_only, second_only) + 1)) / 2 ** discordant
    return min(1.0, 2 * tail)


def cell(right, total):
    low, high = wilson(right, total)
    return f"{right / total:.0%} ({low}–{high})"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--person", action="append", required=True, metavar="NAME=RESULTS")
    parser.add_argument("--pair", required=True, help="two setup names to compare, comma separated")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    first, second = args.pair.split(",")
    persons = {}
    for spec in args.person:
        name, path = spec.split("=", 1)
        persons[name] = json.loads(Path(path).read_text())["runs"]
    setups = list(next(iter(persons.values())))
    pooled = {setup: defaultdict(lambda: [0, 0]) for setup in setups}
    for runs in persons.values():
        for setup in setups:
            for category, (right, total) in runs[setup]["accuracy"].items():
                pooled[setup][category][0] += right
                pooled[setup][category][1] += total
    columns = [(person, setup) for person in persons for setup in setups]
    print("| Category | " + " | ".join(f"{p} {s}" for p, s in columns) + " | " +
          " | ".join(f"both {s}" for s in setups) + " |")
    print("| --- |" + " ---: |" * (len(columns) + len(setups)))
    for category in ORDER:
        cells = []
        for person, setup in columns:
            right, total = persons[person][setup]["accuracy"].get(category, [0, 0])
            cells.append(cell(right, total) if total else "-")
        cells += [cell(*pooled[s][category]) for s in setups]
        print(f"| {category} | " + " | ".join(cells) + " |")
    paired, both_first, both_second = {}, 0, 0
    for person, runs in persons.items():
        one = {q["id"]: q["correct"] for q in runs[first]["per_question"]}
        two = {q["id"]: q["correct"] for q in runs[second]["per_question"]}
        first_only = sum(one[q] and not two[q] for q in one)
        second_only = sum(two[q] and not one[q] for q in one)
        both_first, both_second = both_first + first_only, both_second + second_only
        paired[person] = {f"{first}_only": first_only, f"{second}_only": second_only,
                          "p": mcnemar(first_only, second_only)}
    paired["both"] = {f"{first}_only": both_first, f"{second}_only": both_second, "p": mcnemar(both_first, both_second)}
    print(f"\n| Person | Only {first} right | Only {second} right | Exact McNemar p |")
    print("| --- | ---: | ---: | ---: |")
    for person, row in paired.items():
        print(f"| {person} | {row[f'{first}_only']} | {row[f'{second}_only']} | {row['p']:.3f} |")
    billed = {person: sum(r["answer_usd_billed"] + r["judge_usd_billed"] for r in runs.values())
              for person, runs in persons.items()}
    args.output.write_text(json.dumps({"pooled": {s: dict(v) for s, v in pooled.items()}, "paired": paired,
                                       "usd_billed": billed}, indent=2) + "\n")


if __name__ == "__main__":
    main()
