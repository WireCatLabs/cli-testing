#!/usr/bin/env bash
# Bytes of one answer under each output option, read-only and offline, on the store made by seed.ts.
#
#   TG_PROFILE=bench MESSAGING_STORE=<store.db> TG_STATE_DIR=<dir with accounts/bench.json> bash run.sh [rounds]
#
# Run it with HOME, XDG_* and WIRECAT_STATE_DIR pointed at a throwaway folder: nothing here may touch a real
# account. tg and memo come from PATH (TG_BIN / MEMO_BIN override). Prints one TSV line per command and variant:
# command, variant, bytes of every round (or "error" when the command refuses the combination).
# "human" is what a terminal shows, captured through a pty; stdout of a pipe is JSON for tg, plain text for memo.
set -u
rounds=${1:-3}
tg=${TG_BIN:-tg}
memo=${MEMO_BIN:-memo}
export NO_COLOR=1 COLUMNS=120

measure() { # label variant bin args...
  local label=$1 variant=$2 bin=$3; shift 3
  local sizes=() out
  for _ in $(seq "$rounds"); do
    if [[ "$variant" == human* ]]; then
      out=$(script -qec "$bin $* 2>/dev/null" /dev/null | sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g; s/\r//g' | wc -c)
    else
      out=$("$bin" "$@" 2>/dev/null | wc -c)
    fi
    [[ "$out" == 0 ]] && out=error
    sizes+=("$out")
  done
  printf '%s\t%s\t%s\n' "$label" "$variant" "${sizes[*]}"
}

bench() { # label bin fields args...
  local label=$1 bin=$2 fields=$3; shift 3
  measure "$label" json "$bin" "$@" --json
  measure "$label" "json=$fields" "$bin" "$@" "--json=$fields"
  measure "$label" "json --brief" "$bin" "$@" --json --brief
  measure "$label" "json --full" "$bin" "$@" --json --full
  measure "$label" jsonl "$bin" "$@" --jsonl
  measure "$label" human "$bin" "$@"
  measure "$label" "human --brief" "$bin" "$@" --brief
}

bench "tg search messages heron --limit 20" "$tg" ref,timestamp,excerpt --offline search messages heron --limit 20
bench "tg messages list 1 --limit 50" "$tg" ref,timestamp,text --offline messages list 1 --limit 50
bench "tg chats list" "$tg" ref,title --offline chats list
bench "tg contacts timeline --limit 20" "$tg" at,locator --offline contacts timeline Alice --limit 20
bench "tg mentions list --limit 20" "$tg" kind,value,locator --offline mentions list --limit 20
bench "memo search all heron --limit 20" "$memo" ref,timestamp,excerpt search all heron --limit 20
bench "memo search messages heron --limit 20" "$memo" ref,timestamp,excerpt search messages heron --limit 20
