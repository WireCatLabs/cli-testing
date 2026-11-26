"""Contestant 3: qmd 2.9.0 over Markdown from r9 (one file per chat per UTC day). Modes: query (hybrid: expansion,
BM25 + vectors, rerank) and search (BM25). Question as typed, --json (qmd's default 20 results for json).
Hit = the file holding an answer message (chat + UTC day of sent_at); text = the answer's text is in the snippet.
Usage: run.py <rep> [tid ...]"""
import csv, json, os, re, subprocess, sys, time
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
sys.path.insert(0, f"{EXP}/p2")
from common import tests, answers, set_of
P = f"{EXP}/p2/qmd"
QMD = f"{P}/pkg/node_modules/.bin/qmd"
ENV = {**os.environ, "XDG_CACHE_HOME": f"{P}/big/cache", "QMD_CONFIG_DIR": f"{P}/big/config", "QMD_FORCE_CPU": "1"}
STATUS, ROWS = f"{P}/status.csv", f"{P}/rows.jsonl"

def files_of(tid):
  return {f"qmd://tg/chat-{a['chat_pk']}/{time.strftime('%Y-%m-%d', time.gmtime(a['key'][0] / 1000))}.md" for a in answers[tid]}

def run_mode(tid, mode):
  started = time.monotonic()
  r = subprocess.run([QMD, mode, tests[tid]["q"], "--json"], capture_output=True, text=True, env=ENV, cwd=P)
  seconds = round(time.monotonic() - started, 1)
  try: items = json.loads(r.stdout[r.stdout.find("["):])
  except ValueError: return {f"{mode}_error": f"exit {r.returncode}: {r.stderr[-300:]}", f"{mode}_seconds": seconds}
  want, keys = files_of(tid), [a["text"] for a in answers[tid] if a["text"]]
  hit = next((k for k, i in enumerate(items, 1) if i["file"] in want), None)
  text = next((k for k, i in enumerate(items, 1)
               if any(t in re.sub(r"\s+", " ", i.get("snippet", "")).lower() for t in keys)), None)
  return {mode: hit, f"{mode}_text": text, f"{mode}_n": len(items), f"{mode}_seconds": seconds}

new = not os.path.exists(STATUS)
status = open(STATUS, "a", newline="")
w = csv.writer(status)
if new: w.writerow(["id", "status", "detail", "time"]); status.flush()
done = {row["id"] for row in csv.DictReader(open(STATUS)) if row["status"] == "done"}
rows = open(ROWS, "a")
print(f"status: {STATUS}", flush=True)
rep, modes = sys.argv[1], sys.argv[2].split(",")
todo = [t for t in (sys.argv[3:] or list(tests)) if f"{rep}/{t}" not in done]
for n, tid in enumerate(todo, 1):
  row = {"id": f"{rep}/{tid}", "rep": rep, "t": tid, "set": set_of(tid)}
  for m in modes: row.update(run_mode(tid, m))
  rows.write(json.dumps(row) + "\n"); rows.flush()
  err = any(k.endswith("_error") for k in row)
  w.writerow([row["id"], "error" if err else "done", json.dumps({k: v for k, v in row.items() if k not in ("id", "rep", "t", "set")})[:300],
              time.strftime("%H:%M:%S")]); status.flush()
  print(f"{n}/{len(todo)} {row['id']} " + " ".join(f"{m}={row.get(m)} {row.get(m + '_seconds')}s" for m in modes), flush=True)
