"""Add 150 LoCoMo questions to questions.json for the Claude extension of post 1: 15 per
conversation, none already picked, categories 1-4 dealt 4/4/3/4 (conv-30 has no open-domain, so single-hop takes its
3). Ids end in -e<n> so they never clash with the first 50. questions-50.json keeps the first set."""
import json
import random
import re
from datetime import datetime

SOURCE = "/var/tmp/locomo-bench/locomo-src/locomo10.json"
FIRST = "/var/tmp/locomo-bench/questions-50.json"
OUTPUT = "/var/tmp/locomo-bench/questions.json"
SEED = 20261125
NAMES = {1: "multi-hop", 2: "temporal", 3: "open-domain", 4: "single-hop"}
SHARE = {1: 4, 2: 4, 3: 3, 4: 4}

rng = random.Random(SEED)
data = json.load(open(SOURCE))
first = json.load(open(FIRST))
used = {(q["conversation"], q["question"]) for q in first["questions"]}
picked = []
for sample in data:
    sid, conv = sample["sample_id"], sample["conversation"]
    dates = [datetime.strptime(v.strip(), "%I:%M %p on %d %B, %Y") for k, v in conv.items()
             if re.fullmatch(r"session_\d+_date_time", k)]
    pools = {c: [q for q in sample["qa"] if q["category"] == c and (sid, q["question"]) not in used] for c in NAMES}
    share = dict(SHARE)
    if not pools[3]:
        share[4] += share.pop(3)
    for cat, count in share.items():
        for n, qa in enumerate(rng.sample(pools[cat], count), 1):
            picked.append({"id": f"{sid}-c{cat}-e{n}", "conversation": sid, "category": cat,
                           "category_name": NAMES[cat], "question": qa["question"], "answer": str(qa["answer"]),
                           "evidence": qa.get("evidence", []), "as_of": max(dates).date().isoformat()})
json.dump({**first, "extension": {"seed": SEED, "count": len(picked)}, "questions": first["questions"] + picked},
          open(OUTPUT, "w"), indent=2, ensure_ascii=False)
open("/var/tmp/locomo-bench/ext-ids.txt", "w").write(",".join(q["id"] for q in picked) + "\n")
from collections import Counter
print(len(picked), Counter(q["category_name"] for q in picked))
