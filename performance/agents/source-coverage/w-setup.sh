#!/usr/bin/env bash
# Contestant W: WireCat from an empty, throwaway store. Syncs each chat and times the whole setup.
# Usage: w-setup.sh <chats-file: one chat id per line> <run-dir>
set -euo pipefail
chats=$(realpath "$1"); run=$(realpath -m "$2")
mkdir -p "$run/w/state"
export WIRECAT_STATE_DIR="$run/w/state" TG_READ_ONLY=1
log="$run/w/setup.log"
start=$(date +%s)
echo "start $(date -Is)" > "$log"
while read -r chat; do
  [ -z "$chat" ] && continue
  t0=$(date +%s)
  tg personal messages sync "$chat" --limit "${W_LIMIT:-20000}" --timeout "${W_TIMEOUT:-30m}" --no-catch-up > /dev/null
  echo "chat $chat synced in $(( $(date +%s) - t0 ))s" >> "$log"
done < "$chats"
t0=$(date +%s)
tg personal messages sync "$(head -1 "$chats")" --limit 1 --catch-up > /dev/null
echo "search catch-up in $(( $(date +%s) - t0 ))s" >> "$log"
echo "setup_seconds $(( $(date +%s) - start ))" >> "$log"
tg personal store chats status >> "$log"
cat "$log"
