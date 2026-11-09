#!/usr/bin/env bash
# Build one cli-core commit (default: the bench worktree HEAD) in the clean build worktree, pack it under its commit, and build memo against that tarball.
set -euo pipefail
CORE=/home/leemour/Projects/AI/cli-core-wt-gemma-build
REF=${1:-$(git -C /home/leemour/Projects/AI/cli-core-wt-gemma-bench rev-parse HEAD)}
MEMO=/home/leemour/Projects/AI/cli-memo-wt-gemma-bench
PACKS=/home/leemour/.cache/wirecat-bench/memo-src-vecstudy/packs
mkdir -p $PACKS
git -C $CORE checkout -q --detach "$REF"
sha=$(git -C $CORE rev-parse --short HEAD)
tgz=$PACKS/cli-core-$sha.tgz
if [ ! -f $tgz ]; then
  (cd $CORE && pnpm build >/dev/null && pnpm pack --pack-destination $PACKS >/dev/null && mv $PACKS/wirecat-cli-core-*.tgz $tgz)
fi
cd $MEMO
node -e '
const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json"));p.dependencies["@wirecat/cli-core"]="file:"+process.argv[1];fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")' $tgz
pnpm install --no-frozen-lockfile >/dev/null 2>&1
pnpm build >/dev/null
chmod +x dist/bin/memo.js
echo "built memo $(node dist/bin/memo.js --version) on cli-core $sha"
