"""Free check for round 5: hit@5 / hit@20 of `search conversations` with OpenAI vectors, all 40 and the d set.

Usage: python3 eval.py <label> [tg command...]   (default tg: the unbundled build of the r5 tg-cli worktree)
Rows stay in this private folder.
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
TG = ["node", "/home/leemour/Projects/AI/tg-cli-wt-search-perchat/dist/bin/tg.js"]
STATE = f"{CACHE}/wf/state"
OUT_DIR = f"{CACHE}/r5/runs"
NO_ANSWER = {18, 19, 20}
OPENAI = ["--embedding-provider", "openai", "--model", "text-embedding-3-small", "--dims", "768"]


def key_items():
  text = open(KEY).read()
  chats = {int(k): set(re.findall(r"\((-?\d+)\)", row)) for k, row in re.findall(r"^\| K(\d+) \|(.*)$", text, re.M)}
  items = {}
  for k, body in re.findall(r"^### K(\d+)\n(.*?)(?=^### K|\Z)", text, re.M | re.S):
    ids = set()
    for a, b in re.findall(r"\[(\d+)\](?:[–-]\[(\d+)\])?", body):
      ids.update(range(int(a), int(b or a) + 1))
    items[int(k)] = (chats.get(int(k), set()), ids)
  return items


def questions():
  key = key_items()
  for line in open(QUESTIONS):
    m = re.match(r"(\d+)([a-z]?)\.\s*(.*)", line.strip())
    if m and int(m[1]) not in NO_ANSWER:
      yield m[1] + m[2], m[3], *key[int(m[1])]


def search(tg, query, flags):
  env = {**os.environ, "WIRECAT_STATE_DIR": STATE, "TG_OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", "")}
  started = time.monotonic()
  run = subprocess.run([*tg, "personal", "search", "conversations", query, *flags, "--json"],
                       capture_output=True, text=True, env=env, cwd="/var/tmp")
  seconds = time.monotonic() - started
  out = run.stdout[run.stdout.find("{"):]
  try:
    data = json.loads(out.split("\n")[0])
  except ValueError:
    return seconds, None, run.stderr[-500:]
  return seconds, data, None


def is_hit(item, chats, ids):
  chunk = item["chunk"]
  first, last = int(chunk["first_message_id"]), int(chunk["last_message_id"])
  return item["summary"]["chat_id"] in chats and any(first <= i <= last for i in ids)


def summary(rows, label):
  def line(r, name):
    hits = lambda k: sum(1 for x in r if x["rank"] and x["rank"] <= k)
    times = sorted(x["seconds"] for x in r)
    return (f"{name}: {len(r)} q, hit@5 {hits(5)}, hit@20 {hits(20)}, errors {sum(x['error'] for x in r)}, "
            f"median {times[len(times) // 2]} s, max {times[-1]} s")
  return "\n".join([f"[{label}]", line(rows, "all"), line([x for x in rows if x["q"].endswith("d")], "d")])


def main():
  label = sys.argv[1]
  tg = sys.argv[2:] or TG
  extra = json.loads(os.environ.get("EXTRA", "[]"))
  os.makedirs(OUT_DIR, exist_ok=True)
  rows = []
  for q, text, chats, ids in questions():
    seconds, data, error = search(tg, text, OPENAI + extra)
    items = (data or {}).get("items", [])
    rank = next((i for i, it in enumerate(items, 1) if is_hit(it, chats, ids)), None)
    rows.append({"q": q, "seconds": round(seconds, 2), "rank": rank, "error": data is None,
                 "gold": sorted(chats), "top": [[it["summary"]["chat_id"], it["by"]] for it in items[:20]],
                 **({"stderr": error} if error else {}), **({"chat_counts": data.get("chats")} if data and "chats" in data else {})})
    print(json.dumps({k: rows[-1][k] for k in ("q", "seconds", "rank", "error")}), flush=True)
  with open(f"{OUT_DIR}/{label}.jsonl", "w") as f:
    f.writelines(json.dumps(r) + "\n" for r in rows)
  text = summary(rows, label)
  with open(f"{OUT_DIR}/{label}.sum", "w") as f:
    f.write(text + "\n")
  print(text, file=sys.stderr)


if __name__ == "__main__":
  main()
