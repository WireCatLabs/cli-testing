# Sourced by the scripts here. Every folder of the run lives under RUN, outside git; nothing reaches the owner's own
# WireCat store, settings or keyring.
RUN=${HUBSPOT_AGENTS_RUN:-$HOME/.cache/wirecat-hubspot-agents}
KEYRING_SERVICE=hubspot-cli-live
KEYRING_ACCOUNT=${HUBSPOT_AGENTS_KEYRING_ACCOUNT:-wirecat}
HUBSPOT_VERSION=${HUBSPOT_VERSION:-0.5.0}
HUBSPOT_BIN="$RUN/a/npm/node_modules/.bin/hubspot"
PROFILE=test

# The CLI runs with the keyring out of reach. Only the CLI: secret-tool, gh and git need the session bus.
wirecat_env() {
  env WCHUBSPOT_CONFIG_DIR="$RUN/a/config" WCHUBSPOT_STATE_DIR="$RUN/a/state" WCHUBSPOT_CACHE_DIR="$RUN/a/cache" \
    MESSAGING_STORE="$RUN/a/wirecat.db" DBUS_SESSION_BUS_ADDRESS="disabled:" WCHUBSPOT_PROFILE= "$@"
}

# The test account's key, read in this process and piped to the command that needs it, never printed.
with_key_on_stdin() {
  secret-tool lookup service "$KEYRING_SERVICE" account "$KEYRING_ACCOUNT" 2>/dev/null | "$@"
}
