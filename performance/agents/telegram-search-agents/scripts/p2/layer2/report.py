"""Totals for layer 2 from the blind scores of one scoring run and rows-v2.jsonl (the last row per id wins).
Usage: python3 -I report.py <scoring-name> [stage-name=H-id,H-id ...]"""
import json, re, statistics, sys
import os
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder

L2 = f"{EXP}/p2/layer2"
name = sys.argv[1]
stages = [(s.split("=")[0], s.split("=")[1].split(",")) for s in sys.argv[2:]]
out = f"{L2}/scoring/{name}"
blind = json.load(open(f"{out}/blind-key.json"))
rows = {}
for line in open(f"{L2}/rows-v2.jsonl"):
  r = json.loads(line)
  rows[r["id"]] = r
scores = {}
for letter, who in blind.items():
  text = open(f"{out}/scores-{letter}.md").read()
  m = re.findall(r"SCORES\s+(.+)", text)
  if not m:
    raise SystemExit(f"no SCORES line for {letter}")
  for part in m[-1].replace("`", "").split(","):
    k, v = part.strip().split("=")
    scores[(who, f"H{int(k)}")] = (float(v.strip().rstrip("*").strip()), v.strip().endswith("*"))
ARMS = ["tg", "tg-skill", "jw", "qmd", "qmd-skill", "grep"]
LABEL = {"tg": "WireCat tg 0.135.0", "tg-skill": "WireCat tg 0.135.0 + its skill", "jw": "jackwener tg-cli 0.6.0", "qmd": "qmd 2.9.0", "qmd-skill": "qmd 2.9.0 + its skill",
         "grep": "grep + Read over Markdown (synthetic reference)"}


def table(ids, title):
  lines = [f"#### {title}", ""]
  for model in ("haiku", "sonnet"):
    lines += [f"**{model}** ({len(ids)} questions)", "",
              "| arm | score | fact with source (1) | confidently wrong | out of budget | median s | median tokens |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for arm in ARMS:
      who = f"{model}:{arm}"
      if not all((who, t) in scores for t in ids):
        continue
      s = [scores[(who, t)] for t in ids]
      rs = [rows[f"{who}:{t}"] for t in ids]
      lines.append(f"| {LABEL[arm]} | {sum(x for x, _ in s):g} | {sum(x == 1 for x, _ in s)} | {sum(c for _, c in s)} | "
                   f"{sum(r['budget'] == 'out' for r in rs)} | {statistics.median(r['wall'] for r in rs):g} | "
                   f"{statistics.median(r['tokens'] for r in rs):,.0f} |")
    lines.append("")
  return "\n".join(lines)


ids_all = sorted({t for (_, t) in scores}, key=lambda t: int(t[1:]))
print(table(ids_all, f"All scored ({len(ids_all)})"))
for sname, ids in stages:
  print(table(ids, sname))
priv = ["| id | " + " | ".join(blind[l] for l in sorted(blind, key=lambda l: blind[l])) + " |",
        "| --- |" + " --- |" * len(blind)]
for t in ids_all:
  cells = []
  for who in sorted(blind.values()):
    x = scores.get((who, t))
    cells.append("" if x is None else f"{x[0]:g}{' CW' if x[1] else ''}")
  priv.append(f"| {t} | " + " | ".join(cells) + " |")
open(f"{out}/rows-table.md", "w").write("\n".join(priv) + "\n")
