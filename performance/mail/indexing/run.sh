#!/usr/bin/env bash
# Profiles the mail index drain and e5-small embedding on a copy of the store; the live store is only read once, by
# SQLite's backup. usage: run.sh <cli-core checkout, built> [threads to keep queued=300] [emails to word-index=300] [chunks to embed=64]
set -euo pipefail

CORE=$(cd "$1" && pwd)
THREADS=${2:-300}
EMAILS=${3:-300}
CHUNKS=${4:-64}
HERE=$(cd "$(dirname "$0")" && pwd)
STORE=${MESSAGING_STORE_SOURCE:-$HOME/.local/share/WireCat/wirecat.db}
MODELS=${MODELS_DIR:-$HOME/.local/share/WireCat/models}
WORK=$(mktemp -d -p "$HOME/.cache" memo-indexing.XXXXXX)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

sqlite3 "$STORE" ".backup '$WORK/source.db'"
mkdir -p "$WORK/home" "$WORK/state"
ln -s "$MODELS" "$WORK/state/models"
run() { HOME="$WORK/home" WIRECAT_STATE_DIR="$WORK/state" MESSAGING_STORE="$WORK/copy.db" node "$@"; }

cp "$WORK/source.db" "$WORK/copy.db"
echo "== queued threads: drain, then embed $CHUNKS chunks"
run "$HERE/profile.mjs" "$CORE" "$WORK/copy.db" "$THREADS" "$CHUNKS"
cp "$WORK/source.db" "$WORK/copy.db"
echo "== word index for the newest $EMAILS emails with text"
run "$HERE/profile-words.mjs" "$CORE" "$WORK/copy.db" "$EMAILS"
