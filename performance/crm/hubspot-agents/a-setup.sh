#!/usr/bin/env bash
# Contestant A: WireCat hubspot from npm, a profile signed in with the test account's key into a private file under
# the run folder, the writes this test asks for allowed, activities turned on, a full sync, the shipped skill in the
# agent's folder, and the `hubspot` wrapper the agent runs. A rerun keeps the sign-in and syncs only what changed.
# Usage: a-setup.sh
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
source "$here/env.sh"
mkdir -p "$RUN/a/bin" "$RUN/a/agent/.claude/skills"
[ -x "$HUBSPOT_BIN" ] || npm install --silent --prefix "$RUN/a/npm" "@wirecat/hubspot-cli@$HUBSPOT_VERSION"
hs() { wirecat_env "$HUBSPOT_BIN" "$@"; }
if ! hs "$PROFILE" session status --check --json >/dev/null 2>&1; then
  with_key_on_stdin wirecat_env "$HUBSPOT_BIN" "$PROFILE" session start --credential-storage file --json >/dev/null
fi
account=$(hs "$PROFILE" session status --check --json | jq -r .item.account)
for key in notes.write tasks.write; do hs "$PROFILE" config set "permissions.$key" allow --json >/dev/null; done
# cli-core refuses this setting to an agent's run (a guard against a change by mistake), so in an agent's session it
# stays off and the owner runs this script once in a terminal.
if ! hs "$PROFILE" config set "crm.hubspot:$account.activities" on --json >/dev/null 2>"$RUN/a/activities.err"; then
  echo "activities stay off: $(jq -r .error.message "$RUN/a/activities.err")" >&2
fi
hs "$PROFILE" sync --json > "$RUN/a/sync.json"
jq -c '{complete: .item.complete, issues: [.item.issues[].reason]}' "$RUN/a/sync.json"
rm -rf "$RUN/a/agent/.claude/skills/hubspot-cli"
cp -r "$RUN/a/npm/node_modules/@wirecat/hubspot-cli/skills/hubspot-cli" "$RUN/a/agent/.claude/skills/"
cat > "$RUN/a/bin/hubspot" <<WRAP
#!/usr/bin/env bash
exec env WCHUBSPOT_CONFIG_DIR="$RUN/a/config" WCHUBSPOT_STATE_DIR="$RUN/a/state" WCHUBSPOT_CACHE_DIR="$RUN/a/cache" \\
  MESSAGING_STORE="$RUN/a/wirecat.db" DBUS_SESSION_BUS_ADDRESS="disabled:" "$HUBSPOT_BIN" "\$@"
WRAP
chmod +x "$RUN/a/bin/hubspot"
echo "A ready: $RUN/a/bin/hubspot"
