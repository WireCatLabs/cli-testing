#!/usr/bin/env bash
# Contestant A: WireCat attio from npm, a profile signed in with the workspace's token into a private file under the
# run folder, a full sync, the shipped skill in the agent's folder, and the `attio` wrapper the agent runs. Every
# write is off (WCATTIO_READ_ONLY): this test only reads. A rerun keeps the sign-in and syncs again.
# Usage: a-setup.sh
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
source "$here/env.sh"
mkdir -p "$RUN/a/bin" "$RUN/a/agent/.claude/skills"
installed=$(jq -r .version "$RUN/a/npm/node_modules/@wirecat/attio-cli/package.json" 2>/dev/null || true)
[ "$installed" = "$ATTIO_VERSION" ] || npm install --silent --prefix "$RUN/a/npm" "@wirecat/attio-cli@$ATTIO_VERSION"
at() { wirecat_env "$ATTIO_BIN" "$@"; }
if ! at "$PROFILE" session status --check --json >/dev/null 2>&1; then
  node "$here/with-token.mjs" --stdin env WCATTIO_CONFIG_DIR="$RUN/a/config" WCATTIO_STATE_DIR="$RUN/a/state" \
    WCATTIO_CACHE_DIR="$RUN/a/cache" MESSAGING_STORE="$RUN/a/wirecat.db" DBUS_SESSION_BUS_ADDRESS="disabled:" \
    WCATTIO_NO_UPDATE_CHECK=1 "$ATTIO_BIN" "$PROFILE" session start --credential-storage file --json >/dev/null
fi
# Notes and tasks reach the copy only with the owner's activities setting (attio-cli 0.4.0 on). This script is the
# owner's run, so it sets it with writes on and the agent markers off; the agent under test cannot.
workspace=$(at "$PROFILE" session status --check --json | jq -r .item.id)
wirecat_env env -u AI_AGENT -u CLAUDECODE WCATTIO_READ_ONLY= "$ATTIO_BIN" "$PROFILE" config set \
  "crm.attio:$workspace.activities" on >/dev/null
at "$PROFILE" sync --json > "$RUN/a/sync.json"
jq -c '{complete: .item.complete, activities: .item.activities, issues: [.item.issues[]?.reason]}' "$RUN/a/sync.json"
rm -rf "$RUN/a/agent/.claude/skills/attio-cli"
cp -r "$RUN/a/npm/node_modules/@wirecat/attio-cli/skills/attio-cli" "$RUN/a/agent/.claude/skills/"
cat > "$RUN/a/bin/attio" <<WRAP
#!/usr/bin/env bash
exec env WCATTIO_CONFIG_DIR="$RUN/a/config" WCATTIO_STATE_DIR="$RUN/a/state" WCATTIO_CACHE_DIR="$RUN/a/cache" \\
  MESSAGING_STORE="$RUN/a/wirecat.db" DBUS_SESSION_BUS_ADDRESS="disabled:" WCATTIO_READ_ONLY=1 \\
  WCATTIO_NO_UPDATE_CHECK=1 "$ATTIO_BIN" "\$@"
WRAP
chmod +x "$RUN/a/bin/attio"
"$RUN/a/bin/attio" --version
echo "A ready: $RUN/a/bin/attio"
