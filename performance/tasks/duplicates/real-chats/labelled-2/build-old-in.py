# python3 build-old-in.py — the old tasks rebuilt from title and found source message → old-in.json.
import glob, json, os, sqlite3
from prep import message

cfg = json.load(open("chats.json"))
db = sqlite3.connect("file:store.db?mode=ro", uri=True)
found = {}
for path in glob.glob("oldout/*.jsonl"):
    chat, date = os.path.basename(path)[:-6].split("_")
    for line in open(path):
        if line.strip().startswith("{"):
            x = json.loads(line)
            found[(chat, date, x["title"])] = x
tasks, index = [], {}
for i, t in enumerate(json.load(open("old-tasks.json"))):
    key = (t["chat"], t["date"], t["title"])
    m = message(db, cfg["old"][t["chat"]], found[key]["id"])
    tasks.append({"id": i, "title": t["title"], "sourceSure": found[key]["sure"], "chat": t["chat"],
                  "dialog": t["chat"] not in cfg["old_groups"], **m})
    index[key] = i
pairs = []
for p in json.load(open("old-pairs.json")):
    a = index[(p["a"]["chat"], p["a"]["date"], p["a"]["title"])]
    b = index[(p["b"]["chat"], p["b"]["date"], p["b"]["title"])]
    pairs.append({"a": b, "b": a, "n": p["n"], "label": p["label"], "v0": p["v0"], "v1": p["v1"]})
json.dump({"tasks": tasks, "pairs": pairs}, open("old-in.json", "w"), ensure_ascii=False)
print(len(tasks), "tasks,", len(pairs), "pairs")
