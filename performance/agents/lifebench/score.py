"""Recall by LifeBench question category, from memo_baseline.py's per-query.json or eval_embeddings.py's output.

    python3 -I score.py --fixtures ~/.cache/wirecat-bench/lifebench/fixtures \
        --run memo=~/.cache/wirecat-bench/lifebench-memo-fenghaoran/per-query.json \
        --run e5=~/.cache/wirecat-bench/lifebench/vectors/fenghaoran-e5-small.json

recall@k: the share of a question's gold evidence records in the first k hits, averaged over questions (as
memo_baseline.py scores it). hit@k: the share of questions with at least one gold record in the first k. ceiling@k:
the best recall@k any search could reach, since most questions cite more than k records. Questions without gold
evidence (all of them Unanswerable) are left out. A question has one to four categories and counts in each.
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

KS = (1, 5, 10)
ORDER = ("Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update", "Causal",
         "Conflict", "Hidden_info")


def runs_in(path):
    data = json.loads(path.read_text())
    return data.get("runs", data)


def scores(rows):
    out = {"questions": len(rows)}
    for k in KS:
        out[f"recall@{k}"] = sum(len(gold & set(hits[:k])) / len(gold) for gold, hits in rows) / len(rows)
        out[f"hit@{k}"] = sum(bool(gold & set(hits[:k])) for gold, hits in rows) / len(rows)
        out[f"ceiling@{k}"] = sum(min(k, len(gold)) / len(gold) for gold, _ in rows) / len(rows)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixtures", type=Path, required=True, help="the folder holding one fixture per persona")
    parser.add_argument("--run", action="append", required=True, metavar="NAME=FILE",
                        help="results of one system; repeat a NAME to pool several personas")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    oracle = {row["id"]: row for fixture in args.fixtures.iterdir() if (fixture / "oracle.json").exists()
              for row in json.loads((fixture / "oracle.json").read_text())}
    pooled = defaultdict(lambda: defaultdict(list))
    unmapped = defaultdict(int)
    for spec in args.run:
        name, path = spec.split("=", 1)
        for label, rows in runs_in(Path(path).expanduser()).items():
            for row in rows:
                unmapped[f"{name}: {label}"] += sum(hit.startswith("unmapped:") for hit in row["hits"])
                truth = oracle[row["id"]]
                if not truth["required_citations"]:
                    continue
                pair = (set(truth["required_citations"]), row["hits"])
                pooled[f"{name}: {label}"]["All answerable"].append(pair)
                for category in truth["categories"]:
                    pooled[f"{name}: {label}"][category].append(pair)
    report = {label: {c: scores(groups[c]) for c in ("All answerable", *ORDER) if c in groups}
              for label, groups in pooled.items()}
    for label, table in report.items():
        print(f"\n{label} (unmapped hits: {unmapped[label]})\n")
        print("| Category | Questions | R@1 | R@5 | R@10 | Hit@1 | Hit@5 | Hit@10 | Ceiling R@10 |")
        print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
        for category, s in table.items():
            print(f"| {category} | {s['questions']} | {s['recall@1']:.3f} | {s['recall@5']:.3f} | {s['recall@10']:.3f} "
                  f"| {s['hit@1']:.2f} | {s['hit@5']:.2f} | {s['hit@10']:.2f} | {s['ceiling@10']:.2f} |")
    if args.output:
        args.output.write_text(json.dumps({"unmapped": unmapped, "report": report}, indent=2) + "\n")


if __name__ == "__main__":
    main()
