"""Totals with 95% bootstrap intervals and judge agreement for layer 2, from existing blind scores only.

Each positional argument is one run of the agents: a comma-separated list of scoring folders (under scoring/) that
judged the same answers. A question's score for a (model, arm) is the mean over the judges of a run, then the mean
over runs. Intervals resample the questions (10 000 draws, fixed seed, the same draws for every arm).
Usage: python3 -I stats.py [--agreement-only] <judge-a>,<judge-b> [<r2-judge-a>,<r2-judge-b> ...]"""
import itertools, json, random, re, sys
import os
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder

L2 = f"{EXP}/p2/layer2"
SCORING = f"{L2}/scoring"
DRAWS = 10_000
SEED = 20261126
BASE = "tg-skill"
ARMS = ["tg", "tg-skill", "jw", "qmd", "qmd-skill", "grep"]


def load_judge(name):
  blind = json.load(open(f"{SCORING}/{name}/blind-key.json"))
  sheets = {}
  for letter, who in blind.items():
    text = open(f"{SCORING}/{name}/scores-{letter}.md").read()
    m = re.findall(r"SCORES\s+(.+)", text)
    if not m:
      raise SystemExit(f"{name}: no SCORES line for {letter}")
    scores = {}
    for part in m[-1].replace("`", "").split(","):
      k, v = part.strip().split("=")
      scores[int(k)] = float(v.strip().rstrip("*").strip())
    total = re.findall(r"TOTAL\s+([\d.]+)", text)
    if total and float(total[-1]) != sum(scores.values()):
      print(f"> warning: {name} {who}: TOTAL {total[-1]} but SCORES sum to {sum(scores.values()):g}\n")
    sheets[who] = scores
  return sheets


def ci(values):
  values = sorted(values)
  return values[int(0.025 * len(values))], values[int(0.975 * len(values)) - 1]


def agreement(runs):
  lines = ["## Judge agreement", "",
           "Cells are (sheet, question) pairs both judges scored. Totals are per sheet.", "",
           "| judge pair | sheets | same score | mean abs. total difference | max abs. total difference |",
           "| --- | --- | --- | --- | --- |"]
  for run in runs:
    for (na, ja), (nb, jb) in itertools.combinations(run.items(), 2):
      shared = sorted(set(ja) & set(jb))
      cells = [(ja[w][q], jb[w][q]) for w in shared for q in ja[w] if q in jb[w]]
      diffs = [abs(sum(ja[w].values()) - sum(jb[w].values())) for w in shared]
      same = sum(a == b for a, b in cells)
      lines.append(f"| {na} vs {nb} | {len(shared)} | {same}/{len(cells)} ({same / len(cells):.1%}) | "
                   f"{sum(diffs) / len(diffs):.2f} | {max(diffs):g} |")
  return "\n".join(lines + [""])


def main(args):
  only_agreement = "--agreement-only" in args
  args = [a for a in args if a != "--agreement-only"]
  if not args:
    raise SystemExit(__doc__)
  runs = [{name: load_judge(name) for name in arg.split(",")} for arg in args]
  if only_agreement:
    print(agreement(runs))
    return

  ids = None
  for run in runs:
    for name, judge in run.items():
      for who, scores in judge.items():
        if ids is None:
          ids = sorted(scores)
        if sorted(scores) != ids:
          raise SystemExit(f"{name} {who}: question ids differ from the first sheet")
  n = len(ids)

  # per[(who)][run index] = per-question mean over that run's judges that scored the sheet
  per = {}
  for r, run in enumerate(runs):
    for who in sorted({w for judge in run.values() for w in judge}):
      judges = [j[who] for j in run.values() if who in j]
      if len(judges) < len(run):
        print(f"> note: run {r + 1}: {who} scored by {len(judges)} of {len(run)} judges\n")
      per.setdefault(who, {})[r] = [sum(j[q] for j in judges) / len(judges) for q in ids]

  def mean_over_runs(who, use_runs):
    return [sum(per[who][r][i] for r in use_runs) / len(use_runs) for i in range(n)]

  rng = random.Random(SEED)
  draws = [[rng.randrange(n) for _ in range(n)] for _ in range(DRAWS)]
  boot = lambda s: [sum(s[i] for i in d) for d in draws]

  out = ["# Layer 2: totals with 95% bootstrap intervals", "",
         f"Runs: {len(runs)} ({'; '.join(' + '.join(run) for run in runs)}). Questions: {n}. "
         f"A question's score is the mean over the judges of a run, then over runs. Intervals: percentile bootstrap over "
         f"the {n} questions, {DRAWS:,} draws, seed {SEED}, the same draws for every arm. The paired difference vs "
         f"{BASE} uses the same draws for both arms and only runs where both exist. P(diff > 0) is the share of draws "
         "where the arm beats the base; it is not a p-value.", ""]
  for model in sorted({w.split(":")[0] for w in per}):
    out += [f"## {model}", "",
            f"| arm | runs x judges | total | 95% interval | diff vs {BASE} | 95% interval of diff | P(diff > 0) |",
            "| --- | --- | --- | --- | --- | --- | --- |"]
    base = f"{model}:{BASE}"
    for arm in sorted({w.split(":")[1] for w in per if w.startswith(model + ":")},
                      key=lambda a: ARMS.index(a) if a in ARMS else len(ARMS)):
      who = f"{model}:{arm}"
      rs = sorted(per[who])
      s = mean_over_runs(who, rs)
      lo, hi = ci(boot(s))
      judges = "/".join(str(sum(who in j for j in runs[r].values())) for r in rs)
      row = f"| {arm} | {len(rs)} x {judges} | {sum(s):.2f} | {lo:.2f} to {hi:.2f} |"
      if who == base or base not in per:
        row += " - | - | - |"
      else:
        both = [r for r in rs if r in per[base]]
        d = [a - b for a, b in zip(mean_over_runs(who, both), mean_over_runs(base, both))]
        bd = boot(d)
        dlo, dhi = ci(bd)
        row += f" {sum(d):+.2f} | {dlo:+.2f} to {dhi:+.2f} | {sum(x > 0 for x in bd) / DRAWS:.2f} |"
      out.append(row)
    out.append("")
  if len(runs) > 1:
    out += ["## Total per run", "", "| sheet | " + " | ".join(f"run {r + 1}" for r in range(len(runs))) + " |",
            "| --- |" + " --- |" * len(runs)]
    for who in sorted(per):
      out.append(f"| {who} | " + " | ".join(f"{sum(per[who][r]):.2f}" if r in per[who] else "" for r in range(len(runs)))
                 + " |")
    out.append("")
  out.append(agreement(runs))
  print("\n".join(out))


main(sys.argv[1:])
