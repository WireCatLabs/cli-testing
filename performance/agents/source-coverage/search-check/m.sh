#!/usr/bin/env bash
# one tg message search, archive only; prints hit count, stderr notes and the top 6
tg personal search messages "$@" --backend archive --json --limit 30 2>/tmp/tg-m.err | python3 -c '
import json,sys
t=sys.stdin.read(); d=json.loads(t[t.index("{"):].split("\n")[0])
items=d.get("items",[]); print("   hits",len(items))
for i in items[:6]:
  r=i["ref"].split("/"); print("   ",r[-2],r[-1],i["timestamp"][:10],i["excerpt"].replace("\n"," ")[:90])'
grep -E "also found|no match|did you" /tmp/tg-m.err | sed "s/^/   note: /"
