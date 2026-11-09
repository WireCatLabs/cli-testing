#!/usr/bin/env bash
# memo, PR 1 and PR 2 (two variants) on the realmail store, reworded and original wording.
set -euo pipefail
cd "$(dirname "$0")"
export STORE=store-realmail
FIX=(SPIKE_MERGE=cosine SPIKE_HEAD=1 SPIKE_MAILQ=notes)
for wording in reworded plain; do
  P=""
  if [ "$wording" = plain ]; then export QSET=plain; P=plain-; fi
  [ -d "runs/rm-${P}baseline" ] || python3 run.py "rm-${P}baseline" | cut -c1-90
  python3 run.py "rm-${P}pr1" "${FIX[@]}" | cut -c1-90
  python3 run.py "rm-${P}pr2-above" "${FIX[@]}" SPIKE_WORDS=above | cut -c1-90
  python3 run.py "rm-${P}pr2-below" "${FIX[@]}" SPIKE_WORDS=below | cut -c1-90
done
