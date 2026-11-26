"""Pick 50 LoCoMo questions: 5 per conversation, categories 1-4 spread evenly (13/13/12/12), adversarial (5) left out."""
import json
import random
import re
from datetime import datetime

SOURCE = "/var/tmp/locomo-bench/locomo-src/locomo10.json"
OUTPUT = "/var/tmp/locomo-bench/questions-50.json"
SEED = 20261123
# Names from LoCoMo's own scorer (task_eval/evaluation.py 203-217, gpt_utils.py 243-244) and the questions themselves.
NAMES = {1: "multi-hop", 2: "temporal", 3: "open-domain", 4: "single-hop"}


def session_date(text):
    return datetime.strptime(text.strip(), "%I:%M %p on %d %B, %Y")


rng = random.Random(SEED)
data = json.load(open(SOURCE))
# One of each category a conversation has, then extra slots up to 5 per conversation, dealt so the totals are
# 13/13/12/12. conv-30 has no open-domain question, so it takes two extras.
quota = {s["sample_id"]: sorted({q["category"] for q in s["qa"]} - {5}) for s in data}
slots = [sid for sid, cats in quota.items() for _ in range(5 - len(cats))]
while True:
    extras = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]
    rng.shuffle(extras)
    if all(cat in quota[sid] for sid, cat in zip(slots, extras)):
        break
for sid, cat in zip(slots, extras):
    quota[sid] = quota[sid] + [cat]
picked = []
for sample in data:
    conv = sample["conversation"]
    dates = [session_date(v) for k, v in conv.items() if re.fullmatch(r"session_\d+_date_time", k)]
    cats = quota[sample["sample_id"]]
    for cat in sorted(set(cats)):
        pool = [q for q in sample["qa"] if q["category"] == cat]
        for n, qa in enumerate(rng.sample(pool, cats.count(cat))):
            picked.append({"id": f"{sample['sample_id']}-c{cat}-{n + 1}", "conversation": sample["sample_id"],
                           "category": cat, "category_name": NAMES[cat], "question": qa["question"],
                           "answer": str(qa["answer"]), "evidence": qa.get("evidence", []),
                           "as_of": max(dates).date().isoformat()})
json.dump({"source": "snap-research/locomo data/locomo10.json", "seed": SEED, "questions": picked},
          open(OUTPUT, "w"), indent=2, ensure_ascii=False)
from collections import Counter
print(len(picked), Counter(q["category_name"] for q in picked))
