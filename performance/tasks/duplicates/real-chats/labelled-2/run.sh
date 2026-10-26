#!/bin/bash
# bash run.sh <cli-core dir> — run in a private folder holding chats.json (ids, never committed) and categories.txt
# (`tg personal --offline tasks categories`). Writes only the store copy; the live store is opened read-only.
set -euo pipefail
core=$1
here=$(dirname "$(readlink -f "$0")")
for f in "$here"/*.py "$here"/*.mjs "$here"/*.sh "$here"/*.txt; do [ "$(basename "$f")" = run.sh ] || cp "$f" .; done
mkdir -p days out oldout labout cfg
sqlite3 "file:$HOME/.local/share/WireCat/wirecat.db?mode=ro" ".backup store.db"
python3 export-days.py
ls days/*.txt | xargs -P 6 -n 1 ./draft-one.sh
python3 build-drafts.py
node replay.mjs "$PWD"
python3 pool.py
python3 build-new-in.py
node score.mjs "$core" new-in.json new-scored.json
python3 sample.py
python3 build-labels.py
ls lab/*.txt | xargs -P 6 -n 1 ./label-one.sh
python3 parse-labels.py
python3 parse-old.py
python3 export-old.py
ls oldsrc/*.txt | xargs -P 4 -n 1 ./locate-one.sh
python3 build-old-in.py
node features.mjs "$core" new-in.json new-feat.json
node features.mjs "$core" old-in.json old-feat.json
python3 report.py
python3 holdout.py
python3 weighted.py
