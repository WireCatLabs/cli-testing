# python3 sample.py — the labelling sample: every targeted pair, plus a seeded uniform draw from the rest of the pool.
import json, random

cfg = json.load(open("chats.json"))
scored = {x["k"]: x for x in json.load(open("new-scored.json"))}
flagged = {f"{a}-{b}" for a, b in json.load(open("flag.json"))}
strata = {
    "flagged": {k for k, v in scored.items() if v["band"] != "different"} | flagged,
    "reply": {k for k, v in scored.items() if v["levels"]["reply"] == "yes"},
    "trigram": {k for k, v in scored.items() if v["text"]["trigrams"] > v["text"]["stems"] and v["levels"]["text"] != "low"},
    "person": {k for k, v in scored.items() if v["levels"]["person"] == "same" and v["levels"]["text"] != "low"},
}
targeted = set().union(*strata.values())
strata["random"] = set(random.Random(cfg["seed"]).sample(sorted(set(scored) - targeted), cfg["random"]))
keys = sorted(targeted | strata["random"], key=lambda k: tuple(map(int, k.split("-"))))
json.dump([{"k": k, "strata": [n for n, s in strata.items() if k in s]} for k in keys], open("sample.json", "w"))
print(len(keys), "pairs:", {n: len(s) for n, s in strata.items()})
