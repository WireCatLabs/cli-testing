"""Each model against a baseline model, question by question: on how many questions only one of the two has a gold
record in its first ten, and the exact two-sided sign test (McNemar) on those.

    python3 -I paired.py --fixture ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran \
        --baseline lifebench-embeddinggemma-300m.json lifebench-*.json
"""

import argparse
import json
from math import comb
from pathlib import Path


def hits(path, gold, reworded):
    runs = json.loads(path.read_text())["runs"]
    label = next((name for name in runs if name.endswith("other words") == reworded), None)
    if label is None:
        return None
    return {row["id"]: bool(gold[row["id"]] & set(row["hits"][:10])) for row in runs[label] if gold[row["id"]]}


def name_of(path):
    data = json.loads(path.read_text())
    return data.get("name", data["model"])


def sign_test(wins, losses):
    n = wins + losses
    if n == 0:
        return 1.0
    tail = sum(comb(n, i) for i in range(min(wins, losses) + 1)) / 2**n
    return min(1.0, 2 * tail)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("runs", type=Path, nargs="+")
    args = parser.parse_args()
    gold = {row["id"]: set(row["required_citations"]) for row in json.loads((args.fixture / "oracle.json").read_text())}
    print("| Model | Set | Questions | Hit@10 | Baseline hit@10 | Only model | Only baseline | p |")
    print("|---|---|---:|---:|---:|---:|---:|---:|")
    for reworded in (False, True):
        base = hits(args.baseline, gold, reworded)
        if base is None:
            continue
        for path in args.runs:
            run = hits(path, gold, reworded)
            if run is None or path == args.baseline:
                continue
            wins = sum(run[q] and not base[q] for q in base)
            losses = sum(base[q] and not run[q] for q in base)
            print(f"| {name_of(path)} | {'reworded, other words' if reworded else 'all'} "
                  f"| {len(base)} | {sum(run.values()) / len(run):.2f} | {sum(base.values()) / len(base):.2f} "
                  f"| {wins} | {losses} | {sign_test(wins, losses):.3f} |")


if __name__ == "__main__":
    main()
