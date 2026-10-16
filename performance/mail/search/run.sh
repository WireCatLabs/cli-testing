#!/usr/bin/env bash
# Times memo's mail search on a copy of the store. Queries come as arguments and are never printed: the output names
# them by position, so a run on real mail can be shared. usage: run.sh <memo.js> <account> <query>...
set -euo pipefail

MEMO=$1
ACCOUNT=$2
shift 2
STORE=${MESSAGING_STORE_SOURCE:-$HOME/.local/share/WireCat/wirecat.db}
WORK=$(mktemp -d -p "$HOME/.cache" memo-search.XXXXXX)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

sqlite3 "$STORE" ".backup '$WORK/copy.db'"
echo "store copy: $(sqlite3 -readonly "$WORK/copy.db" 'select count(*) from emails') emails, $(sqlite3 -readonly "$WORK/copy.db" 'select count(*) from email_mailboxes') mailbox links"
n=0
for query in "$@"; do
  n=$((n + 1))
  start=$(date +%s.%N)
  answer=$(MEMO_NO_UPDATE_CHECK=1 MESSAGING_STORE="$WORK/copy.db" node "$MEMO" search mail "$query" --account "$ACCOUNT" --json 2>&1 || true)
  seconds=$(echo "$(date +%s.%N) - $start" | bc)
  printf 'query %d: %6.2f s  %s\n' "$n" "$seconds" \
    "$(printf '%s' "$answer" | jq -c '{hits: ((.items // .item.items // []) | length), error: .error.reason}' 2>/dev/null || echo unreadable)"
done
