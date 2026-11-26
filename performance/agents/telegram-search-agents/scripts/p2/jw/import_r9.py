"""Fill jackwener/tg-cli's own SQLite (its MessageDB class, so its schema) from the r9 copy. No Telegram login, no sync.
Mapping as its sync does: chat_id = Telethon entity id (-100 prefix stripped), chat_name = chat title, msg_id = Telegram
message id, sender_name, content = text, timestamp = UTC ISO. Deleted messages skipped."""
import sqlite3, sys, time
import os
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
from datetime import datetime, timezone
sys.path.insert(0, f"{EXP}/p2/jw/venv/lib/python3.13/site-packages")
from tg_cli.db import MessageDB, _canonical_chat_id
SRC = f"file:{EXP}/r9/state/wirecat.db?mode=ro"
DST = f"{EXP}/p2/jw/data/messages.db"
src = sqlite3.connect(SRC, uri=True)
started, n = time.time(), 0
with MessageDB(DST) as db:
  q = ("select c.external_id, c.title, m.external_id, m.sender_name, m.text, m.sent_at from messages m "
       "join chats c on c.id = m.chat_id where m.deleted_at is null order by m.id")
  cur = src.execute(q)
  while rows := cur.fetchmany(20000):
    n += db.insert_batch([{"chat_id": _canonical_chat_id(int(chat)), "chat_name": title, "msg_id": int(mid),
                           "sender_id": None, "sender_name": name, "content": text,
                           "timestamp": datetime.fromtimestamp(sent / 1000, timezone.utc)}
                          for chat, title, mid, name, text, sent in rows])
    print(f"{n} rows, {time.time() - started:.0f} s", flush=True)
print("done", n)
