#!/bin/sh
# Build the cli-core worktree and copy its dist into tg's installed copy (rename, never in place: pnpm hardlinks).
set -e
cd /home/leemour/Projects/AI/cli-core-wt-search-perchat
pnpm build >/dev/null 2>&1 || { echo build failed; exit 1; }
DEST=$(readlink -f /home/leemour/Projects/AI/tg-cli-wt-search-perchat/node_modules/@wirecat/cli-core)
rsync -a --delete dist/ "$DEST/dist/"
echo synced
