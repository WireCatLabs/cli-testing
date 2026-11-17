#!/usr/bin/env bash
# search conversations with OpenAI vectors; $1 query, $2 gold ids, rest extra flags. Shows top 5 and any gold rank.
q=$1; g=$2; shift 2
tg personal search conversations "$q" --embedding-provider openai --model text-embedding-3-small --dims 768 --json "$@" 2>/dev/null | python3 -c '
import json,sys
t=sys.stdin.read(); d=json.loads(t[t.index("{"):].split("\n")[0])
gold=set(map(int,sys.argv[1].split()))
for n,i in enumerate(d["items"],1):
  a,b=int(i["chunk"]["first_message_id"]),int(i["chunk"]["last_message_id"]); h=any(a<=x<=b for x in gold)
  if n<=5 or h: print("   ",n,i["summary"]["chat_id"],a,"-",b,i["summary"]["first_at"][:10],round(i["score"] or 0,3),"+".join(i["by"]),"<== GOLD" if h else "")' "$g"
