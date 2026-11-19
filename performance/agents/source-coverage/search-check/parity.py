"""Grep parity, free: for each pattern the export agent gave grep, which messages grep finds in the export and which
`tg search messages` finds in the store, and how long each takes. Rows stay in this private folder."""
import glob, json, os, re, subprocess, sys, time

CACHE = "/home/leemour/.cache/wirecat-experiment-b"
EXPORT = f"{CACHE}/e/export"
TG = os.environ.get("TG", f"{CACHE}/r4b/tg-0.133.0/bin/tg")
STATE = os.environ.get("STATE", f"{CACHE}/wf/state")
OUT = f"{CACHE}/r6/parity-{os.environ.get('RUN', 'base')}.jsonl"
PATTERNS = [tuple(p) for p in json.load(open("/home/leemour/.cache/wirecat-experiment-b/private.json"))["parity_patterns"]]  # the export agent's own greps, kept private


def text(m):
  t = m.get("text", "")
  return "".join(p if isinstance(p, str) else p.get("text", "") for p in t) if isinstance(t, list) else t


messages = []
for f in glob.glob(f"{EXPORT}/ChatExport_*/result.json"):
  chat = f.split("ChatExport_")[1].split("/")[0]
  messages += [(chat, str(m["id"]), text(m)) for m in json.load(open(f))["messages"] if text(m)]


def tg(query):
  found, page, started = set(), 1, time.monotonic()
  while page <= 20:
    run = subprocess.run([TG, "personal", "search", "messages", query, "--backend", "archive", "--json", "--limit", "500",
                          "--page", str(page)], capture_output=True, text=True, cwd="/var/tmp",
                         env={**os.environ, "WIRECAT_STATE_DIR": STATE})
    out = run.stdout[run.stdout.find("{"):]
    data = json.loads(out.split("\n")[0]) if out else {}
    for item in data.get("items", []):
      ref = item["ref"].split("/")
      found.add((ref[-2], ref[-1]))
    if not data.get("page", {}).get("has_more"):
      break
    page += 1
  return found, time.monotonic() - started


rows = []
for pattern, nocase in PATTERNS:
  flags = re.I if nocase else 0
  started = time.monotonic()
  grep = {(c, i) for c, i, t in messages if re.search(pattern, t, flags)}
  grep_s = time.monotonic() - started
  words = {(c, i) for c, i, t in messages if re.search(rf"(?<!\w)(?:{pattern})", t, flags)}
  found, tg_s = tg(" OR ".join(f'"{p}"' if " " in p else p for p in pattern.split("|")))
  rows.append({"pattern": pattern, "grep": len(grep), "grep_word_start": len(words), "tg": len(found),
               "tg_has_grep": len(grep & found), "tg_has_word_start": len(words & found), "tg_only": len(found - grep),
               "grep_s": round(grep_s, 2), "tg_s": round(tg_s, 1)})
  print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
open(OUT, "w").writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
