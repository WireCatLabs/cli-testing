#!/usr/bin/env bash
# Contestant E: the user exports the chats from Telegram Desktop by hand. This only times it and checks the result.
# Usage: e-setup.sh <export-dir> [run-dir, default ~/.cache/wirecat-experiment-b]
set -euo pipefail
export_dir=$(realpath -m "${1:?usage: e-setup.sh <export-dir> [run-dir]}"); run=$(realpath -m "${2:-$HOME/.cache/wirecat-experiment-b}")
mkdir -p "$run/e"
cat <<TXT
In Telegram Desktop, for each test chat: ⋮ → Export chat history → Format: Machine-readable JSON,
media off, period: all time, path: $export_dir
TXT
read -r -p "Press Enter when you start exporting. " _
start=$(date +%s)
read -r -p "Press Enter when every chat is exported. " _
echo "setup_seconds $(( $(date +%s) - start ))" | tee "$run/e/setup.log"
find "$export_dir" -name result.json | tee -a "$run/e/setup.log" | wc -l
