#!/bin/sh
# One Q3 run over all chats with timestamps on stderr (T label ms-since-start). Private; stays here.
Q="$(sed -n 's/^3\. //p' /home/leemour/.cache/wirecat-experiment-b/r4b/all-w.txt)"
cd /var/tmp
WIRECAT_STATE_DIR=/home/leemour/.cache/wirecat-experiment-b/r5/state TG_OPENAI_API_KEY="$OPENAI_API_KEY" NODE_OPTIONS="--import $(dirname "$(readlink -f "$0")")/exit-time.mjs"   node /home/leemour/Projects/AI/tg-cli-wt-search-perchat/dist/bin/tg.js personal search conversations "$Q"   --embedding-provider openai --model text-embedding-3-small --dims 768 --limit 20 --json 2>&1 >/dev/null | grep -E "^(T|R) "
