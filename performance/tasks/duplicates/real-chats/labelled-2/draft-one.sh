#!/bin/bash
f=$1; b=$(basename $f .txt)
[ -s out/$b.jsonl ] && exit 0
{ cat prompt.txt; cat $f; } | timeout 600 claude -p --model opus --tools "" > out/$b.jsonl 2> out/$b.err
