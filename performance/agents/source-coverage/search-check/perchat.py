import os
"""Free check: search each of the 10 chats on its own, then merge, to see what per-chat search would give."""
import json
import re
import sys

sys.argv = ["x"]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "retrieval.py")).read().split("def main")[0])
CHATS = json.load(open("/home/leemour/.cache/wirecat-experiment-b/private.json"))["chats"]
OPENAI = ["--embedding-provider", "openai", "--model", "text-embedding-3-small", "--dims", "768"]
OUT = "/home/leemour/.cache/wirecat-experiment-b/r4c/perchat.jsonl"


def hit(item, chats, ids):
  c = item["chunk"]
  return item["summary"]["chat_id"] in chats and any(int(c["first_message_id"]) <= i <= int(c["last_message_id"]) for i in ids)


key = key_items()
rows = []
for line in open(QUESTIONS):
  m = re.match(r"(\d+)([a-z]?)\.\s*(.*)", line.strip())
  if not m or int(m[1]) in NO_ANSWER:
    continue
  chats, ids = key[int(m[1])]
  lists = {}
  total = 0
  for chat in CHATS:
    seconds, items, _ = search(m[3], OPENAI + ["--chat", chat, "--limit", "20"])
    total += seconds
    lists[chat] = items or []
  robin = [it for r in range(20) for chat in CHATS for it in lists[chat][r:r + 1]]
  by_score = sorted((it for l in lists.values() for it in l), key=lambda it: -(it["score"] or 0))
  rank = lambda merged: next((i for i, it in enumerate(merged, 1) if hit(it, chats, ids)), None)
  rows.append({"q": m[1] + m[2], "robin": rank(robin), "score": rank(by_score), "seconds": round(total, 1)})
  print(json.dumps(rows[-1]), flush=True)
open(OUT, "w").writelines(json.dumps(r) + "\n" for r in rows)
for k in ("robin", "score"):
  print(k, "hit@5", sum(1 for r in rows if r[k] and r[k] <= 5), "hit@20", sum(1 for r in rows if r[k] and r[k] <= 20),
        file=sys.stderr)
