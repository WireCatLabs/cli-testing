#!/usr/bin/env bash
# Honcho 3.5.0 for the benchmark: api, deriver, Postgres with pgvector and Redis, as compose project wcatbench-honcho.
# Only the API is published, on 127.0.0.1:18000; the database and Redis stay inside the project's network.
# Every language model call goes to OpenAI gpt-4o-mini (Honcho's own default is gpt-5.4-mini), so it matches
# Hindsight. The key comes from the keyring entry openai/default through an env file of mode 600, removed once
# the containers exist. `docker inspect` still shows it inside them.
# Usage: honcho-server.sh start | stop | status
set -euo pipefail

project=wcatbench-honcho
image=ghcr.io/plastic-labs/honcho:v3.5.0
model=${HONCHO_MODEL:-gpt-4o-mini}
dir=$HOME/.cache/wcatbench-honcho
mkdir -p "$dir"

cat > "$dir/init.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
SQL

cat > "$dir/compose.yml" <<YAML
name: $project
x-honcho: &honcho
  image: $image
  env_file: [{path: ./honcho.env, required: false}]
  environment:
    - DB_CONNECTION_URI=postgresql+psycopg://postgres:postgres@database:5432/postgres
    - CACHE_URL=redis://redis:6379/0?suppress=true
    - CACHE_ENABLED=true
services:
  api:
    <<: *honcho
    entrypoint: ["sh", "docker/entrypoint.sh"]
    depends_on: {database: {condition: service_healthy}, redis: {condition: service_healthy}}
    ports: ["127.0.0.1:18000:8000"]
    healthcheck:
      test: ["CMD", "/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2).read()"]
      interval: 5s
      retries: 10
      start_period: 20s
  deriver:
    <<: *honcho
    entrypoint: ["/app/.venv/bin/python", "-m", "src.deriver"]
    depends_on: {api: {condition: service_healthy}}
  database:
    image: pgvector/pgvector:pg15
    command: ["postgres", "-c", "max_connections=200"]
    environment: [POSTGRES_DB=postgres, POSTGRES_USER=postgres, POSTGRES_PASSWORD=postgres, PGDATA=/var/lib/postgresql/data/pgdata]
    volumes: ["./init.sql:/docker-entrypoint-initdb.d/init.sql:ro", "pgdata:/var/lib/postgresql/data/"]
    healthcheck: {test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"], interval: 5s, retries: 10}
  redis:
    image: redis:8.2
    healthcheck: {test: ["CMD-SHELL", "redis-cli ping"], interval: 5s, retries: 10}
volumes:
  pgdata: {name: wcatbench-honcho-pgdata}
YAML

case ${1:-status} in
  start)
    env_file=$dir/honcho.env
    trap 'rm -f "$env_file"' EXIT
    (umask 077; : > "$env_file")
    key=$(secret-tool lookup service openai account default)
    [ -n "$key" ] || { echo "no keyring entry openai/default" >&2; exit 1; }
    {
      echo "LLM_OPENAI_API_KEY=$key"
      echo "AUTH_USE_AUTH=false"
      for feature in DERIVER SUMMARY DREAM_DEDUCTION DREAM_INDUCTION; do
        echo "${feature}_MODEL_CONFIG__TRANSPORT=openai"
        echo "${feature}_MODEL_CONFIG__MODEL=$model"
      done
      for level in minimal low medium high max; do
        echo "DIALECTIC_LEVELS__${level}__MODEL_CONFIG__TRANSPORT=openai"
        echo "DIALECTIC_LEVELS__${level}__MODEL_CONFIG__MODEL=$model"
      done
      echo "DIALECTIC_LEVELS__max__MODEL_CONFIG__FALLBACK__TRANSPORT=openai"
      echo "DIALECTIC_LEVELS__max__MODEL_CONFIG__FALLBACK__MODEL=$model"
      # Without the flush a session's tail waits up to 30 minutes for more tokens before the deriver claims it.
      echo "DERIVER_FLUSH_ENABLED=true"
      # One work unit per session; the corpus has one session per record kind, four in all.
      echo "DERIVER_WORKERS=4"
    } > "$env_file"
    unset key
    docker compose -f "$dir/compose.yml" up -d --wait > /dev/null
    echo "started $project ($image, $model) on http://127.0.0.1:18000"
    ;;
  stop) docker compose -f "$dir/compose.yml" stop > /dev/null && echo "stopped $project (containers and volume kept)" ;;
  status) docker compose -f "$dir/compose.yml" ps --format '{{.Service}} {{.Status}}' ;;
  *) echo "usage: $0 start | stop | status" >&2; exit 2 ;;
esac
