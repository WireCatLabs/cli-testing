"""Post 2, layer 2: one held-out question per agent session, per arm and model, through claude-clean (copy) and r14's
budget.py. Sessions run one after another. Skips entries STATUS marks done; waits and retries on a rate limit.
Usage: python3 -I run.py <haiku|sonnet> <tg|tg-skill|jw|qmd|qmd-skill|grep> <H-id> ..."""
import csv, json, os, shutil, subprocess, sys, time
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder

C = EXP
L2 = f"{C}/p2/layer2"
CLEAN = f"{L2}/claude-clean"
BUDGET = f"{L2}/budget.py"
QUESTIONS = f"{C}/r13/held/questions.json"
MD = f"{C}/p2/qmd/big/md"
# v1 (status.csv, rows.jsonl, run/) is the failed smoke: bypassPermissions inherited, TG_READ_ONLY set.
STATUS, ROWS, RUN = f"{L2}/status-v2.csv", f"{L2}/rows-v2.jsonl", f"{L2}/run-v2"
# A repeat of the same arms writes its own files, so the first run stays as it was.
REPEAT = os.environ.get("L2_REPEAT", "")
if REPEAT:
  STATUS, ROWS, RUN = f"{L2}/status-{REPEAT}.csv", f"{L2}/rows-{REPEAT}.jsonl", f"{L2}/run-{REPEAT}"
ZDOTDIR = f"{L2}/zdotdir"
QMD_DONE = f"{C}/p2/qmd/QUERY_DONE"
MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5"}
BUDGET_SECONDS, BUDGET_CALLS = 600, 10
RULES = ("Answer the question about the user's own Telegram. Use only the tools you are given. Give the chat and the date "
         "of the message the answer comes from. If you cannot find it, say 'not found'; never guess. Answer within "
         f"{BUDGET_SECONDS // 60} minutes and {BUDGET_CALLS} tool calls; one command per call, no scripts.")
TG_ALLOW = ["Bash(tg --help)", "Bash(tg personal --help)", "Bash(tg skill show:*)", "Bash(tg commands:*)",
            "Bash(tg guide:*)", "Bash(tg help:*)", "Bash(tg personal search conversations:*)",
            "Bash(tg personal search messages:*)", "Bash(tg personal search all:*)", "Bash(tg personal search --help)", "Bash(tg personal messages list:*)",
            "Bash(tg personal messages context:*)", "Bash(tg personal messages show:*)",
            "Bash(tg personal messages link:*)", "Bash(tg personal chats list:*)", "Bash(tg personal chats show:*)"]
