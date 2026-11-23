# Sourced by the scripts here. Every folder of the run lives under RUN, outside git; nothing reaches the owner's own
# WireCat store, settings or keyring entries.
RUN=${ATTIO_AGENTS_RUN:-$HOME/.cache/wirecat-attio-agents}
ATTIO_VERSION=${ATTIO_VERSION:-0.3.0}
KESSLERIO_VERSION=${KESSLERIO_VERSION:-1.7.0}
ATTIO_BIN="$RUN/a/npm/node_modules/.bin/attio"
PROFILE=test
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# The CLI runs with the keyring out of reach and every write off. Only the CLI: secret-tool, gh and git need the
# session bus.
wirecat_env() {
  env WCATTIO_CONFIG_DIR="$RUN/a/config" WCATTIO_STATE_DIR="$RUN/a/state" WCATTIO_CACHE_DIR="$RUN/a/cache" \
    MESSAGING_STORE="$RUN/a/wirecat.db" DBUS_SESSION_BUS_ADDRESS="disabled:" WCATTIO_READ_ONLY=1 \
    WCATTIO_NO_UPDATE_CHECK=1 WCATTIO_PROFILE= "$@"
}
