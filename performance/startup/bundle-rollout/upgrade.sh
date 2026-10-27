#!/usr/bin/env bash
# usage: upgrade.sh <name> <command> <profile|-> <from> <to> <reads.json>   (from, to: tarballs; WORK= sets the work folder;
# MCP="mcp" for a CLI from before `mcp serve`)
# Installs <from>, opens an MCP session over stdio, upgrades in place with npm install -g <to>, then the same session
# answers the reads. No account: every read is offline or local. Prints the session log and failed module loads.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
S=${WORK:-$HERE/work}
NAME=$1 CMD=$2 PROFILE=$3 FROM=$4 TO=$5 READS=$6
W=$S/runs/$NAME
rm -rf "$W"; mkdir -p $W/home/run $W/tmp && chmod 700 $W/home/run
cd $W || exit 1
export HOME=$W/home XDG_CONFIG_HOME=$W/home/.config XDG_DATA_HOME=$W/home/.local/share XDG_STATE_HOME=$W/home/.local/state
export XDG_CACHE_HOME=$W/home/.cache XDG_RUNTIME_DIR=$W/home/run MESSAGING_STORE=$W/home/store.db TMPDIR=$W/tmp
for p in TG MAX WA ZM MEMO DRIVE GCAL CLIDEV; do export ${p}_NO_UPDATE_CHECK=1; done
export npm_config_prefix=$W/prefix npm_config_cache=$S/npmcache PATH=$W/prefix/bin:$PATH
unset DBUS_SESSION_BUS_ADDRESS
export TRACE_LOG=$W/loads.log NODE_OPTIONS="--import=$HERE/trace-loads.mjs"
LOG=$W/report.log
r() { echo "\$ $*" >>$LOG; "$@" >>$LOG 2>&1; echo "-> exit $?" >>$LOG; }
: >$LOG; : >$W/loads.log
NODE_OPTIONS= npm install -g --no-fund --no-audit "$FROM" >>$LOG 2>&1 || { echo install failed; exit 1; }
[ "$(command -v $CMD)" = "$W/prefix/bin/$CMD" ] || { echo "wrong $CMD: $(command -v $CMD)"; exit 1; }
r $CMD --version
[ "$PROFILE" = - ] || r $CMD $PROFILE config set limit 20
node $HERE/mcp-driver.mjs $W/prefix/bin/$CMD $CMD $PROFILE $W/mcp.log $W/go $READS ${MCP:-mcp serve} &
for i in $(seq 60); do grep -q "waiting for go file" $W/mcp.log 2>/dev/null && break; sleep 1; done
sleep 4
echo "=== upgrade to $(basename $TO) at $(date -u +%T)" >>$LOG
NODE_OPTIONS= r npm install -g --no-fund --no-audit "$TO"
r $CMD --version
touch $W/go
for i in $(seq 120); do grep -q "CHILD EXIT\|done; closing" $W/mcp.log && break; sleep 1; done
sleep 6
echo "--- $NAME: session"
sed -E 's/^[0-9TZ:.-]+ //' $W/mcp.log | cut -c1-220
echo "--- $NAME: verdict"
calls=$(grep -c '^.*\[after\] tools/call' $W/mcp.log)
bad=$(grep '\[after\]' $W/mcp.log | grep -c 'TIMEOUT\|RPC ERROR\|command.crashed\|internal_error')
tools=$(grep -c '\[after\] tools/list .*tools: .*_read' $W/mcp.log)
if [ "$calls" -ge 3 ] && [ "$bad" = 0 ] && [ "$tools" = 1 ]; then echo "PASS: $calls calls after the upgrade, none crashed"; else echo "FAIL: $calls calls, $bad crashed or timed out, tools listed: $tools"; fi
echo "--- $NAME: failed loads"
grep -c "FAIL" $W/loads.log
grep "FAIL" $W/loads.log | head -5
echo "--- $NAME: preloaded before the upgrade: $(grep -c ' load .*/dist/bundle/' $W/loads.log) bundle loads in the trace"
grep "\-> exit\|^\\$" $LOG | paste - - | cut -c1-160
