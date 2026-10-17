# python3 parse-old.py — the first run's private rows → old-pairs.json and old-tasks.json.
import json, re

cfg = json.load(open("chats.json"))
pairs = []
for line in open(cfg["old_report"]):
    if not re.match(r"\| \d+ \|", line):
        continue
    n, chats, a, b, v0, v1, label, conf, reason = [c.strip() for c in line.strip().strip("|").split("|")][:9]
    sides = []
    for chat, cell in zip(chats.split("/"), (a, b)):
        date, title = cell.split(" · ", 1)
        sides.append({"chat": chat, "date": date, "title": title})
    pairs.append({"n": int(n), "a": sides[0], "b": sides[1], "v0": v0, "v1": v1, "label": label.split()[0]})
tasks = list({(s["chat"], s["date"], s["title"]): s for p in pairs for s in (p["a"], p["b"])}.values())
json.dump(pairs, open("old-pairs.json", "w"), ensure_ascii=False)
json.dump(tasks, open("old-tasks.json", "w"), ensure_ascii=False)
print(len(pairs), "pairs,", len(tasks), "tasks")
