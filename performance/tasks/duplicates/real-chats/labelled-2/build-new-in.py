# python3 build-new-in.py — the stored tasks with their source message, sender and reply chain → new-in.json.
import json, sqlite3
from prep import message

cfg = json.load(open("chats.json"))
db = sqlite3.connect("file:store.db?mode=ro", uri=True)
drafts = {d["n"]: d for d in map(json.loads, open("drafts.jsonl"))}
tasks = []
for r in json.load(open("related.json")):
    if not r.get("key"):
        continue
    d = drafts[r["n"]]
    title, description, category = db.execute(
        "select title, description, category from tasks where key = ?", (r["key"],)
    ).fetchone()
    tasks.append({
        "id": r["n"], "key": r["key"], "title": title, "description": description or "", "category": category,
        "chat": d["chat"], "dialog": True, **message(db, cfg["new"][d["chat"]]["id"], d["source"].split("/")[-1]),
    })
pool = json.load(open("pool.json"))
flagged = [f"{a}-{b}" for a, b in json.load(open("flag.json"))]
pairs = [{"a": int(k.split("-")[1]), "b": int(k.split("-")[0]), "k": k} for k in sorted(set(pool) | set(flagged))]
json.dump({"tasks": tasks, "pairs": pairs}, open("new-in.json", "w"), ensure_ascii=False)
print(len(tasks), "tasks,", len(pairs), "pairs")
