#!/usr/bin/env bash
# Hindsight 1.2.0 for the benchmark: one container, its own volume, API on 127.0.0.1:18888, UI on 127.0.0.1:19999.
# Fact extraction uses OpenAI with the key in the keyring entry openai/default; the key goes through an env file of
# mode 600 that is removed once the container has started. `docker inspect` still shows it inside the container.
# Usage: hindsight-server.sh start | stop | status
set -euo pipefail

name=wcatbench-hindsight
image=ghcr.io/vectorize-io/hindsight:1.2.0
model=${HINDSIGHT_MODEL:-gpt-4o-mini}

case ${1:-status} in
  start)
    env_file=$(mktemp)
    chmod 600 "$env_file"
    trap 'rm -f "$env_file"' EXIT
    key=$(secret-tool lookup service openai account default)
    [ -n "$key" ] || { echo "no keyring entry openai/default" >&2; exit 1; }
    {
      echo "HINDSIGHT_API_LLM_PROVIDER=openai"
      echo "HINDSIGHT_API_LLM_MODEL=$model"
      echo "HINDSIGHT_API_LLM_API_KEY=$key"
      # gpt-4o-mini writes at most 16,384 tokens; the default 64,000 is refused at startup.
      echo "HINDSIGHT_API_RETAIN_MAX_COMPLETION_TOKENS=16000"
    } > "$env_file"
    unset key
    docker run -d --name "$name" --shm-size=1g --stop-timeout 75 \
      -p 127.0.0.1:18888:8888 -p 127.0.0.1:19999:9999 \
      --env-file "$env_file" \
      -v wcatbench-hindsight-data:/home/hindsight/.pg0 \
      "$image" > /dev/null
    echo "started $name ($image, $model)"
    ;;
  stop) docker stop "$name" > /dev/null && echo "stopped $name (container and volume kept)" ;;
  status) docker ps -a --filter "name=^$name$" --format '{{.Names}} {{.Status}} {{.Image}}' ;;
  *) echo "usage: $0 start | stop | status" >&2; exit 2 ;;
esac
