"""Search-only check: where `tg search conversations` puts each question's answer, per arm and mode, one call at a time.

Usage:
  python3 -I batch.py --store DIR --tg TG_JS --config DIR --profile NAME --questions FILE [--questions FILE ...]
                      --out DIR [--flag reply|like] REP [TEST:ARM:MODE ...]

No TEST:ARM:MODE given = every question x arms NEW, OLD x modes asked, reply, interleaved per question.
Every arm except NEW and PR sets `WIRECAT_EXP_*` switches that exist only in the experiment build of cli-core.
A questions file is a JSON list of {"t": id, "q": question, "hyde": made-up reply, "msg": store message id of the
answer, "also_ok": [store message ids that also answer]}. Rows go to OUT/rows.jsonl, one status row per call to
OUT/status.csv; a rerun skips calls the status file marks done.
"""
import argparse, csv, fcntl, json, os, re, sqlite3, subprocess, time

p = argparse.ArgumentParser()
p.add_argument("--store", required=True, help="state folder of the store copy (holds wirecat.db)")
p.add_argument("--tg", required=True, help="dist/bin/tg.js of the tg build under test")
p.add_argument("--config", required=True, help="TG_CONFIG_DIR with the profile's config")
p.add_argument("--profile", required=True)
p.add_argument("--questions", action="append", required=True)
p.add_argument("--out", required=True)
p.add_argument("--flag", choices=("reply", "like"), default="like",
               help="made-up reply flag: the experiment build took --reply, the released one takes --like")
p.add_argument("--lock", help="file lock shared with other runs on the same machine")
p.add_argument("rep")
p.add_argument("specs", nargs="*")
a = p.parse_args()

STATUS, ROWS, ERRS = f"{a.out}/status.csv", f"{a.out}/rows.jsonl", f"{a.out}/stderr.log"
LOCK = a.lock or f"{a.out}/tg.lock"
STDERR_TAGS = ("named-chat", "wordrank", "replylines", "bigchunk", "translit", "share")
COMMON = {"WIRECAT_EXP_REPLY_WORDS_WEIGHT": "0", "WIRECAT_EXP_LINE_IDS": "1", "WIRECAT_EXP_TIMING": "1"}
ARMS = {"NEW": {}, "PR": {}, "OLD": {"WIRECAT_EXP_NAMED_SHARE": "0", "WIRECAT_EXP_OLD_WORD_RANK": "1"},
        "NS0": {"WIRECAT_EXP_NAMED_SHARE": "0"}, "WR0": {"WIRECAT_EXP_OLD_WORD_RANK": "1"},
        "OWN10": {"WIRECAT_EXP_OWN_FETCH": "10"}, "OWNA": {"WIRECAT_EXP_OWN_AFTER": "1"},
        "BIG": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_BIG_SHARE": "100"},
        "NEXT": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_NEXT_LINE": "1"},
        "CAP": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_REPLY_CAP": "7:3"},
        "LQ": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_LINES_ASKED": "1"},
        "BIG50": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_BIG_SHARE": "50"},
        "NOBIG": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_NEXT_LINE": "1", "WIRECAT_EXP_REPLY_CAP": "7:3",
                  "WIRECAT_EXP_LINES_ASKED": "1"},
        "TAIL": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_BIG_SHARE": "100", "WIRECAT_EXP_BIG_TAIL": "1"},
        "ALL2": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_BIG_SHARE": "100", "WIRECAT_EXP_BIG_TAIL": "1",
                 "WIRECAT_EXP_NEXT_LINE": "1", "WIRECAT_EXP_REPLY_CAP": "7:3", "WIRECAT_EXP_LINES_ASKED": "1"},
        "ALL3": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_BIG_SHARE": "100", "WIRECAT_EXP_BIG_TAIL": "1",
                 "WIRECAT_EXP_NEXT_LINE": "1", "WIRECAT_EXP_LINES_ASKED": "1"},
        "ALL": {"WIRECAT_EXP_OWN_AFTER": "1", "WIRECAT_EXP_BIG_SHARE": "100", "WIRECAT_EXP_NEXT_LINE": "1",
                "WIRECAT_EXP_REPLY_CAP": "7:3", "WIRECAT_EXP_LINES_ASKED": "1"}}
for n in range(1, 7):
  ARMS[f"IDF{n}" if n > 1 else "IDF"] = {**ARMS["ALL3"], "WIRECAT_EXP_WORDS_IDF": str(n)}