QMD_READ = ["search", "get", "multi-get", "ls", "status"]
# The arm's own binary is approved as a whole; its wrapper refuses every subcommand outside the read allowlist with an
# error the agent can read. Narrow patterns (TG_ALLOW) made Claude Code deny `tg personal messages <chat> --help`, and
# the agent then took Bash as forbidden and stopped (stage 2, first rerun).
ARMS = {
  "tg": {"bin": f"{L2}/bin-tg", "allow": ["Bash(tg:*)"], "cwd": None, "key": True,
         "access": "Telegram is available through the tg command line tool, profile 'personal' "
                   "(start with: tg personal --help)."},
  # tg plus the skill tg 0.135.0 ships (skills/tg-cli), installed in the agent's project as round 14's ASK_SKILL did.
  "tg-skill": {"bin": f"{L2}/bin-tg", "allow": ["Bash(tg:*)", "Skill(tg-cli)"], "cwd": None, "key": True,
               "skill": f"{C}/p2/tg/node_modules/@wirecat/tg-cli/skills/tg-cli",
               "access": "Telegram is available through the tg command line tool, profile 'personal' "
                         "(start with: tg personal --help)."},
  "jw": {"bin": f"{L2}/bin-jw", "cwd": None, "key": False,
         "allow": ["Bash(tg:*)"],
         "access": "Telegram is available through the tg command line tool (start with: tg --help)."},
  "qmd": {"bin": f"{L2}/bin-qmd", "cwd": None, "key": False,
          "allow": ["Bash(qmd:*)"],
          "access": "The user's Telegram chats are indexed with the qmd command line tool, one Markdown document per "
                    "chat and day (start with: qmd --help)."},
  # qmd plus the skill qmd 2.9.0 ships (skills/qmd), installed the same way as tg-skill (2026-11-25, owner asked).
  "qmd-skill": {"bin": f"{L2}/bin-qmd", "cwd": None, "key": False, "hook_bin": "qmd", "allow": ["Bash(qmd:*)", "Skill(qmd)"],
                "skill": f"{C}/p2/qmd/pkg/node_modules/@tobilu/qmd/skills/qmd",
                "access": "The user's Telegram chats are indexed with the qmd command line tool, one Markdown document "
                          "per chat and day (start with: qmd --help)."},
  "grep": {"bin": None, "cwd": MD, "key": False,
           "allow": ["Bash(grep:*)", f"Read(/{MD}/**)"],
           "access": f"The user's Telegram chats are saved as Markdown files, one per chat and day, under {MD}; "
                     "search them with grep and read them with Read."},
}


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
  init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
  results = [e for e in events if e.get("type") == "result"]
  last = results[-1] if results else {}
  uses = [p for e in events if e.get("type") == "assistant" for p in e["message"].get("content", [])
          if p.get("type") == "tool_use"]
  fields = {"input": "input_tokens", "cache_write": "cache_creation_input_tokens",
            "cache_read": "cache_read_input_tokens", "output": "output_tokens"}
  per_message = {}
  for e in events:
    if e.get("type") == "assistant":
      u, best = e["message"].get("usage", {}), per_message.setdefault(e["message"].get("id"), dict.fromkeys(fields, 0))
      for k, f in fields.items():
        best[k] = max(best[k], u.get(f, 0) or 0)
  usage = {k: sum(m[k] for m in per_message.values()) for k in fields}
  commands = [p["input"].get("command", p["input"].get("file_path", "")) for p in uses]
  return {"seconds": round(last.get("duration_ms", 0) / 1000, 1), "calls": len(uses),
          "budget": "out" if last.get("subtype") == "budget" else "in", "cost": last.get("total_cost_usd"),
          "is_error": bool(last.get("is_error")), "result": (last.get("result") or "")[:4000],
          "usage": usage, "tokens": sum(usage.values()), "commands": commands,
          "denied": len(last.get("permission_denials", []) or []),
          "init": {"tools": init.get("tools"), "mcp_servers": init.get("mcp_servers"), "skills": init.get("skills"),
                   "slash_commands": init.get("slash_commands"), "plugins": init.get("plugins"),
                   "model": init.get("model"), "permissionMode": init.get("permissionMode")}}


def ask(model, arm, tid, q):
  a = ARMS[arm]
  qdir = f"{RUN}/{model}/{arm}/{tid}"
  work = a["cwd"] or f"{qdir}/work"
  if os.path.exists(f"{qdir}/transcript.jsonl"):
    n = 1
    while os.path.exists(f"{qdir}.old{n}"):
      n += 1
    os.rename(qdir, f"{qdir}.old{n}")
  os.makedirs(f"{qdir}/work", exist_ok=True)
  if a.get("skill"):
    shutil.copytree(a["skill"], f"{qdir}/work/.claude/skills/{os.path.basename(a['skill'])}")
  if a.get("hook_bin"):
    # qmd's skill teaches `qmd query $'intent: ...\nlex: ...'`; dontAsk denies that form even under Bash(qmd:*).
    hook = {"matcher": "Bash", "hooks": [{"type": "command", "command": f"python3 -I {L2}/hooks/allow_one_command.py"}]}
    os.makedirs(f"{qdir}/work/.claude", exist_ok=True)
    json.dump({"hooks": {"PreToolUse": [hook]}}, open(f"{qdir}/work/.claude/settings.json", "w"))
  prompt = f"{a['access']}\n\n{RULES}\n\n{int(tid[1:])}. {q}"
  open(f"{qdir}/prompt.txt", "w").write(prompt + "\n")
  # No TG_READ_ONLY: tg 0.135.0 reads it from every ancestor process too, and under it refuses the OpenAI question
  # embedding, so tg would lose its meaning search. --offline, the wrapper allowlist and the store copy guard the account.
  env = {k: v for k, v in os.environ.items() if not k.startswith(("WIRECAT_EXP_", "L2_", "TG_READ_ONLY"))}
  if not a["key"]:
    env.pop("OPENAI_API_KEY", None)
  env.update({"ZDOTDIR": ZDOTDIR, "CLAUDE_RUNNER": f"python3 -I {BUDGET}", "BUDGET_SECONDS": str(BUDGET_SECONDS),
              "BUDGET_CALLS": str(BUDGET_CALLS), "L2_CALL_LOG": f"{qdir}/calls.log"})
  if a["bin"]:
    env["PATH"] = f"{a['bin']}:{env['PATH']}"
  if a.get("hook_bin"):
    env["L2_HOOK_BIN"] = a["hook_bin"]
  if arm.startswith("qmd") and os.path.exists(QMD_DONE):
    env["L2_QMD_QUERY"] = "1"
  args = ["bash", CLEAN, "--tools", "Bash,Read,Skill" if a.get("skill") else "Bash,Read", "--model", MODELS[model],
          "--out", f"{qdir}/transcript.jsonl"] + (["--project-skills"] if a.get("skill") else [])
  for p in a["allow"]:
    args += ["--allow", p]
  args += ["--", prompt]
  started = time.monotonic()
  r = subprocess.run(args, env=env, stdin=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, cwd=work)
  wall = round(time.monotonic() - started, 1)
  open(f"{qdir}/stderr.txt", "w").write(r.stderr[-5000:])
  return {**summarize(f"{qdir}/transcript.jsonl"), "wall": wall, "exit": r.returncode,
          "qmd_query": env.get("L2_QMD_QUERY") == "1"}


