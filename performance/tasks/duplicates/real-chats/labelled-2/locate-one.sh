#!/bin/bash
f=$1; b=$(basename $f .txt)
[ -s oldout/$b.jsonl ] && exit 0
{ cat oldprompt.txt; cat $f; } | timeout 600 claude -p --model opus --tools "" > oldout/$b.jsonl 2> oldout/$b.err
