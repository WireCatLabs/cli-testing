#!/usr/bin/env bash
# Contestant B: HubSpot's Agent CLI (beta), installed by HubSpot's own script with HOME moved to the run folder so it
# touches nothing of the owner's; HubSpot's agent skills in the agent's folder; and the `hubspot` wrapper the agent
# runs. The wrapper reads the service key from the keyring at each call and hands it to the CLI's environment only, so
# the agent's shell never holds it. Auto-upgrade is off, so one run uses one version.
# Usage: b-setup.sh
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
source "$here/env.sh"
B="$RUN/b"
mkdir -p "$B/home" "$B/bin" "$B/agent" "$B/download"
if [ ! -x "$B/home/.hubspot/bin/hubspot" ]; then
  curl -fsSL https://api.hubapi.com/hub/cli/backend/hub-cli/latest/install.sh -o "$B/download/install.sh"
  HOME="$B/home" SHELL=/bin/bash sh "$B/download/install.sh"
fi
[ -d "$B/agent/.claude/skills/crm-lookup" ] ||
  (cd "$B/agent" && HOME="$B/home" npm_config_cache="$B/npm-cache" npx -y skills add hubspot/agent-cli-skills --agent claude-code -y)
cat > "$B/bin/hubspot" <<WRAP
#!/usr/bin/env bash
token=\$(secret-tool lookup service "$KEYRING_SERVICE" account "$KEYRING_ACCOUNT" 2>/dev/null)
exec env HOME="$B/home" HUBSPOT_NO_AUTO_UPGRADE=1 HUBSPOT_ACCESS_TOKEN="\$token" "$B/home/.hubspot/bin/hubspot" "\$@"
WRAP
chmod +x "$B/bin/hubspot"
HUBSPOT_NO_AUTO_UPGRADE=1 HOME="$B/home" "$B/home/.hubspot/bin/hubspot" --version
sha256sum "$B/home/.hubspot/bin/hubspot"
jq -r '[.skills | to_entries[0].value.commit] | "skills commit " + .[0]' "$B/agent/skills-lock.json"
"$B/bin/hubspot" whoami
