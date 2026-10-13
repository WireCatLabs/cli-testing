"""Totals of runs.json per corpus, engine and query kind: hit@1/3/10, MRR@10, latency. No query text is printed.

  python3 -I score.py <runs.json> [--markdown]
"""

import json
import statistics
import sys
from collections import defaultdict

runs = json.load(open(sys.argv[1]))
markdown = "--markdown" in sys.argv


def rank(run):
    return next((at for at, item in enumerate(run["ranked"][:10], 1) if item in run["rel"]), None)


def totals(rows):
    ranks = [rank(r) for r in rows]
    ms = sorted(r["ms"] for r in rows)
    return {
        "n": len(rows),
        "hit@1": sum(1 for x in ranks if x == 1) / len(rows),
        "hit@3": sum(1 for x in ranks if x and x <= 3) / len(rows),
        "hit@10": sum(1 for x in ranks if x) / len(rows),
        "mrr@10": sum(1 / x for x in ranks if x) / len(rows),
        "p50 ms": statistics.median(ms),
        "p95 ms": ms[min(len(ms) - 1, int(len(ms) * 0.95))],
        "errors": sum(1 for r in rows if r["error"]),
    }


groups = defaultdict(list)
for r in runs:
    groups[(r["corpus"], r["engine"], "all")].append(r)
    groups[(r["corpus"], r["engine"], r["kind"])].append(r)

fields = ["n", "hit@1", "hit@3", "hit@10", "mrr@10", "p50 ms", "p95 ms", "errors"]
if markdown:
    print("| corpus | engine | queries | " + " | ".join(fields) + " |")
    print("|" + "---|" * (len(fields) + 3))
for (corpus, engine, kind), rows in sorted(groups.items()):
    t = totals(rows)
    cells = [f"{t[f]:.2f}" if isinstance(t[f], float) and f.startswith(("hit", "mrr")) else str(round(t[f])) for f in fields]
    if markdown:
        print(f"| {corpus} | {engine} | {kind} | " + " | ".join(cells) + " |")
    else:
        print(corpus, engine, kind, dict(zip(fields, cells)))
