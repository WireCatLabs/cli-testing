import sqlite3, datetime, zoneinfo
tz=zoneinfo.ZoneInfo("Europe/Madrid")
def context(db, chat_id, ext, before=10, after=10):
    sent=db.execute("select sent_at from messages where chat_id=? and external_id=?",(chat_id,str(ext))).fetchone()[0]
    rows=db.execute("select * from (select external_id, sent_at, outgoing, reply_to_external_id, coalesce(text,'') from messages where chat_id=? and sent_at<? order by sent_at desc limit ?) union all select * from (select external_id, sent_at, outgoing, reply_to_external_id, coalesce(text,'') from messages where chat_id=? and sent_at>=? order by sent_at limit ?)",(chat_id,sent,before,chat_id,sent,after+1)).fetchall()
    rows.sort(key=lambda r:r[1])
    out=[]
    for e,s,o,rt,t in rows:
        dt=datetime.datetime.fromtimestamp(s/1000,tz)
        mark=">>> " if str(e)==str(ext) else "    "
        t=t.strip() or "[media]"
        if len(t)>700: t=t[:700]+"…"
        out.append(f"{mark}[{e}] {dt.strftime('%Y-%m-%d %H:%M')} {'OWNER' if o else 'OTHER'}{' ↩'+rt if rt else ''}: {t}")
    return "\n".join(out)
