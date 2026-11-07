#!/usr/bin/env bash
# Cognee 1.6.7 for the benchmark: one container with its embedded stores (SQLite, LanceDB, Kuzu), single-user with
# access control off, API on 127.0.0.1:18100. Every language model call goes to OpenAI gpt-4o-mini and embeddings to
# text-embedding-3-small, like the other engines. The key comes from the keyring entry openai/default through an env
# file of mode 600, removed once the container has started.
# Usage: cognee-server.sh start | stop | status
set -euo pipefail

name=wcatbench-cognee
image=cognee/cognee:1.6.7

case ${1:-status} in
  start)
    env_file=$(mktemp)
    chmod 600 "$env_file"
    trap 'rm -f "$env_file"' EXIT
    key=$(secret-tool lookup service openai account default)
    [ -n "$key" ] || { echo "no keyring entry openai/default" >&2; exit 1; }
    {
      echo "LLM_API_KEY=$key"
      echo "EMBEDDING_API_KEY=$key"
      echo "LLM_PROVIDER=openai"
      echo "LLM_MODEL=openai/gpt-4o-mini"
      echo "EMBEDDING_PROVIDER=openai"
      echo "EMBEDDING_MODEL=openai/text-embedding-3-small"
      echo "EMBEDDING_DIMENSIONS=1536"
      echo "ENABLE_BACKEND_ACCESS_CONTROL=false"
      echo "SYSTEM_ROOT_DIRECTORY=/cognee-storage/system"
      echo "DATA_ROOT_DIRECTORY=/cognee-storage/data"
      echo "TELEMETRY_DISABLED=1"
      # With the graph engine in its own worker process, a 10K cognify left the graph file unreadable ("not a valid
      # Lbug database file", "Subprocess session is closed") twice on 7 November 2026; in-process it is one writer.
      echo "GRAPH_DATABASE_SUBPROCESS_ENABLED=false"
    } > "$env_file"
    unset key
    docker run -d --name "$name" -p 127.0.0.1:18100:8000 --env-file "$env_file" \
      -v ${COGNEE_VOLUME:-wcatbench-cognee}-system:/cognee-storage/system -v ${COGNEE_VOLUME:-wcatbench-cognee}-data:/cognee-storage/data \
      "$image" > /dev/null
    echo "started $name ($image)"
    ;;
  stop) docker stop "$name" > /dev/null && echo "stopped $name (container and volumes kept)" ;;
  status) docker ps -a --filter "name=^$name$" --format '{{.Names}} {{.Status}} {{.Image}}' ;;
  *) echo "usage: $0 start | stop | status" >&2; exit 2 ;;
esac
