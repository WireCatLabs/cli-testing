"""Blind sample for a new question set: random eligible messages per stratum, fixed seed.

Prints message text, so its output stays private. A person (or an agent) then walks each list in order and keeps the
first messages that carry a fact; a separate writer, who sees only the kept text, writes the questions.

Usage: python3 -I sample.py --db FILE --big IDS --private IDS --seed N [--exclude FILE ...] STRATUM START COUNT
  --big, --private  comma-separated chat row ids of the big groups and of the private dialogs
  --exclude         a questions file of earlier sets (its msg and also_ok ids are left out)
Strata: big-owner, big-other (big groups outside huge conversations), private-owner, private-other,
huge-owner, huge-other (current-build conversations with more than 50 chunks, any chat).
"""
import argparse, json, random, re, sqlite3

p = argparse.ArgumentParser()
p.add_argument("--db", required=True)
p.add_argument("--big", required=True)
p.add_argument("--private", required=True)
p.add_argument("--seed", required=True)
p.add_argument("--exclude", action="append", default=[])
p.add_argument("stratum")
p.add_argument("start", type=int)
p.add_argument("count", type=int)
a = p.parse_args()

db = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
used = set()
for path in a.exclude:
  for t in json.load(open(path)):
    used.update([t["msg"], *t.get("also_ok", [])])
HUGE = [r[0] for r in db.execute(
  "select c.id from conversations c join conversation_state s on s.chat_id = c.chat_id and s.current_build = c.build "
  "where (select count(*) from chunks k where k.chunkable_type = 'conversation' and k.chunkable_id = c.id) > 50 "
  "order by c.id")]
H = ",".join(map(str, HUGE)) or "0"


def pool(name):
  owner = 1 if name.endswith("owner") else 0
  base = "select m.id, m.text from messages m where m.deleted_at is null and coalesce(m.outgoing, 0) = ? "
  if name.startswith("huge"):
    q = base + f"and m.id in (select message_id from conversation_messages where conversation_id in ({H}))"
  else:
    chats = a.big if name.startswith("big") else a.private
    q = base + (f"and m.chat_id in ({','.join(str(int(c)) for c in chats.split(','))}) "
                f"and exists (select 1 from conversation_messages cm where cm.message_id = m.id) "
                f"and m.id not in (select message_id from conversation_messages where conversation_id in ({H}))")
  return [i for i, t in db.execute(q + " order by m.id", (owner,)) if i not in used and len(re.findall(r"\w+", t or "")) >= 6]


ids = pool(a.stratum)
random.Random(f"{a.seed}:{a.stratum}").shuffle(ids)
print(a.stratum, "eligible", len(ids), "huge convs", len(HUGE))
for n, mid in enumerate(ids[a.start:a.start + a.count], a.start):
  chat, sent, text, out = db.execute(
    "select chat_id, date(sent_at / 1000, 'unixepoch'), text, outgoing from messages where id = ?", (mid,)).fetchone()
  conv = db.execute(f"select conversation_id from conversation_messages where message_id = ? and conversation_id in ({H})",
                    (mid,)).fetchone()
  print(f"--- #{n} id={mid} chat={chat} {sent} out={out} huge={conv[0] if conv else '-'}\n{text[:500]}")
