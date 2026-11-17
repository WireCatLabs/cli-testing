"""search messages: rank of the true answer for Q3/Q5 texts and the single words agents used. Private; stays here."""
import json, os, re, subprocess, sys, time
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "retrieval.py")).read().split("def search")[0])
CACHE = "/home/leemour/.cache/wirecat-experiment-b"
TG = f"{CACHE}/r5/tg.sh"
STATE = f"{CACHE}/r5/state"
QUESTIONS = f"{CACHE}/r4b/all-w.txt"
OUT = f"{CACHE}/r5/runs/msgs-{sys.argv[1]}.jsonl"
CHAT = json.load(open("/home/leemour/.cache/wirecat-experiment-b/private.json"))["focus"]["chat"]
KEY = {n: key_items()[int(n)][1] for n in json.load(open("/home/leemour/.cache/wirecat-experiment-b/private.json"))["focus"]["questions"]}
text = {n: re.search(rf"^{n}\. (.*)$", open(QUESTIONS).read(), re.M).group(1) for n in KEY}
QUERIES = [(n, text[n]) for n in KEY] + [(n, w) for n, ws in json.load(open("/home/leemour/.cache/wirecat-experiment-b/private.json"))["focus"]["words"].items() for w in ws]
rows = []
for n, q in QUERIES:
  for scope in ("all", "chat"):
    query = q if scope == "all" else f"chat:{CHAT} {q}"
    started = time.monotonic()
    run = subprocess.run([TG, "personal", "search", "messages", query, "--backend", "archive", "--json", "--limit", "100"],
                         capture_output=True, text=True, cwd="/var/tmp", env={**os.environ, "WIRECAT_STATE_DIR": STATE})
    seconds = round(time.monotonic() - started, 1)
    out = run.stdout[run.stdout.find("{"):]
    data = json.loads(out.split("\n")[0]) if out else {}
    rank = next((i for i, it in enumerate(data.get("items", []), 1)
                 if it["ref"].split("/")[-2] == CHAT and int(it["ref"].split("/")[-1]) in KEY[n]), None)
    meta = data.get("meta") or {}
    row = {"q": n, "query": "text" if q == text[n] else f"words{QUERIES.index((n, q))}", "scope": scope, "rank": rank,
           "hits": len(data.get("items", [])), "seconds": seconds, "named": (meta.get("named_chat") or {}).get("chat_id"),
           "respelled": bool(meta.get("respelled")), "error": (data.get("error") or {}).get("reason")}
    rows.append(row)
    print(json.dumps(row), flush=True)
open(OUT, "w").writelines(json.dumps(r) + "\n" for r in rows)
