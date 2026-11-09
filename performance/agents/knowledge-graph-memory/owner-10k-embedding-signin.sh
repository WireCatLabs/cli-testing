#!/usr/bin/env bash
# One-time embedding-only llama.cpp setup for the 10K OpenClaw root. Answer No to the chat model, Yes to the
# embedding model.
set -euo pipefail
R=${1:-$HOME/.cache/wirecat-bench/openclaw-10k}
exec env -i HOME="$R/home" OPENCLAW_HOME="$R/home" TMPDIR="$R/tmp" PATH="$R/node/bin:/usr/bin:/bin" TERM="${TERM:-xterm}" \
  TZ=UTC OPENCLAW_NO_AUTO_UPDATE=1 DBUS_SESSION_BUS_ADDRESS=disabled: \
  "$R/pkg/node_modules/.bin/openclaw" models auth login --provider llama-cpp --method local
