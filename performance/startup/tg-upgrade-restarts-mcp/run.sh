#!/usr/bin/env bash
# usage: run.sh <from.tgz> <to.tgz> <to-version>   (WORK= sets the work folder; it must not exist yet)
# Isolated HOME, XDG folders, store and npm prefix; no Telegram account. Port 18765, so a real server on 8765 is untouched.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
FROM=$1 TO=$2 TO_VERSION=$3
W=${WORK:-$HERE/work}
[ ! -e "$W" ] || { echo "$W exists" >&2; exit 1; }
mkdir -p $W/home/run $W/tmp && chmod 700 $W/home/run
cd $W || exit 1
export HOME=$W/home XDG_CONFIG_HOME=$W/home/.config XDG_DATA_HOME=$W/home/.local/share XDG_STATE_HOME=$W/home/.local/state
export XDG_CACHE_HOME=$W/home/.cache XDG_RUNTIME_DIR=$W/home/run MESSAGING_STORE=$W/home/store.db TG_NO_UPDATE_CHECK=1
export npm_config_prefix=$W/prefix npm_config_cache=$W/npmcache TMPDIR=$W/tmp
export E2E_REAL_NPM=$(command -v npm)
export PATH=$HERE/fake-npm:$W/prefix/bin:$PATH
unset DBUS_SESSION_BUS_ADDRESS TG_STATE_DIR TG_CONFIG_DIR TG_PROFILE
export TG_API_ID=1 TG_API_HASH=00000000000000000000000000000000
LOG=$W/report.log
r() { echo "\$ $*" >>$LOG; "$@" >>$LOG 2>&1; echo "-> exit $?" >>$LOG; }
step() { echo "=== $* ($(date +%T))" >>$LOG; }
: >$LOG
step install $FROM
"$E2E_REAL_NPM" install -g --no-fund --no-audit "$FROM" >>$LOG 2>&1 || { echo install failed >>$LOG; exit 1; }
[ "$(command -v tg)" = "$W/prefix/bin/tg" ] || { echo "wrong tg: $(command -v tg)" >>$LOG; exit 1; }
r tg --version
r tg demo config set proxy socks5://127.0.0.1:9
mkdir -p $XDG_DATA_HOME/tg-cli/sessions && chmod 700 $XDG_DATA_HOME/tg-cli/sessions
: >$XDG_DATA_HOME/tg-cli/sessions/demo.session && chmod 600 $XDG_DATA_HOME/tg-cli/sessions/demo.session
step http mcp server start
r tg demo mcp server start --port 18765 --public-url https://laptop.example.ts.net --permission messages.send=deny --json
echo "launch record:" >>$LOG; find $HOME -name "*.launch.json" -exec cat {} \; >>$LOG
step stdio session start
node $HERE/stdio-client.mjs tg demo $W/session.pid $W/stop >$W/client.log 2>&1 &
for i in $(seq 30); do grep -q "client got" $W/client.log 2>/dev/null && break; sleep 1; done
ps -o pid,args -p $(cat $W/session.pid) >>$LOG
step upgrade to $TO
E2E_TO=$TO E2E_LATEST=$TO_VERSION NODE_OPTIONS="--import=$HERE/fake-latest.mjs" r tg upgrade --json
E2E_TO=$TO E2E_LATEST=$TO_VERSION NODE_OPTIONS="--import=$HERE/fake-latest.mjs" r tg upgrade
step after
r tg --version
r tg demo mcp server status --json
echo "stdio session after the upgrade:" >>$LOG; ps -o pid,args -p $(cat $W/session.pid) >>$LOG
step stop
r tg demo mcp server stop --json
touch $W/stop
