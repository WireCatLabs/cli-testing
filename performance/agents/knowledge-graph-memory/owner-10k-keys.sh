#!/usr/bin/env bash
# The owner's one step before the 10K agent runs: every 10K setup gets its keys from the OS keyring, through the
# existing per-agent scripts. No key reaches a command line, the screen or a log; ~/.hermes and ~/.openclaw are
# never touched. Run after openclaw_runner.py install-plugin and hermes_runner.py prepare for all four configs.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$HOME/.cache/wirecat-bench/openclaw-10k

echo "== OpenClaw 10K: Anthropic key for the files and memo agents"
"$here/openclaw-anthropic-key.sh" "$root"
echo "== OpenClaw 10K: Anthropic, Supermemory and Mem0 keys for the plugin agents"
WIRECAT_OPENCLAW_ROOT=$root "$here/openclaw-memory-keys.sh"
echo "== Hermes 10K: Anthropic key for alone, wirecat, supermemory, mem0"
WIRECAT_BENCH=$HOME/.cache/wirecat-bench-10k "$here/hermes-anthropic-key.sh"
echo "done"
