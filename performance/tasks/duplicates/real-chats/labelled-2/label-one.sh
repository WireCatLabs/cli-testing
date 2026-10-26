#!/bin/bash
f=$1; b=$(basename $f .txt)
[ -s labout/$b.json ] && exit 0
{ cat labelprompt.txt; cat $f; } | timeout 600 claude -p --model opus --tools "" > labout/$b.json 2> labout/$b.err