ARMS["RL1"] = {**ARMS["IDF4"], "WIRECAT_EXP_REPLY_LINES": "1"}
ARMS["RL2"] = {**ARMS["IDF4"], "WIRECAT_EXP_REPLY_LINES": "2"}
ARMS["CAP1"] = {**ARMS["RL1"], "WIRECAT_EXP_OWN_CHAT_CAP": "1"}
ARMS["CAP2"] = {**ARMS["RL1"], "WIRECAT_EXP_OWN_CHAT_CAP": "2"}
ARMS["BC1"] = {**ARMS["RL1"], "WIRECAT_EXP_BIG_CHUNK": "1"}
ARMS["BC2"] = {**ARMS["RL1"], "WIRECAT_EXP_BIG_CHUNK": "2"}
ARMS["TL"] = {**ARMS["RL1"], "WIRECAT_EXP_TRANSLIT": "1"}
ARMS["TL2"] = {**ARMS["RL1"], "WIRECAT_EXP_TRANSLIT": "2"}
ARMS["TL3"] = {**ARMS["RL1"], "WIRECAT_EXP_TRANSLIT": "3"}
ARMS["BC2TL3"] = {**ARMS["RL1"], "WIRECAT_EXP_BIG_CHUNK": "2", "WIRECAT_EXP_TRANSLIT": "3"}
ARMS["IN"] = ARMS["RL1"]
ARMS["SP"] = {**ARMS["RL1"], "WIRECAT_EXP_SECOND_PASS": "3:4"}
# Upper bound for a gap-based share: every big group keeps its 100 places with their lead, no tail.
ARMS["NT"] = {k: v for k, v in ARMS["RL1"].items() if k != "WIRECAT_EXP_BIG_TAIL"}

db = sqlite3.connect(f"file:{a.store}/wirecat.db?mode=ro", uri=True)
tests, pairs = {}, {}


def ext_of(mid):
  return db.execute("select c.external_id, m.external_id from messages m join chats c on c.id = m.chat_id where m.id = ?",
                    (mid,)).fetchone()


for path in a.questions:
  group = os.path.splitext(os.path.basename(path))[0]
  for t in json.load(open(path)):
    tests[t["t"]] = {"group": group, "q": t["q"], "hyde": t["hyde"]}
    pairs[t["t"]] = [ext_of(m) for m in [t["msg"], *t.get("also_ok", [])]]

answers = {}
for tid, ps in pairs.items():
  out = []
  for ch, ext in filter(None, ps):
    r = db.execute("select c.id, m.id, m.sent_at, m.text from messages m join chats c on c.id = m.chat_id "
                   "where c.external_id = ? and m.external_id = ?", (str(ch), str(ext))).fetchone()
    if not r:
      continue
    convs = {x[0] for x in db.execute("select conversation_id from conversation_messages where message_id = ?", (r[1],))}
    text = re.sub(r"\s+", " ", r[3] or "").strip().lower()[:30]
    out.append({"chat_pk": r[0], "chat": str(ch), "ext": str(ext), "key": (r[2], r[1]), "convs": convs,
                "text": text if len(text) >= 8 else None})
  answers[tid] = out


def bound(chat_pk, ext):
  r = db.execute("select sent_at, id from messages where chat_id = ? and external_id = ?", (chat_pk, str(ext))).fetchone()
  return tuple(r) if r else None


def in_chunk(item, ans):
  if str(item["summary"]["chat_id"]) != ans["chat"] or int(item["summary"]["id"]) not in ans["convs"]:
    return False
  f = bound(ans["chat_pk"], item["chunk"]["first_message_id"])
  last = bound(ans["chat_pk"], item["chunk"]["last_message_id"])
  return bool(f and last and f <= ans["key"] <= last)


def in_range(item, ans):
  return str(item["summary"]["chat_id"]) == ans["chat"] and \
    int(item["chunk"]["first_message_id"]) <= int(ans["ext"]) <= int(item["chunk"]["last_message_id"])


def mem_free_gb():
  for line in open("/proc/meminfo"):
    if line.startswith("MemAvailable"):
      return int(line.split()[1]) / 1048576


