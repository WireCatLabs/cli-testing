"""Agreement of the three runtimes on the holdout pairs, and how often each puts a graded answer in its top 3.
Usage: python agreement.py <python.json> <wasm.json> <native.json>"""
import json
import sys
from collections import defaultdict

python, wasm, native = (json.load(open(p))["pairs"] for p in sys.argv[1:4])
scores = {"python": [p["python"] for p in python], "wasm": [p["wasm"] for p in wasm], "native": [p["native"] for p in native]}
questions = defaultdict(list)
for i, p in enumerate(python):
  questions[p["q"]].append(i)


def ranks(values):
  out = [0] * len(values)
  for rank, i in enumerate(sorted(range(len(values)), key=lambda i: -values[i])):
    out[i] = rank
  return out


def spearman(a, b):
  ra, rb, n = ranks(a), ranks(b), len(a)
  return 1 - 6 * sum((x - y) ** 2 for x, y in zip(ra, rb)) / (n * (n * n - 1))


def top(values, k):
  return set(sorted(range(len(values)), key=lambda i: -values[i])[:k])


grades = sorted({p["grade"] for p in python})
result = {"questions": len(questions), "pairs": len(python), "grades": grades, "pairs_compared": {}, "answer_at_3": {}}
for a, b in (("wasm", "python"), ("native", "python"), ("native", "wasm")):
  rhos, same3, same5, diff = [], 0, 0, 0
  for idx in questions.values():
    x, y = [scores[a][i] for i in idx], [scores[b][i] for i in idx]
    rhos.append(spearman(x, y))
    same3 += top(x, 3) == top(y, 3)
    same5 += len(top(x, 5) & top(y, 5))
    diff = max(diff, max(abs(u - v) for u, v in zip(x, y)))
  result["pairs_compared"][f"{a}_vs_{b}"] = {
    "spearman_min": round(min(rhos), 3), "spearman_median": round(sorted(rhos)[len(rhos) // 2], 3),
    "questions_same_top3": same3, "top5_shared_of_45": same5, "largest_score_change": round(diff, 3)}
best = max(grades)
for runtime, values in scores.items():
  hit = 0
  for idx in questions.values():
    hit += any(python[i]["grade"] >= best for i in top([values[i] for i in idx], 3) for i in [idx[i]])
  result["answer_at_3"][runtime] = f"{hit}/{len(questions)}"
print(json.dumps(result, indent=1))
