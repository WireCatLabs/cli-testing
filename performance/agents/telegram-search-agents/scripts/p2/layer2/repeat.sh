#!/usr/bin/env bash
# Post 2 repeats r2 and r3 of the main arms: tg-skill, qmd-skill, grep, both models, 20 held ids.
set -u
cd "${EXP:-$HOME/.cache/wirecat-experiment-b}/p2/layer2"
IDS=$(python3 -c "print(' '.join(f'H{i}' for i in range(1,21)))")
for rep in r2 r3; do
  export L2_REPEAT=$rep
  echo "== $rep $(date +%T)"; free -g | head -2
  for arm in tg-skill qmd-skill grep; do for model in haiku sonnet; do python3 -I run.py "$model" "$arm" $IDS; done; done
done
echo "REPEAT-DONE $(date +%T)"
