# python3 export-days.py — one file per chat and day of the messages the first run did not read (chats.json "new").
import collections, datetime, json, sqlite3, zoneinfo

tz = zoneinfo.ZoneInfo("Europe/Madrid")
cfg = json.load(open("chats.json"))
db = sqlite3.connect("file:store.db?mode=ro", uri=True)
for code, chat in cfg["new"].items():
    cut = datetime.datetime.fromisoformat(chat["before"]).replace(tzinfo=datetime.timezone.utc)
    rows = db.execute(
        "select external_id, sent_at, outgoing, reply_to_external_id, coalesce(text, '') from messages "
        "where chat_id = ? and sent_at < ? order by sent_at, id",
        (chat["id"], int(cut.timestamp() * 1000)),
    ).fetchall()
    days = collections.defaultdict(list)
    for ext, sent, out, reply, text in rows:
        at = datetime.datetime.fromtimestamp(sent / 1000, tz)
        who = "OWNER" if out else "OTHER"
        days[at.date().isoformat()].append(
            f"[{ext}] {at:%H:%M} {who}{' ↩' + reply if reply else ''}: {text.strip() or '[media]'}"
        )
    for day, lines in days.items():
        with open(f"days/{code}_{day}.txt", "w") as f:
            f.write(f"# chat {code}, day {day} (Europe/Madrid)\n" + "\n".join(lines) + "\n")
    print(code, len(rows), "messages,", len(days), "days")
