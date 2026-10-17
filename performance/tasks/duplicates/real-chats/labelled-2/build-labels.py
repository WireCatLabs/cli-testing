# python3 build-labels.py — one blind file per sampled pair: both tasks and the messages around each, no score.
import datetime, json, os, sqlite3, zoneinfo
from ctx import context

tz = zoneinfo.ZoneInfo("Europe/Madrid")
cfg = json.load(open("chats.json"))
db = sqlite3.connect("file:store.db?mode=ro", uri=True)
drafts = {d["n"]: d for d in map(json.loads, open("drafts.jsonl"))}
tasks = {t["id"]: t for t in json.load(open("new-in.json"))["tasks"]}
os.makedirs("lab", mode=0o700, exist_ok=True)
for item in json.load(open("sample.json")):
    a, b = sorted(map(int, item["k"].split("-")), key=lambda n: tasks[n]["sentMs"])
    parts = []
    for i, n in ((1, a), (2, b)):
        d, t = drafts[n], tasks[n]
        msg = d["source"].split("/")[-1]
        when = datetime.datetime.fromtimestamp(t["sentMs"] / 1000, tz).strftime("%Y-%m-%d %H:%M")
        parts.append(
            f"TASK {i} (type {d['type']}, from message {msg} sent {when})\nTitle: {t['title']}\n"
            f"Description: {t['description']}\n\nConversation around message {msg} (>>> marks it):\n"
            f"{context(db, cfg['new'][d['chat']]['id'], msg)}\n"
        )
    with open(f"lab/{item['k']}.txt", "w") as f:
        f.write("\n".join(parts))
