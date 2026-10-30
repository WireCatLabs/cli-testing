#!/usr/bin/env bash
# Usage: gcal-in.sh <sandbox> <gcal bin.js> args... — runs gcal on a sandbox's store, away from the real keyring.
set -euo pipefail
D=$1; BIN=$2; shift 2
exec env -u DBUS_SESSION_BUS_ADDRESS HOME="$D/home" XDG_CONFIG_HOME="$D/home/.config" XDG_DATA_HOME="$D/home/.local/share" \
  XDG_STATE_HOME="$D/home/.local/state" XDG_CACHE_HOME="$D/home/.cache" GCAL_CONFIG_DIR="$D/config" \
  GCAL_STATE_DIR="$D/state" GCAL_CACHE_DIR="$D/cache" GCAL_NO_UPDATE_CHECK=1 MESSAGING_STORE="$D/store/wirecat.db" \
  node "$BIN" "$@"
