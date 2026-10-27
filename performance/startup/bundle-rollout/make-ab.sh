#!/usr/bin/env bash
# usage: make-ab.sh <worktree> <out dir> <cli-dev bin> <cli-dev bundle args...>
# A: tsc + cli-dev bundle, packed. B: the same at the next patch version, every chunk renamed, packed.
set -eu
wt=$1 out=$2 clidev=$3; shift 3
bundlejs=$(dirname "$clidev")/bundle.js
mkdir -p "$out"
cd "$wt"
[ "$(git rev-parse --show-toplevel)" = "$wt" ] || { echo "not in $wt"; exit 1; }
cp package.json "$out/package.json.orig"
npx tsc --build --force && node "$clidev" bundle "$@"
cp "$(npm pack --ignore-scripts --pack-destination "$out" 2>/dev/null | tail -1 | sed "s#^#$out/#")" "$out/A.tgz" 2>/dev/null || true
ls "$out"/*.tgz
v=$(node -p 'require("./package.json").version'); b=$(node -p '"'$v'".replace(/\d+$/, (n) => Number(n) + 1)')
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json"));p.version=process.argv[1];fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")' "$b"
cp "$bundlejs" "$out/bundle.js.orig"
sed -i 's/chunkNames: "\[name\]-\[hash\]"/chunkNames: "[name]-b-[hash]"/' "$bundlejs"
grep -q '\[name\]-b-\[hash\]' "$bundlejs"
npx tsc --build --force && node "$clidev" bundle "$@" || true
cp "$out/bundle.js.orig" "$bundlejs"
f=$(npm pack --ignore-scripts --pack-destination "$out" 2>/dev/null | tail -1)
mv "$out/$f" "$out/B.tgz"
cp "$out/package.json.orig" package.json
for t in A B; do echo "$t: $(tar tzf "$out/$t.tgz" | grep -c 'dist/bundle/') bundle files, version $(tar xzf "$out/$t.tgz" -O package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0)).version')"; done
