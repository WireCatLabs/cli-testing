"""Collects memo's and drive's top 40 per query, read-only, for rerank.mjs. Env: NOTES_ROOT, NOTES_FOLDER, DRIVE_PROFILE.

  python3 -I collect.py <BENCH_DIR> <RERANK_DIR>   # RERANK_DIR holds notes-allowed.json, the notes in the corpus
"""
import json, os, subprocess, sys, time
B, R = sys.argv[1], sys.argv[2]
NOTES_ROOT, FOLDER, PROFILE = os.environ["NOTES_ROOT"], os.environ["NOTES_FOLDER"], os.environ["DRIVE_PROFILE"]
Q = json.load(open(f"{B}/queries.json"))
docs = json.load(open(f"{B}/drive-docs.json"))
drive_refs = {d["ref"] for d in docs}
allowed = set(json.load(open(f"{R}/notes-allowed.json")))

def run(argv):
    t = time.perf_counter()
    out = subprocess.run(argv, capture_output=True, text=True, timeout=300)
    return json.loads(out.stdout), (time.perf_counter() - t) * 1000

rows = []
for q in Q["notes"]:
    data, ms = run(["memo", "search", "notes", q["q"], "--folder", FOLDER, "--json", "--limit", "60"])
    ids = [h["path"].removeprefix(NOTES_ROOT + "/") for h in data.get("hits", [])]
    ids = [i for i in ids if i in allowed][:40]
    rows.append({"corpus": "notes", "engine": "memo", **q, "ranked": ids, "ms": ms, "by": data.get("by")})
for q in Q["drive"]:
    data, ms = run(["drive", PROFILE, "search", q["q"], "--json", "--limit", "60"])
    ids = [h["ref"] for h in data.get("hits", []) if h.get("ref") in drive_refs][:40]
    rows.append({"corpus": "drive", "engine": "drive", **q, "ranked": ids, "ms": ms, "by": data.get("by")})
json.dump(rows, open(f"{R}/candidates.json", "w"), ensure_ascii=False)
print(len(rows), "queries;", sum(len(r["ranked"]) for r in rows) / len(rows), "candidates on average")
