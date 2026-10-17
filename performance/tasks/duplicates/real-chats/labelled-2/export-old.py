# python3 export-old.py — per chat and date: the old titles and the messages of that day ± 1, for locate-one.sh.
import collections, datetime, json, os, sqlite3, zoneinfo

tz = zoneinfo.ZoneInfo("Europe/Madrid")
cfg = json.load(open("chats.json"))
db = sqlite3.connect("file:store.db?mode=ro", uri=True)
os.makedirs("oldsrc", mode=0o700, exist_ok=True)
groups = collections.defaultdict(list)
for t in json.load(open("old-tasks.json")):
    groups[(t["chat"], t["date"])].append(t["title"])
for (chat, date), titles in groups.items():
    day = datetime.date.fromisoformat(date)
    lo = datetime.datetime.combine(day - datetime.timedelta(days=1), datetime.time(), tz)
    hi = datetime.datetime.combine(day + datetime.timedelta(days=2), datetime.time(), tz)
    rows = db.execute(
        "select external_id, sent_at, outgoing, reply_to_external_id, coalesce(text, '') from messages "
        "where chat_id = ? and sent_at >= ? and sent_at < ? order by sent_at, id",
        (cfg["old"][chat], int(lo.timestamp() * 1000), int(hi.timestamp() * 1000)),
    ).fetchall()
    lines = [
        f"[{e}] {datetime.datetime.fromtimestamp(s / 1000, tz):%Y-%m-%d %H:%M} {'OWNER' if o else 'OTHER'}"
        f"{' ↩' + r if r else ''}: {t.strip() or '[media]'}"
        for e, s, o, r, t in rows
    ]
    with open(f"oldsrc/{chat}_{date}.txt", "w") as f:
        f.write(
            f"TITLES (drafted from a message sent on {date}, most likely; the message may also be on the day before "
            "or after):\n" + "\n".join(f"- {x}" for x in titles) + "\n\nMESSAGES:\n" + "\n".join(lines) + "\n"
        )
print(len(groups), "chat-days")
