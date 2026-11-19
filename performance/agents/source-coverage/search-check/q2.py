"""The focus questions only: rank of the true answer, all chats and in the focus chat (private.json). Rows stay private."""
import json, os, re, subprocess, sys, time
CACHE = "/home/leemour/.cache/wirecat-experiment-b"
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "retrieval.py")).read().split("def search")[0].replace('STATE = f"{CACHE}/wf/state"', ""))
STATE = f"{CACHE}/r5/state"
TG = ["node", "/home/leemour/Projects/AI/tg-cli-wt-search-perchat/dist/bin/tg.js"]
OPENAI = ["--embedding-provider", "openai", "--model", "text-embedding-3-small", "--dims", "768"]
CHAT = json.load(open("/home/leemour/.cache/wirecat-experiment-b/private.json"))["focus"]["chat"]

def run(args):
  env = {**os.environ, "WIRECAT_STATE_DIR": STATE, "TG_OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", "")}
  t = time.monotonic()
  r = subprocess.run([*TG, "personal", *args, "--json"], capture_output=True, text=True, env=env, cwd="/var/tmp")
  s = time.monotonic() - t
  out = r.stdout[r.stdout.find("{"):]
  try: return s, json.loads(out.split("\n")[0]), r.stderr
  except ValueError: return s, None, r.stderr

def rank(data, ids):
  for i, it in enumerate((data or {}).get("items", []), 1):
    c = it.get("chunk") or {"first_message_id": it.get("id"), "last_message_id": it.get("id")}
    if any(int(c["first_message_id"]) <= x <= int(c["last_message_id"]) for x in ids): return i
  return None

key = key_items()
qs = {m[1]: m[2] for m in (re.match(r"(\d+)\.\s*(.*)", l.strip()) for l in open(QUESTIONS)) if m and m[1] in ("3", "5")}
label = sys.argv[1]
rows = []
for q, text in qs.items():
  ids = key[int(q)][1]
  for scope, extra in (("all", []), ("chat", ["--chat", CHAT])):
    s, data, err = run(["search", "conversations", text, *OPENAI, *extra, "--limit", "100"])
    top_chats = [it["summary"]["chat_id"] for it in (data or {}).get("items", [])[:5]]
    notes = [m.get("why", "")[:80] for m in (data or {}).get("missing", [])] if data else [err[-300:]]
    rows.append({"q": q, "scope": scope, "rank": rank(data, ids), "seconds": round(s, 1),
                 "chat_in_top5": top_chats.count(CHAT), "named": ((data or {}).get("meta") or {}).get("named_chat", {}).get("chat_id"), "respelled": ((data or {}).get("meta") or {}).get("respelled")})
    print(json.dumps(rows[-1]), flush=True)
open(f"{CACHE}/r5/runs/q2-{label}.jsonl", "w").writelines(json.dumps(r) + "\n" for r in rows)
