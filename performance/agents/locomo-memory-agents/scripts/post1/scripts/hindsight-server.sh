#!/usr/bin/env bash
# Hindsight 1.2.3 for the smoke: container wcat-p1-hindsight, volume wcat-p1-hindsight-data, API 127.0.0.1:18888.
# Extraction: OpenAI gpt-4o-mini, key from OPENAI_API_KEY via a mode-600 env file removed after start.
set -euo pipefail
name=wcat-p1-hindsight
image=ghcr.io/vectorize-io/hindsight:1.2.3
case ${1:-status} in
  start)
    env_file=$(mktemp -p /var/tmp/locomo-bench); chmod 600 "$env_file"; trap 'rm -f "$env_file"' EXIT
    [ -n "${OPENAI_API_KEY:-}" ] || { echo "no OPENAI_API_KEY" >&2; exit 1; }
    { echo "HINDSIGHT_API_LLM_PROVIDER=openai"; echo "HINDSIGHT_API_LLM_MODEL=gpt-4o-mini"
      echo "HINDSIGHT_API_LLM_API_KEY=$OPENAI_API_KEY"; echo "HINDSIGHT_API_RETAIN_MAX_COMPLETION_TOKENS=16000"; } > "$env_file"
    docker run -d --name "$name" --shm-size=1g --stop-timeout 75 -p 127.0.0.1:18888:8888 -p 127.0.0.1:19999:9999 \
      --env-file "$env_file" -v wcat-p1-hindsight-data:/home/hindsight/.pg0 "$image" > /dev/null
    echo "started $name" ;;
  stop) docker stop "$name" > /dev/null && echo stopped ;;
  status) docker ps -a --filter "name=^$name$" --format '{{.Names}} {{.Status}}' ;;
esac