def run(tid, arm, mode):
  t, ans = tests[tid], answers[tid]
  args = ["node", a.tg, a.profile, "search", "conversations", t["q"], "--json", "--offline", "--timeout", "180s"]
  if mode == "reply":
    args += [f"--{a.flag}", t["hyde"]]
  if arm == "IN":
    args += ["--chat", ans[0]["chat"], "--limit", "100"]
  base = {k: v for k, v in os.environ.items() if not k.startswith("WIRECAT_EXP_")}
  # The embedding model is pinned: without it tg fell back to a local model that has no vectors for the big groups.
  env = {**base, **COMMON, **ARMS[arm], "WIRECAT_STATE_DIR": a.store, "TG_CONFIG_DIR": a.config,
         "TG_OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", ""), "TG_EMBEDDING_PROVIDER": "openai",
         "TG_EMBEDDING_MODEL": "text-embedding-3-small", "TG_EMBEDDING_DIMS": "768",
         "DBUS_SESSION_BUS_ADDRESS": "disabled:"}
  with open(LOCK, "w") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    started = time.monotonic()
    r = subprocess.run(args, capture_output=True, text=True, env=env, cwd="/var/tmp")
    seconds = round(time.monotonic() - started, 1)
  with open(ERRS, "a") as e:
    e.write(f"== {tid} {arm} {mode}\n" + "\n".join(x for x in r.stderr.splitlines() if x.startswith(STDERR_TAGS)) + "\n")
  try:
    d = json.loads(r.stdout[r.stdout.find("{"):].split("\n")[0])
  except ValueError:
    return {"error": f"exit {r.returncode}, stdout {len(r.stdout)} bytes", "seconds": seconds}
  items = d.get("items", [])
  main = [i for i in items if not i.get("from_owner")]
  own = [i for i in items if i.get("from_owner")]

  def rank(xs, f):
    return next((k for k, i in enumerate(xs, 1) if f(i)), None)

  def shown(i):
    return any(str(i["summary"]["chat_id"]) == x["chat"] and x["ext"] in {str(v) for v in i.get("line_ids", [])}
               for x in ans)

  keys = [x["text"] for x in ans if x["text"]]

  def shown_text(i):
    return any(s in re.sub(r"\s+", " ", line).lower() for line in i.get("lines", []) for s in keys)

  tagged = lambda tag: [x[len(tag) + 1:] for x in r.stderr.splitlines() if x.startswith(tag + " ")]
  return {"shown_id": rank(items, shown), "shown_main": rank(main, shown), "shown_own": rank(own, shown),
          "shown_text": rank(items, shown_text),
          "hit1_answer": bool(items) and shown_text(items[0]),
          "main": rank(main, lambda i: any(in_chunk(i, x) for x in ans)),
          "own": rank(own, lambda i: any(in_chunk(i, x) for x in ans)),
          "main_range": rank(main, lambda i: any(in_range(i, x) for x in ans)),
          "own_range": rank(own, lambda i: any(in_range(i, x) for x in ans)),
          "owner_first": bool(items and items[0].get("from_owner")), "n_main": len(main), "n_own": len(own),
          "chats20": [str(i["summary"]["chat_id"]) for i in main],
          "convs": [int(i["summary"]["id"]) for i in main], "own_convs": [int(i["summary"]["id"]) for i in own],
          "wordrank": tagged("wordrank"), "bigchunk": tagged("bigchunk"), "translit": tagged("translit"),
          "share": tagged("share"),
          "extra": [int(x.split("n=")[1]) for x in r.stderr.splitlines() if x.startswith("replylines ")],
          "n_lines": sum(len(i.get("lines", [])) for i in items),
          "named": "is a name in chat" in r.stderr + r.stdout, "bytes": len(r.stdout), "seconds": seconds}


os.makedirs(a.out, exist_ok=True)
new = not os.path.exists(STATUS)
status = open(STATUS, "a", newline="")
w = csv.writer(status)
if new:
  w.writerow(["id", "status", "detail", "time"])
  status.flush()
done = {row["id"] for row in csv.DictReader(open(STATUS)) if row["status"] == "done"}
rows = open(ROWS, "a")
print(f"status: {STATUS}", flush=True)
print("answers per test:", {k: len(v) for k, v in answers.items()}, flush=True)
specs = a.specs or [f"{tid}:{arm}:{mode}" for tid in tests for mode in ("asked", "reply") for arm in ("NEW", "OLD")]
todo = [s for s in specs if f"{a.rep}/{s}" not in done]
for n, spec in enumerate(todo, 1):
  while mem_free_gb() < 8:
    w.writerow([f"{a.rep}/{spec}", "paused", f"MemAvailable {mem_free_gb():.1f} GB", time.strftime("%H:%M:%S")])
    status.flush()
    print(f"paused: memory {mem_free_gb():.1f} GB", flush=True)
    time.sleep(30)
  tid, arm, mode = spec.split(":")
  row = {"id": f"{a.rep}/{spec}", "rep": a.rep, "t": tid, "group": tests[tid]["group"], "arm": arm, "mode": mode,
         **run(tid, arm, mode)}
  rows.write(json.dumps(row) + "\n")
  rows.flush()
  brief = {k: row.get(k) for k in ("shown_id", "shown_own", "main", "own", "main_range", "bytes", "seconds")}
  w.writerow([row["id"], "error" if "error" in row else "done", json.dumps(brief), time.strftime("%H:%M:%S")])
  status.flush()
  print(f"{n}/{len(todo)} {row['id']} {brief}", flush=True)
