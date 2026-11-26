"""Contestant 1: WireCat tg (npm release) search conversations, question as typed, offline on the r9 copy.
Scoring copied from r13/held/batch.py run() (main, shown_id, shown_own, own). Usage: run.py <rep> [tid ...]"""
import csv, fcntl, json, os, re, subprocess, sys, time
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
sys.path.insert(0, f"{EXP}/p2")
from common import tests, answers, in_chunk, in_range, set_of
LOCK = f"{EXP}/r12/tg.lock"
STATE = f"{EXP}/r9/state"
CONFIG = f"{EXP}/lib/tg-config"
TG = f"{EXP}/p2/tg/node_modules/@wirecat/tg-cli/dist/bin/tg.js"
OUT = f"{EXP}/p2/tgrun"
STATUS, ROWS, RAW = f"{OUT}/status.csv", f"{OUT}/rows.jsonl", f"{OUT}/raw"

def run(tid):
  ans = answers[tid]
  args = ["node", TG, "personal", "search", "conversations", tests[tid]["q"], "--json", "--offline", "--timeout", "180s"]
  base = {k: v for k, v in os.environ.items() if not k.startswith("WIRECAT_EXP_")}
  env = {**base, "WIRECAT_STATE_DIR": STATE, "TG_CONFIG_DIR": CONFIG,
         "TG_OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", ""), "TG_EMBEDDING_PROVIDER": "openai",
         "TG_EMBEDDING_MODEL": "text-embedding-3-small", "TG_EMBEDDING_DIMS": "768", "DBUS_SESSION_BUS_ADDRESS": "disabled:"}
  with open(LOCK, "w") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    started = time.monotonic()
    r = subprocess.run(args, capture_output=True, text=True, env=env, cwd="/var/tmp")
    seconds = round(time.monotonic() - started, 1)
  open(f"{RAW}/{tid}.json", "w").write(r.stdout)
  try: d = json.loads(r.stdout[r.stdout.find("{"):].split("\n")[0])
  except ValueError: return {"error": f"exit {r.returncode}, stdout {len(r.stdout)} bytes", "seconds": seconds}
  items = d.get("items", [])
  main = [i for i in items if not i.get("from_owner")]
  own = [i for i in items if i.get("from_owner")]
  rank = lambda xs, f: next((k for k, i in enumerate(xs, 1) if f(i)), None)
  shown = lambda i: any(str(i["summary"]["chat_id"]) == a["chat"] and a["ext"] in {str(x) for x in i.get("line_ids", [])}
                        for a in ans)
  keys = [a["text"] for a in ans if a["text"]]
  shown_text = lambda i: any(k in re.sub(r"\s+", " ", l).lower() for l in i.get("lines", []) for k in keys)
  return {"shown_text": rank(items, shown_text), "shown_text_main": rank(main, shown_text), "shown_id": rank(items, shown), "shown_main": rank(main, shown), "shown_own": rank(own, shown),
          "main": rank(main, lambda i: any(in_chunk(i, a) for a in ans)),
          "own": rank(own, lambda i: any(in_chunk(i, a) for a in ans)),
          "main_range": rank(main, lambda i: any(in_range(i, a) for a in ans)),
          "n_main": len(main), "n_own": len(own), "has_line_ids": any("line_ids" in i for i in items),
          "bytes": len(r.stdout), "seconds": seconds}

os.makedirs(RAW, exist_ok=True)
new = not os.path.exists(STATUS)
status = open(STATUS, "a", newline="")
w = csv.writer(status)
if new: w.writerow(["id", "status", "detail", "time"]); status.flush()
done = {row["id"] for row in csv.DictReader(open(STATUS)) if row["status"] == "done"}
rows = open(ROWS, "a")
print(f"status: {STATUS}", flush=True)
rep = sys.argv[1]
todo = [t for t in (sys.argv[2:] or list(tests)) if f"{rep}/{t}" not in done]
for n, tid in enumerate(todo, 1):
  row = {"id": f"{rep}/{tid}", "rep": rep, "t": tid, "set": set_of(tid), **run(tid)}
  rows.write(json.dumps(row) + "\n"); rows.flush()
  w.writerow([row["id"], "error" if "error" in row else "done",
              json.dumps({k: row.get(k) for k in ("main", "own", "shown_text", "seconds")}), time.strftime("%H:%M:%S")])
  status.flush()
  print(f"{n}/{len(todo)} {row['id']} main={row.get('main')} own={row.get('own')} shown={row.get('shown_text')} s={row.get('seconds')}", flush=True)
