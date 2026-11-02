#!/usr/bin/env bash
# Signs the benchmark's throwaway OpenClaw into the owner's ChatGPT/Codex subscription, then lists the models it offers.
# The sign-in is stored in that throwaway folder only; nothing is read from or written to ~/.openclaw or ~/.codex.
# Usage: openclaw-signin.sh [root]   (default ~/.cache/wirecat-bench/openclaw, prepared by openclaw_runner.py install)
set -euo pipefail

root=${1:-$HOME/.cache/wirecat-bench/openclaw}
openclaw=$root/pkg/node_modules/.bin/openclaw
[ -x "$openclaw" ] || { echo "OpenClaw is not installed in $root; run openclaw_runner.py install first" >&2; exit 1; }

run() {
  env -i HOME="$root/home" OPENCLAW_HOME="$root/home" TMPDIR="$root/tmp" PATH="$root/node/bin:/usr/bin:/bin" \
    TERM="${TERM:-xterm}" TZ=UTC OPENCLAW_NO_AUTO_UPDATE=1 DBUS_SESSION_BUS_ADDRESS=disabled: "$openclaw" "$@"
}

echo "OpenClaw home: $root/home"
echo "Open the link it prints, sign in with ChatGPT and enter the code."
run models auth login --provider openai --device-code --agent files
echo
echo "Models this sign-in offers (pick one for openclaw_runner.py answer --model):"
run models list --provider openai --refresh --agent files
echo
for agent in files memo; do
  echo "Saved OpenAI sign-ins the $agent agent can use (both agents must list one):"
  run models auth list --provider openai --agent "$agent"
done