def disk_free_gb():
  st = os.statvfs("/home")
  return st.f_bavail * st.f_frsize / 1e9


def disk_error(qdir):
  text = open(f"{qdir}/transcript.jsonl", errors="replace").read()
  return any(m in text for m in ("disk I/O error", "SQLITE_IOERR", "SQLITE_FULL", "database or disk is full", "ENOSPC"))


def rate_limited(row):
  text = (row.get("result") or "").lower()
  return row["calls"] == 0 and (row["is_error"] or not row["result"]) and any(
    w in text for w in ("limit", "overloaded", "429", "529", "usage"))


questions = {t["t"]: t for t in json.load(open(QUESTIONS))}
model, arm, tids = sys.argv[1], sys.argv[2], sys.argv[3:]
assert model in MODELS and arm in ARMS and all(t in questions for t in tids)
if arm == "qmd" and not os.path.exists(QMD_DONE):
  raise SystemExit("qmd arm waits for QUERY_DONE")
new = not os.path.exists(STATUS)
status = open(STATUS, "a", newline="")
w = csv.writer(status)
if new:
  w.writerow(["id", "status", "detail", "time"])
  status.flush()
# INVALID lists ids whose run failed on the harness; they run again, and the later row wins in scoring.
INVALID = f"{L2}/invalid.txt"
invalid = set(open(INVALID).read().split()) if os.path.exists(INVALID) and not REPEAT else set()
done = {row["id"] for row in csv.DictReader(open(STATUS)) if row["status"] == "done"} - invalid
rows = open(ROWS, "a")
print(f"status: {STATUS}", flush=True)
todo = [t for t in tids if f"{model}:{arm}:{t}" not in done]
for n, tid in enumerate(todo, 1):
  for attempt in range(1, 25):
    while mem_free_gb() < 8:
      print(f"paused: memory {mem_free_gb():.1f} GB", flush=True)
      time.sleep(30)
    while disk_free_gb() < 3:
      print(f"paused: disk {disk_free_gb():.1f} GB free on /home", flush=True)
      time.sleep(300)
    row = {"id": f"{model}:{arm}:{tid}", "model": model, "arm": arm, "t": tid, "attempt": attempt,
           "load": os.getloadavg()[0], **ask(model, arm, tid, questions[tid]["q"])}
    if disk_error(f"{RUN}/{model}/{arm}/{tid}"):
      os.rename(f"{RUN}/{model}/{arm}/{tid}", f"{RUN}/{model}/{arm}/{tid}.ioerr{attempt}")
      w.writerow([row["id"], "ioerror", "disk error in transcript; rerun, not scored", time.strftime("%H:%M:%S")])
      status.flush()
      print(f"disk error on {row['id']} (attempt {attempt}): rerun", flush=True)
      time.sleep(60)
      continue
    if not rate_limited(row):
      break
    w.writerow([row["id"], "ratelimit", row["result"][:200], time.strftime("%H:%M:%S")])
    status.flush()
    print(f"rate limit on {row['id']} (attempt {attempt}): waiting 10 min", flush=True)
    time.sleep(600)
  rows.write(json.dumps(row, ensure_ascii=False) + "\n")
  rows.flush()
  brief = {k: row[k] for k in ("seconds", "wall", "calls", "budget", "denied", "tokens", "exit")}
  w.writerow([row["id"], "done" if row["exit"] == 0 or row["budget"] == "out" else "error", json.dumps(brief),
              time.strftime("%H:%M:%S")])
  status.flush()
  print(f"{n}/{len(todo)} {row['id']} {brief}", flush=True)
