#!/usr/bin/env bash
# usage: run.sh <name> <from> <to|"tg-upgrade">   (from, to: an npm spec or a tarball; WORK= sets the work folder)
# No Telegram account: an empty session file, fake app keys and a proxy on a closed port keep serve running offline.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
S=${WORK:-$HERE/work}
NAME=$1 FROM=$2 TO=$3
W=$S/runs/$NAME
mkdir -p $W/home/run $W/tmp && chmod 700 $W/home/run
cd $W || exit 1
export HOME=$W/home XDG_CONFIG_HOME=$W/home/.config XDG_DATA_HOME=$W/home/.local/share XDG_STATE_HOME=$W/home/.local/state
export XDG_CACHE_HOME=$W/home/.cache XDG_RUNTIME_DIR=$W/home/run MESSAGING_STORE=$W/home/store.db TG_NO_UPDATE_CHECK=1
export npm_config_prefix=$W/prefix npm_config_cache=$S/npmcache PATH=$W/prefix/bin:$PATH TMPDIR=$W/tmp
unset DBUS_SESSION_BUS_ADDRESS
export TRACE_LOG=$W/loads.log NODE_OPTIONS="--import=$HERE/trace-loads.mjs"
export TG_API_ID=1 TG_API_HASH=00000000000000000000000000000000
LOG=$W/report.log
r() { echo "\$ $*" >>$LOG; "$@" >>$LOG 2>&1; echo "-> exit $?" >>$LOG; }
step() { echo "=== $* ($(date +%T))" >>$LOG; }
: >$LOG; : >$W/loads.log
step install $FROM
npm install -g --no-fund --no-audit "$FROM" >>$LOG 2>&1 || { echo install failed >>$LOG; exit 1; }
[ "$(command -v tg)" = "$W/prefix/bin/tg" ] || { echo "wrong tg: $(command -v tg)" >>$LOG; exit 1; }
PKG=$W/prefix/lib/node_modules/@wirecat/tg-cli
r tg --version
echo "dist files: $(find $PKG/dist -type f | wc -l)" >>$LOG
r tg demo config set proxy socks5://127.0.0.1:9
mkdir -p $XDG_DATA_HOME/tg-cli/sessions && chmod 700 $XDG_DATA_HOME/tg-cli/sessions
: >$XDG_DATA_HOME/tg-cli/sessions/demo.session && chmod 600 $XDG_DATA_HOME/tg-cli/sessions/demo.session
step server start
r tg demo server start
sleep 5
r tg demo server status
step mcp start
rm -f $W/go $W/mcp.log
node $HERE/mcp-driver.mjs $W/prefix/bin/tg demo $W/mcp.log $W/go $HERE/calls-before.json $HERE/calls-after.json &
DRIVER=$!
echo "driver pid $DRIVER" >>$LOG
for i in $(seq 60); do grep -q "waiting for go file" $W/mcp.log 2>/dev/null && break; sleep 1; done
ps -eo pid,args | grep "[t]g.js demo serve\|[t]g demo serve\|tg-cli/dist/bin/tg.js demo" >>$LOG
sleep 5
step upgrade to $TO
UPGRADED_AT=$(date -u +%FT%T)
echo "upgraded at $UPGRADED_AT" >>$LOG
if [ "$TO" = tg-upgrade ]; then
  r tg upgrade --check
  r tg upgrade
else
  r npm install -g --no-fund --no-audit "$TO"
fi
echo "dist files now: $(find $PKG/dist -type f | wc -l)" >>$LOG
step mcp after-phase
touch $W/go
for i in $(seq 120); do grep -q "CHILD EXIT\|done; closing" $W/mcp.log && break; sleep 1; done
sleep 2
step new CLI runs
r tg --version
r tg --help
r tg demo chats list --offline
r tg bot api --help
r tg demo doctor
step old serve, 70s after upgrade
r tg demo server status
sleep 70
r tg demo server status
r tg demo server logs
step server restart
r tg demo server restart
sleep 5
r tg demo server status
step stop again, then start
r tg demo server stop
r tg demo server start
r tg demo server status
step compile cache
NODE_OPTIONS= NODE_DEBUG_NATIVE=COMPILE_CACHE tg --version 2>&1 | grep -ci "hit\|cache" >>$LOG
NODE_OPTIONS= NODE_DEBUG_NATIVE=COMPILE_CACHE tg --version 2>&1 | grep -i "compile cache" | sort | uniq -c | head -8 >>$LOG
step stop
r tg demo server stop
r tg demo server stop
echo "left running (check by PID):" >>$LOG; ps -eo pid,ppid,args | grep "$W/prefix" | grep -v grep >>$LOG
echo "compile cache dirs: $(ls $W/tmp 2>/dev/null)" >>$LOG
step done
