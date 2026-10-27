#!/usr/bin/env bash
# identity.sh <install dir> <out dir>: run the identity set against an installed tg; one file per command,
# the install dir replaced by DIR
set -u
D=$1; out=$2; S=$(dirname "$0"); rm -rf "$out"; mkdir -p "$out"
T=$(ls "$D/prefix/bin/tg" "$D/pnpm/bin/tg" 2>/dev/null | head -1)
H=$D/run; rm -rf "$H"; mkdir -p "$H"
export HOME=$H XDG_CONFIG_HOME=$H/.config XDG_DATA_HOME=$H/.local/share XDG_STATE_HOME=$H/.local/state XDG_CACHE_HOME=$H/.cache MESSAGING_STORE=$H/store.db WIRECAT_STATE_DIR=$H/wstate TG_NO_UPDATE_CHECK=1 NODE_COMPILE_CACHE=$H/ncc
"$T" bench config set limit 20 >/dev/null 2>&1
i=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  i=$((i+1)); f=$(printf '%02d' $i)
  { echo "\$ tg $line"; eval "\"$T\" $line" 2>&1; echo "exit $?"; } | sed "s|$D|DIR|g" >"$out/$f.txt"
done <<'LIST'
--version
-V
--help
commands --json
messages list --help
bot api get-me --help
bench bot api get-me --help
guide
guide catch-up
guide agent-without-send --json
skill show
skill show follow-ups
skill show link-conversations
skill show --json
doctor --json
bench doctor --json
bench chats list --offline
bench chats list --offline --json
bench config show --json
bench store status --json
bench mcp config --json
default mcp config --json
bench search messages hello --offline --json
bench runs list --json
stats charts --help
completion bash
nonexistent-command
bench messages list
LIST
node "$S/mcp-probe.mjs" "$T" bench mcp 2>&1 | sed "s|$D|DIR|g" >"$out/mcp-bench.txt"
node "$S/mcp-probe.mjs" "$T" mcp 2>&1 | sed "s|$D|DIR|g" >"$out/mcp-all.txt"
echo "$out: $(ls "$out" | wc -l) files"
