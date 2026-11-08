#!/usr/bin/env bash
# Peak memory of tg-cli's Bot API suites with its HTTP unguarded, through cli-base's hostFetch as installed, and
# through a hostFetch built from another cli-base checkout.
# Usage: measure.sh <tg-cli checkout on feat/host-fetch> <cli-base checkout, built with tsc --build> [runs]
set -euo pipefail
tg=$(realpath "$1")
base=$(realpath "$2")
runs=${3:-2}
http="$tg/src/http.ts"
kept=$(mktemp)
cp "$http" "$kept"
trap 'cp "$kept" "$http"; rm -f "$kept"' EXIT

peak() {
  (cd "$tg" && DBUS_SESSION_BUS_ADDRESS=disabled: /usr/bin/time -v pnpm exec vitest run src/bot-api.test.ts \
    src/bot/transport.test.ts --maxWorkers=1 2>&1) | awk '/Maximum resident/ { printf "%.2f GB\n", $NF / 1048576 }'
}

measure() {
  for _ in $(seq "$runs"); do echo "$1: $(peak)"; done
}

cat > "$http" <<'TS'
import type { FetchLike } from "@wirecat/cli-base/http"

type Send = (url: string, init: RequestInit) => Promise<Response>

export const guardedFetch = (_hosts: readonly string[], send?: Send, _timeoutMs?: number): FetchLike => (input, init) =>
  send ? send(String(input), init ?? {}) : globalThis.fetch(input, init)
TS
measure "without hostFetch"

cp "$kept" "$http"
measure "hostFetch, installed cli-base"

sed -i "s#import { type FetchLike, hostFetch } from \"@wirecat/cli-base/http\"#import type { FetchLike } from \"@wirecat/cli-base/http\"\n// @ts-expect-error measured build\nimport { hostFetch } from \"$base/dist/http/fetch.js\"#" "$http"
measure "hostFetch, $(git -C "$base" rev-parse --short HEAD)"
