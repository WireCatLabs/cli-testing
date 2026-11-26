"""Contestant 5: plain SQLite word search. FTS5 (unicode61, remove_diacritics 2) over the r9 copy's message text,
ranked by bm25, limit 50. Modes: and = every word of the question (FTS5's default), or = any word.
Usage: run.py <rep> [tid ...]"""
import csv, json, os, re, sqlite3, sys, time
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
sys.path.insert(0, f"{EXP}/p2")
from common import tests, answers, set_of
P = f"{EXP}/p2/fts"
SRC = f"file:{EXP}/r9/state/wirecat.db?mode=ro"
FTS = f"{P}/fts.db"
STATUS, ROWS = f"{P}/status.csv", f"{P}/rows.jsonl"
LIMIT = 50
if not os.path.exists(FTS):
  started = time.time()
  db = sqlite3.connect(FTS)
  db.execute("create virtual table m using fts5(text, tokenize='unicode61 remove_diacritics 2')")
  src = sqlite3.connect(SRC, uri=True)
  cur = src.execute("select id, text from messages where deleted_at is null and text != ''")
  while rows := cur.fetchmany(50000): db.executemany("insert into m(rowid, text) values (?, ?)", rows)
  db.commit()
  print(f"built {FTS} in {time.time() - started:.0f} s", flush=True)
db = sqlite3.connect(f"file:{FTS}?mode=ro", uri=True)

def search(q, op):
  terms = [f'"{w}"' for w in re.findall(r"\w+", q)]
  started = time.monotonic()
  ids = [r[0] for r in db.execute(f"select rowid from m where m match ? order by bm25(m) limit {LIMIT}",
                                  (f" {op} ".join(terms),))]
  return ids, round(time.monotonic() - started, 2)

def run(tid):
  keys = {a["key"][1] for a in answers[tid]}
  row = {}
  for op in ("AND", "OR"):
    ids, s = search(tests[tid]["q"], op)
    row[op.lower()] = next((k for k, i in enumerate(ids, 1) if i in keys), None)
    row[f"{op.lower()}_n"], row[f"{op.lower()}_seconds"] = len(ids), s
  return row

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
  brief = {k: row.get(k) for k in ("and", "or", "or_seconds")}
  w.writerow([row["id"], "done", json.dumps(brief), time.strftime("%H:%M:%S")]); status.flush()
  print(f"{n}/{len(todo)} {row['id']} {brief}", flush=True)
