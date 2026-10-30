#!/usr/bin/env bash
# Usage: setup.sh <gcal-cli checkout> <work dir>
# Builds the variants this page compares, under <work dir>:
#   pub/      gcal 0.1.1, drive 0.46.0, memo 0.123.0 and tg 0.107.0 installed from npm
#   stock/    gcal at v0.1.1, built as released (tsc only)
#   bundled/  the same source with esbuild 0.28.2 and `cli-dev bundle`; dist/bin/gcal.js is the bundle loader, and
#             dist/bin/gcal-tsc.js the tsc entry, which loads cli-core from node_modules with the statement cache
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
GCAL=$1; WORK=$(mkdir -p "$2" && cd "$2" && pwd)
mkdir -p "$WORK/pub"
(cd "$WORK/pub" && echo '{"private":true}' > package.json &&
  npm install --no-audit --no-fund --ignore-scripts @wirecat/gcal-cli@0.1.1 @wirecat/drive-cli@0.46.0 \
    @wirecat/cli-memo@0.123.0 @wirecat/tg-cli@0.107.0 > /dev/null)
for variant in stock bundled; do
  git -C "$GCAL" worktree add -q --detach "$WORK/$variant" v0.1.1
  (cd "$WORK/$variant" && pnpm install --frozen-lockfile > /dev/null)
done
(cd "$WORK/stock" && pnpm build > /dev/null)
(cd "$WORK/bundled" && pnpm add -D esbuild@0.28.2 > /dev/null && pnpm build > /dev/null &&
  cp dist/bin/gcal.js dist/bin/gcal-tsc.js && npx cli-dev bundle --bin dist/bin/gcal.js)
# After the bundle: the bundle keeps cli-core's stock driver, gcal-tsc.js gets the patched one.
node "$here/statement-cache.mjs" "$WORK/bundled"
