#!/usr/bin/env bash
# Contestant B: kesslerio's attio-mcp from npm under the run folder (not its install script, which installs globally
# and edits the owner's Claude settings), its bundled skills and the workspace-schema skill its own `attio-discover`
# writes, and the agent folder's .mcp.json. The server starts through with-token.mjs, which reads the token from the
# keyring in its own process and puts it in the server's environment only: never in a file, an argument or the chat.
# Usage: b-setup.sh
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
source "$here/env.sh"
B="$RUN/b"
PKG="$B/npm/node_modules/attio-mcp"
mkdir -p "$B/agent/.claude/skills" "$B/schema"
# attio-mcp 1.7.0 imports fflate in its skill generator without listing it as a dependency, so attio-discover fails
# with ERR_MODULE_NOT_FOUND until it is installed beside it.
[ -d "$PKG" ] || npm install --silent --prefix "$B/npm" "attio-mcp@$KESSLERIO_VERSION" fflate
# The npm package leaves out the bundled skill; it is taken from the repository at the same version's tag.
if [ ! -d "$B/agent/.claude/skills/attio-mcp-usage" ]; then
  mkdir -p "$B/download"
  curl -fsSL "https://codeload.github.com/kesslerio/attio-mcp-server/tar.gz/refs/tags/v$KESSLERIO_VERSION" \
    -o "$B/download/attio-mcp-server.tar.gz"
  tar -xzf "$B/download/attio-mcp-server.tar.gz" -C "$B/agent/.claude/skills" --strip-components=2 \
    "attio-mcp-server-$KESSLERIO_VERSION/skills/attio-mcp-usage"
fi
(cd "$B/schema" && node "$here/with-token.mjs" --env ATTIO_API_KEY node "$PKG/dist/cli/discover.js" generate-skill --all)
find "$B/schema" -name SKILL.md -exec dirname {} \; | while read -r dir; do cp -r "$dir" "$B/agent/.claude/skills/"; done
cat > "$B/agent/.mcp.json" <<JSON
{
  "mcpServers": {
    "attio": {
      "command": "node",
      "args": ["$here/with-token.mjs", "--env", "ATTIO_API_KEY", "node", "$PKG/dist/cli.js"]
    }
  }
}
JSON
ls "$B/agent/.claude/skills"
echo "B ready: $B/agent/.mcp.json"
