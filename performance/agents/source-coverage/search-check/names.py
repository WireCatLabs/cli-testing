import sqlite3, re, collections, sys
DB = "file:/home/leemour/.cache/wirecat-experiment-b/r5/state/wirecat.db?immutable=1"
db = sqlite3.connect(DB, uri=True)
total = db.execute("select count(*) from messages").fetchone()[0]
for stem in sys.argv[1:]:
  rows = db.execute("""select ch.external_id, ch.kind, ch.message_count, m.text from message_stems s join messages m on m.id=s.rowid
     join chats ch on ch.id=m.chat_id where message_stems match ?""", (f'stems : "{stem}"',)).fetchall()
  per = collections.Counter(r[0] for r in rows)
  kind = {r[0]: (r[1], r[2]) for r in rows}
  dialogs = [(c, n) for c, n in per.most_common() if kind[c][0] == "dialog"]
  best = dialogs[0] if dialogs else None
  cap = start = voc = mid_cap = 0; n = 0
  for c, k, mc, text in rows:
    if best is None or c != best[0]: continue
    for m in re.finditer(r"(?i)(?<![\w])(" + re.escape(stem) + r"\w*)", text or ""):
      n += 1; w = m.group(1); at_start = text[:m.start()].strip() == "" or re.search(r"[.!?\n]\s*$", text[:m.start()])
      cap += w[0].isupper(); start += bool(at_start); voc += bool(at_start and text[m.end():m.end()+1] == ",")
      mid_cap += (w[0].isupper() and not at_start)
  print(stem, "all", len(rows), "chats", len(per), "dialogs", len(dialogs), "best dialog n", best and best[1],
        "share", best and round(best[1]/len(rows),2), "chat msgs", best and kind[best[0]][1],
        "| in best: cap", round(cap/max(n,1),2), "start", round(start/max(n,1),2), "vocative", round(voc/max(n,1),2), "mid-cap", round(mid_cap/max(n,1),2), "best is target", best and best[0]=="5401505520")
