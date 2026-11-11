# Per-class table from results.json:  python3 -I summary.py <results.json>
import json, statistics, sys
r = json.load(open(sys.argv[1]))
order = []
for x in r["results"]:
    if x["class"] not in order: order.append(x["class"])
print("| class | n | Recall@10 | MRR@10 | zero-hit queries | no-answer false hits | p50 ms | p95 ms |")
print("|---|---|---|---|---|---|---|---|")
def pct(v, p): v = sorted(v); return v[int((len(v) - 1) * p)]
for c in order + ["ALL answerable"]:
    xs = [x for x in r["results"] if (x["class"] == c if c != "ALL answerable" else x["relevant"])]
    ans = [x for x in xs if x["relevant"]]
    rec = f"{statistics.mean(x['recall10'] for x in ans):.2f}" if ans else "–"
    mrr = f"{statistics.mean(x['rr10'] for x in ans):.2f}" if ans else "–"
    zero = sum(1 for x in ans if x["rr10"] == 0 and x["recall10"] == 0)
    na = [x for x in xs if not x["relevant"]]
    fh = f"{sum(1 for x in na if x['falseHits'])}/{len(na)} queries, {sum(x['falseHits'] for x in na)} hits" if na else "–"
    ms = [x["msMedian"] for x in xs]
    print(f"| {c} | {len(xs)} | {rec} | {mrr} | {zero}/{len(ans)} | {fh} | {pct(ms,.5):.0f} | {pct(ms,.95):.0f} |")
print()
print("warm in-process latency over all runs:", r["latencyMs"])
