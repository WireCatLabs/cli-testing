"""Totals per arm and mode from batch.py rows, and the rows where an arm moves 2 or more places from the baseline.

Usage: python3 -I compare.py ROWS BASE OTHER [OTHER ...]
Each of BASE and OTHER is REP:ARM (one run of one arm). Prints ids and ranks only, never question text.
"""
import json, statistics, sys

rows_path, labels = sys.argv[1], sys.argv[2:]
wanted = {tuple(x.split(":")): x for x in labels}
rows = {}
for line in open(rows_path):
  r = json.loads(line)
  label = wanted.get((r["rep"], r["arm"]))
  if label:
    rows[(r["t"], label, r["mode"])] = r
print("rows", len(rows), "errors", [k for k, r in rows.items() if "error" in r])
print("| mode | arm | shown | shown top 5 | main top 20 | median s |\n| --- | --- | --- | --- | --- | --- |")
for mode in ("asked", "reply"):
  for label in labels:
    xs = [r for (_, lab, m), r in rows.items() if lab == label and m == mode]
    if not xs:
      continue
    shown = sum(r.get("shown_id") is not None for r in xs)
    top5 = sum((r.get("shown_id") or 99) <= 5 for r in xs)
    top20 = sum((r.get("main") or 99) <= 20 for r in xs)
    print(f"| {mode} | {label} | {shown} | {top5} | {top20} | {statistics.median(r['seconds'] for r in xs)} |")
print("moves of 2+ against", labels[0], "(shown_id / main):")
for (t, label, m), r in sorted(rows.items()):
  b = rows.get((t, labels[0], m))
  if label == labels[0] or b is None:
    continue
  for f in ("shown_id", "main"):
    x, y = b.get(f), r.get(f)
    if x != y and (x is None or y is None or abs(x - y) >= 2):
      print(f"  {t} {m} {label} {f}: {x} -> {y}")
