import sqlite3
MSG="SELECT m.id, m.text, m.sent_at, m.outgoing, p.id, p.owner FROM messages m LEFT JOIN identity_links il ON il.identity_id = m.sender_identity_id LEFT JOIN persons p ON p.id = il.person_id"
def message(db, chat_id, ext):
    r=db.execute(MSG+" WHERE m.chat_id=? AND m.external_id=?",(chat_id,str(ext))).fetchone()
    if not r: return None
    mid,text,sent,out,pid,owner=r
    own = out==1 or owner==1
    return dict(messageId=mid, message=text or "", sentMs=sent, person=None if own or pid is None else f"person:{pid}", chain=chain(db,mid))
def chain(db, mid):
    up=db.execute("WITH RECURSIVE up(id, chat_id, reply, depth) AS (SELECT id, chat_id, reply_to_external_id, 0 FROM messages WHERE id = ? UNION SELECT m.id, m.chat_id, m.reply_to_external_id, up.depth + 1 FROM messages m JOIN up ON m.chat_id = up.chat_id AND m.external_id = up.reply WHERE up.depth < 20) SELECT id FROM up",(mid,)).fetchall()
    down=db.execute("WITH RECURSIVE down(id, chat_id, external_id, depth) AS (SELECT id, chat_id, external_id, 0 FROM messages WHERE id = ? UNION SELECT m.id, m.chat_id, m.external_id, down.depth + 1 FROM messages m JOIN down ON m.chat_id = down.chat_id AND m.reply_to_external_id = down.external_id WHERE m.deleted_at IS NULL AND down.depth < 20) SELECT id FROM down",(mid,)).fetchall()
    return sorted({x[0] for x in up+down})
