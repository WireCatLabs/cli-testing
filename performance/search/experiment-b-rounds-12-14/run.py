"""Agent round: one question per agent session, tg against grep over a Telegram Desktop export.

Usage: python3 -I run.py --harness DIR --skill DIR --wrapper-dir DIR --store DIR --export DIR --questions FILE
                         --out DIR ID [ID ...]
--harness is performance/agents/source-coverage from cli-testing PR #378 (ask.sh and budget.py are not on main yet).
--wrapper-dir holds an executable `tg` (tg-wrapper.py) that pins the store, the embedding model and --offline.
For each id, tg runs first, then grep. A tg session holds the lock from its start to its end, so another batch on the
same machine never shares its seconds. Rows go to OUT/rows.jsonl, one status row per session to OUT/status.csv; a rerun
skips sessions the status file marks done.
"""
import argparse, csv, fcntl, json, os, subprocess, time

p = argparse.ArgumentParser()
p.add_argument("--harness", required=True)
p.add_argument("--skill", required=True, help="the released tg-cli's skills/tg-cli folder")
p.add_argument("--wrapper-dir", required=True)
p.add_argument("--store", required=True)
p.add_argument("--export", required=True)
p.add_argument("--questions", required=True)
p.add_argument("--out", required=True)
p.add_argument("--lock", help="file lock shared with other tg runs on the same machine")
p.add_argument("ids", nargs="+")
a = p.parse_args()

RUN = f"{a.out}/run"
ASK, BUDGET = f"{a.harness}/ask.sh", f"{a.harness}/budget.py"
LOCK = a.lock or f"{a.out}/tg.lock"
STATUS, ROWS = f"{a.out}/status.csv", f"{a.out}/rows.jsonl"
ZDOTDIR = f"{a.out}/zdotdir"
WHO = {"tg": "wf2", "eg": "eg"}


def mem_free_gb():
  for line in open("/proc/meminfo"):
    if line.startswith("MemAvailable"):
      return int(line.split()[1]) / 1048576


def summarize(transcript):
  events = []
  for line in open(transcript):
    try:
      events.append(json.loads(line))
    except ValueError:
      pass
  results = [e for e in events if e.get("type") == "result"]
  last = results[-1] if results else {}
  uses = [c for e in events if e.get("type") == "assistant" for c in e["message"].get("content", [])
          if c.get("type") == "tool_use"]
  fields = {"input": "input_tokens", "cache_write": "cache_creation_input_tokens",
            "cache_read": "cache_read_input_tokens", "output": "output_tokens"}
  per_message = {}
  for e in events:
    if e.get("type") == "assistant":
      u, best = e["message"].get("usage", {}), per_message.setdefault(e["message"].get("id"), dict.fromkeys(fields, 0))
      for k, f in fields.items():
        best[k] = max(best[k], u.get(f, 0))
  usage = {k: sum(m[k] for m in per_message.values()) for k in fields}
  commands = [c["input"].get("command", "") for c in uses if c.get("name") == "Bash"]
  return {"seconds": round(last.get("duration_ms", 0) / 1000, 1), "calls": len(uses),
          "budget": "out" if last.get("subtype") == "budget" else "in", "cost": last.get("total_cost_usd"),
          "usage": usage, "skill": any(c.get("name") == "Skill" for c in uses),
          "like": any("--like" in c for c in commands), "searches": sum("search" in c for c in commands),
          "denied": len(last.get("permission_denials", []) or [])}


def ask(contestant, tid, line):
  qdir = f"{RUN}/q{tid}"
  os.makedirs(qdir, exist_ok=True)
  qfile = f"{qdir}/{contestant}-question.txt"
  open(qfile, "w").write(line + "\n")
  # An empty ZDOTDIR keeps the user's zshrc from putting a global tg ahead of the wrapper in the agent's shell.
  env = {**os.environ, "ZDOTDIR": ZDOTDIR, "ASK_RUNNER": f"python3 -I {BUDGET}",
         "ASK_RULES": "Answer within 60 seconds and 10 tool calls; one command per call, no scripts."}
  args = ["bash", ASK, WHO[contestant], qfile, qdir]
  waited = 0.0
  if contestant == "tg":
    env.update({"PATH": f"{a.wrapper_dir}:{env['PATH']}", "ASK_SKILL": a.skill, "WF_STATE": a.store,
                "ROUND_LOCK_HELD": "1", "ROUND_TG_LOG": f"{qdir}/tgcalls.log", "DBUS_SESSION_BUS_ADDRESS": "disabled:"})
    lock = open(LOCK, "w")
    t0 = time.monotonic()
    fcntl.flock(lock, fcntl.LOCK_EX)
    waited = round(time.monotonic() - t0, 1)
    try:
      subprocess.run(args, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, cwd="/var/tmp")
    finally:
      fcntl.flock(lock, fcntl.LOCK_UN)
      lock.close()
  else:
    env.pop("OPENAI_API_KEY", None)
    subprocess.run([*args, a.export], env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, cwd="/var/tmp")
  return {**summarize(f"{qdir}/{WHO[contestant]}/transcript.jsonl"), "lock_wait": waited}


os.makedirs(ZDOTDIR, exist_ok=True)
questions = {t["t"]: t for t in json.load(open(a.questions))}
new = not os.path.exists(STATUS)
status = open(STATUS, "a", newline="")
w = csv.writer(status)
if new:
  w.writerow(["id", "status", "detail", "time"])
  status.flush()
done = {row["id"] for row in csv.DictReader(open(STATUS)) if row["status"] == "done"}
rows = open(ROWS, "a")
print(f"status: {STATUS}", flush=True)
todo = [(tid, c) for tid in a.ids for c in ("tg", "eg") if f"{c}:{tid}" not in done]
for n, (tid, contestant) in enumerate(todo, 1):
  while mem_free_gb() < 8:
    print(f"paused: memory {mem_free_gb():.1f} GB", flush=True)
    time.sleep(30)
  line = f"{int(tid[1:])}. {questions[tid]['q']}"
  row = {"id": f"{contestant}:{tid}", "t": tid, "who": contestant, **ask(contestant, tid, line)}
  rows.write(json.dumps(row) + "\n")
  rows.flush()
  brief = {k: row[k] for k in ("seconds", "calls", "budget", "cost", "like", "lock_wait")}
  w.writerow([row["id"], "done", json.dumps(brief), time.strftime("%H:%M:%S")])
  status.flush()
  print(f"{n}/{len(todo)} {row['id']} {brief}", flush=True)
