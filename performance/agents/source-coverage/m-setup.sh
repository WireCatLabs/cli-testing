#!/usr/bin/env bash
# Contestant M: chigwell/telegram-mcp at a pinned commit, signed in as a NEW Telegram session.
# Run it in your own terminal, not through an agent: the sign-in prints the session string.
# Usage: m-setup.sh [run-dir, default ~/.cache/wirecat-experiment-b]
set -euo pipefail
run=$(realpath -m "${1:-$HOME/.cache/wirecat-experiment-b}"); dir="$run/m/telegram-mcp"
commit=6b3bd9512736211e2a76ab4b1345c81eeed7b931
start=$(date +%s)
mkdir -p "$run/m"
[ -d "$dir" ] || git clone -q https://github.com/chigwell/telegram-mcp "$dir"
git -C "$dir" checkout -q "$commit"
(cd "$dir" && uv sync -q)
umask 077
if [ ! -s "$dir/.env" ]; then
  echo "API id and hash from https://my.telegram.org/apps (input is hidden):"
  read -rs -p "TELEGRAM_API_ID: " api_id; echo
  read -rs -p "TELEGRAM_API_HASH: " api_hash; echo
  printf 'TELEGRAM_API_ID=%s\nTELEGRAM_API_HASH=%s\n' "$api_id" "$api_hash" > "$dir/.env"
fi
chmod 600 "$dir/.env"
echo "Sign in by QR. At the end answer 'y' so the session goes into .env, not into this terminal's history."
(cd "$dir" && uv run session_string_generator.py --qr)
chmod 600 "$dir/.env"
echo "setup_seconds $(( $(date +%s) - start ))" | tee "$run/m/setup.log"
