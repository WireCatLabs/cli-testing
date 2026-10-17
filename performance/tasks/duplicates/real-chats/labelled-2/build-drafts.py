# python3 build-drafts.py — out/<chat>_<day>.jsonl from draft-one.sh → drafts.jsonl with msg: locators and send times.
import collections, datetime, glob, json, os, sqlite3

cfg = json.load(open("chats.json"))
db = sqlite3.connect("file:store.db?mode=ro", uri=True)
categories = {item.split(":")[0].strip() for item in open("categories.txt").read().split(", ")}
types = {"question", "request", "mention", "promise"}
drafts = []
for path in sorted(glob.glob("out/*.jsonl")):
    code = os.path.basename(path).split("_")[0]
    chat = cfg["new"][code]
    for line in open(path):
        if not line.strip().startswith("{"):
            continue
        draft = json.loads(line)
        row = db.execute(
            "select sent_at from messages where chat_id = ? and external_id = ?", (chat["id"], str(draft["id"]))
        ).fetchone()
        if not row:
            continue
        drafts.append({
            "n": len(drafts) + 1,
            "chat": code,
            "source": f"msg:telegram/{cfg['account']}/{chat['external']}/{draft['id']}",
            "sent": datetime.datetime.fromtimestamp(row[0] / 1000, datetime.timezone.utc).isoformat(),
            "type": draft["type"] if draft["type"] in types else "promise",
            "title": draft["title"],
            "description": draft.get("description", ""),
            "category": draft.get("category") if draft.get("category") in categories else "other",
        })
with open("drafts.jsonl", "w") as f:
    f.write("".join(json.dumps(d, ensure_ascii=False) + "\n" for d in drafts))
os.chmod("drafts.jsonl", 0o600)
print(len(drafts), collections.Counter(d["type"] for d in drafts))
