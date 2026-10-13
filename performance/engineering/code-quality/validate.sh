#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo 'usage: validate.sh BASE_WORKTREE MESSAGING_WORKTREE MAX_WORKTREE TG_WORKTREE' >&2
  exit 2
fi

base_checkout=$(realpath "$1")
messaging_checkout=$(realpath "$2")
max_checkout=$(realpath "$3")
tg_checkout=$(realpath "$4")
export pnpm_config_verify_deps_before_run=false

run() {
  local checkout=$1
  shift
  printf '\n%s: ' "$checkout"
  printf '%q ' "$@"
  printf '\n'
  local status=0
  (cd "$checkout" && "$@") || status=$?
  printf 'exit: %s\n' "$status"
  return "$status"
}

for checkout in "$base_checkout" "$messaging_checkout" "$max_checkout" "$tg_checkout"; do
  run "$checkout" git rev-parse HEAD
  run "$checkout" node --version
  run "$checkout" node_modules/.bin/tsc --build --force
  run "$checkout" node_modules/.bin/tsc --project tsconfig.test.json --noEmit
done

run "$messaging_checkout" node scripts/bundle-drizzle.ts
run "$messaging_checkout" node scripts/copy-snowball.ts
run "$messaging_checkout" node scripts/copy-chart-fonts.ts

for checkout in "$base_checkout" "$messaging_checkout" "$max_checkout"; do
  run "$checkout" node_modules/.bin/vitest run
done

run "$max_checkout" node scripts/smoke.ts
run "$max_checkout" bun scripts/smoke.ts
run "$tg_checkout" node_modules/.bin/vitest run src/telegram/upload.test.ts src/telegram/map.test.ts src/telegram/adapter.test.ts
