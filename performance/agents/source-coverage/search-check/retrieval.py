"""Free check before any agent run: does the first meaning search find the key's messages, and how fast.

For every question with an answer (the key's Kn, by the question's number), runs `search conversations` the way the
r4b agent ran it (profile settings: local embeddinggemma) and with the OpenAI vectors the store holds. A hit is a
result chunk in one of the key's chats whose message range holds one of the key's message ids.
Per-question rows stay in this private folder; only totals leave it.
"""
import json
import os
import re
import subprocess
import sys
import time

CACHE = "/home/leemour/.cache/wirecat-experiment-b"
KEY = f"{CACHE}/r3/key.md"
QUESTIONS = f"{CACHE}/r4b/all-w.txt"
TG = f"{CACHE}/r4b/tg-0.133.0/bin/tg"
STATE = f"{CACHE}/wf/state"
OUT = f"{CACHE}/r4c/retrieval.jsonl"
NO_ANSWER = {18, 19, 20}
MODES = {
  "local": [],
  "openai": ["--embedding-provider", "openai", "--model", "text-embedding-3-small", "--dims", "768"],
}


def key_items():
  text = open(KEY).read()
  chats = {int(k): set(re.findall(r"\((-?\d+)\)", row)) for k, row in re.findall(r"^\| K(\d+) \|(.*)$", text, re.M)}
  items = {}
  for k, body in re.findall(r"^### K(\d+)\n(.*?)(?=^### K|\Z)", text, re.M | re.S):
    ids = set()
    # only the answer's own ids: the rest of the section also lists decoys (the wrong meaning, a wrong value)
    line = re.search(r"\*\*(?:Dates? and ids?|Checklist)[^*]*\*\*(.*?)(?=\n- \*\*|\Z)", body, re.S)
    for a, b in re.findall(r"\[(\d+)\](?:[–-]\[(\d+)\])?", line[1] if line else ""):
      ids.update(range(int(a), int(b or a) + 1))
    items[int(k)] = (chats.get(int(k), set()), ids)
  return items


def search(query, flags):
  env = {**os.environ, "WIRECAT_STATE_DIR": STATE}
  started = time.monotonic()
  run = subprocess.run([TG, "personal", "search", "conversations", query, *flags, "--json"],
                       capture_output=True, text=True, env=env, cwd="/var/tmp")
  seconds = time.monotonic() - started
  out = run.stdout[run.stdout.find("{"):]
  try:
    data = json.loads(out.split("\n")[0])
  except ValueError:
    return seconds, None, None
  meaning_gap = any(m.get("field") == "by" for m in data.get("missing", []))
  return seconds, data.get("items", []), meaning_gap


def rank_of_hit(items, chats, ids):
  for rank, item in enumerate(items, 1):
    chunk = item["chunk"]
    first, last = int(chunk["first_message_id"]), int(chunk["last_message_id"])
    if item["summary"]["chat_id"] in chats and any(first <= i <= last for i in ids):
      return rank
  return None


def main():
  key = key_items()
  rows = []
  for line in open(QUESTIONS):
    m = re.match(r"(\d+)([a-z]?)\.\s*(.*)", line.strip())
    if not m or int(m[1]) in NO_ANSWER:
      continue
    chats, ids = key[int(m[1])]
    for mode, flags in MODES.items():
      seconds, items, gap = search(m[3], flags)
      rank = rank_of_hit(items, chats, ids) if items is not None else None
      rows.append({"q": m[1] + m[2], "mode": mode, "seconds": round(seconds, 1), "rank": rank,
                   "error": items is None, "meaning_gap": gap})
      print(json.dumps(rows[-1]), flush=True)
  with open(OUT, "w") as f:
    f.writelines(json.dumps(r) + "\n" for r in rows)
  for mode in MODES:
    r = [x for x in rows if x["mode"] == mode]
    hits = lambda k: sum(1 for x in r if x["rank"] and x["rank"] <= k)
    times = sorted(x["seconds"] for x in r)
    print(f"{mode}: {len(r)} questions, hit@5 {hits(5)}, hit@20 {hits(20)}, errors {sum(x['error'] for x in r)}, "
          f"median {times[len(times) // 2]} s, max {times[-1]} s", file=sys.stderr)


main()
