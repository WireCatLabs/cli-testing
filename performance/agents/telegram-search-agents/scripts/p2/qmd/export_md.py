"""Markdown for qmd from the r9 copy: one file per chat per UTC day, `# <chat> — <date>` header,
lines `HH:MM Author: text`, a reply marked `↪ <replied author>`. Empty-text messages (media without caption) skipped."""
import os, re, sqlite3, time
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
from collections import defaultdict
DB = f"file:{EXP}/r9/state/wirecat.db?mode=ro"
OUT = f"{EXP}/p2/qmd/big/md"
db = sqlite3.connect(DB, uri=True)
titles = dict(db.execute("select id, title from chats"))
authors = defaultdict(dict)
for chat, ext, name in db.execute("select chat_id, external_id, sender_name from messages where deleted_at is null"):
  authors[chat][ext] = name
files, cur, buf, n = 0, None, [], 0
def flush():
  global files
  if not cur or not buf: return
  chat, day = cur
  d = f"{OUT}/chat-{chat}"
  os.makedirs(d, exist_ok=True)
  with open(f"{d}/{day}.md", "w") as f:
    f.write(f"# {titles.get(chat) or chat} — {day}\n\n" + "\n".join(buf) + "\n")
  files += 1
started = time.time()
q = ("select chat_id, sent_at, sender_name, text, reply_to_external_id from messages "
     "where deleted_at is null and text != '' order by chat_id, sent_at, id")
for chat, sent, name, text, reply in db.execute(q):
  day, hm = time.strftime("%Y-%m-%d", time.gmtime(sent / 1000)), time.strftime("%H:%M", time.gmtime(sent / 1000))
  if (chat, day) != cur:
    flush(); cur, buf = (chat, day), []
  to = authors[chat].get(reply) if reply else None
  mark = f" ↪ {to}" if to else (" ↪" if reply else "")
  buf.append(f"{hm} {name}{mark}: {re.sub(r'\s+', ' ', text).strip()}")
  n += 1
flush()
print(f"{n} messages, {files} files, {time.time() - started:.0f} s")
