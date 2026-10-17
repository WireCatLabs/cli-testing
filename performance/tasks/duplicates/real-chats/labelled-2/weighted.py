import sys, json, math, copy
sys.path.insert(0, ".")
from analyze import load, score, signals, W0

old, pool, newl = load()
targeted = [p for p in newl if any(s != "random" for s in p["strata"])]
random_ = [p for p in newl if p["strata"] == ["random"]]
w_random = (len(pool) - len(targeted)) / len(random_)
weighted = [(p, 1.0) for p in targeted] + [(p, w_random) for p in random_]
weighted = [(p, w) for p, w in weighted if p["label"] in ("same", "different")]
ns = sum(w for p, w in weighted if p["label"] == "same")
nd = sum(w for p, w in weighted if p["label"] == "different")
print(f"pool {len(pool)}, targeted {len(targeted)}, random {len(random_)} each standing for {w_random:.0f}")
print(f"weighted same {ns:.0f}, different {nd:.0f}")
for sg in ("trigram", "person", "reply"):
    s = sum(w for p, w in weighted if p["label"] == "same" and signals(p)[sg])
    d = sum(w for p, w in weighted if p["label"] == "different" and signals(p)[sg])
    print(f"{sg}: m {s / ns:.2f} ({s:.0f}/{ns:.0f}), u {d / nd:.3f} ({d:.0f}/{nd:.0f}), "
          f"weight {math.log2(((s + 0.5) / (ns + 1)) / ((d + 0.5) / (nd + 1))):+.1f}")
# A level seen on one side only keeps its shipped weight: a count of zero is not evidence.
fitted = copy.deepcopy(W0)
print("per level, pool-weighted:")
for f in W0:
    row = []
    for lv in W0[f]:
        s = sum(w for p, w in weighted if p["label"] == "same" and score(p)[1][f] == lv)
        d = sum(w for p, w in weighted if p["label"] == "different" and score(p)[1][f] == lv)
        wt = math.log2(((s + 0.5) / (ns + 1)) / ((d + 0.5) / (nd + 1)))
        if s > 0 and d > 0:
            fitted[f][lv] = round(wt, 1)
        row.append(f"{lv} {s:.0f}/{d:.0f} {wt:+.1f} (now {W0[f][lv]:+d})")
    print(f"  {f}: " + " | ".join(row))

lab = lambda ps: [p for p in ps if p["label"] in ("same", "different")]
def auc(ps, **kw):
    S = [score(p, **kw)[0] for p in ps if p["label"] == "same"]
    D = [score(p, **kw)[0] for p in ps if p["label"] == "different"]
    return sum((s > d) + 0.5 * (s == d) for s in S for d in D) / (len(S) * len(D))
print(f"AUC on old (held out): shipped {auc(lab(old)):.2f}, fitted on new pool-weighted {auc(lab(old), W=fitted):.2f}")
print("within maybe-or-likely as shipped (wrong / right):")
for name, ps in (("old", lab(old)), ("new", lab(newl)), ("all", lab(old) + lab(newl))):
    band = [p for p in ps if score(p)[0] >= 5]
    print(f"  {name}: " + ", ".join(
        f"{sg} {sum(1 for p in band if signals(p)[sg] and p['label'] == 'different')} / "
        f"{sum(1 for p in band if signals(p)[sg] and p['label'] == 'same')}"
        for sg in ("trigram", "person", "reply")) +
        f"; band {sum(1 for p in band if p['label'] == 'different')} / {sum(1 for p in band if p['label'] == 'same')}")
