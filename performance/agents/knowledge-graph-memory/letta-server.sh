#!/usr/bin/env bash
# Letta 0.16.8 (the last V1 server, retired upstream) for the benchmark's search-only baseline: archival passages,
# embedded with OpenAI text-embedding-3-small, no language model. API on 127.0.0.1:18283, Postgres inside the image,
# data in the volume wcatbench-letta-pgdata. The key comes from the keyring entry openai/default through an env file
# of mode 600, removed once the container has started.
# Usage: letta-server.sh start | stop | status
set -euo pipefail

name=wcatbench-letta
image=letta/letta:0.16.8

case ${1:-status} in
  start)
    env_file=$(mktemp)
    chmod 600 "$env_file"
    trap 'rm -f "$env_file"' EXIT
    key=$(secret-tool lookup service openai account default)
    [ -n "$key" ] || { echo "no keyring entry openai/default" >&2; exit 1; }
    echo "OPENAI_API_KEY=$key" > "$env_file"
    unset key
    docker run -d --name "$name" -p 127.0.0.1:18283:8283 --env-file "$env_file" \
      -v wcatbench-letta-pgdata:/var/lib/postgresql/data "$image" > /dev/null
    echo "started $name ($image)"
    ;;
  stop) docker stop "$name" > /dev/null && echo "stopped $name (container and volume kept)" ;;
  status) docker ps -a --filter "name=^$name$" --format '{{.Names}} {{.Status}} {{.Image}}' ;;
  *) echo "usage: $0 start | stop | status" >&2; exit 2 ;;
esac
