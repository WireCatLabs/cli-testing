import os
import sqlite3, json, random
random.seed(7)
c=sqlite3.connect("file:"+os.path.expanduser("~/.local/share/WireCat/wirecat.db")+"?mode=ro",uri=True)
rows=c.execute("""select at.id, m.chat_id, ch.external_id, m.external_id, at.position, at.mime, at.size, m.text<>'' , m.sent_at
from attachments at join messages m on at.attachable_type='message' and at.attachable_id=m.id
join chats ch on ch.id=m.chat_id where m.account_id="+str(int(os.environ["TG_ACCOUNT_ID"]))+" and m.deleted_at is null and (at.kind in('photo','image') or at.mime like 'image/%') and (at.size is null or at.size<6000000)""").fetchall()
print(len(rows), len({r[1] for r in rows}))
bychat={}
for r in rows: bychat.setdefault(r[1],[]).append(r)
chats=list(bychat); random.shuffle(chats)
sel=[];cap=[];nocap=[]
# round robin max 2 per chat, balance caption
for rnd in range(40):
  for ch in chats:
    l=bychat[ch]; random.shuffle(l)
    if len(l)>rnd: sel.append(l[rnd])
  if len(sel)>=400: break
w=[r for r in sel if r[7]]; wo=[r for r in sel if not r[7]]
pick=w[:75]+wo[:75]
if len(pick)<150: pick=sel[:150]
print(len(pick), sum(1 for r in pick if r[7]), len({r[1] for r in pick}))
json.dump([dict(attId=r[0],chatDb=r[1],chat=r[2],msg=r[3],pos=r[4],mime=r[5],size=r[6],caption=bool(r[7]),sent=r[8]) for r in pick],open("tg_list.json","w"))
