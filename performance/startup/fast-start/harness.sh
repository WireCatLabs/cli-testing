#!/usr/bin/env bash
# harness.sh <tool worktree> <bin name> <cli-core worktree> <out dir>
# A throwaway copy of a built tool whose installed cli-core gets the branch's entry.js and first-run.js and the
# ./cli/start export, and whose bin imports startCli from ./cli/start. node_modules is only linked to, never written.
set -eu
tool=$1; bin=$2; core=$3; out=$4
rm -rf "$out"; mkdir -p "$out/core/node_modules/@wirecat" "$out/tool/node_modules/@wirecat"
installed=$(readlink -f "$tool/node_modules/@wirecat/cli-core")
siblings=$(dirname "$(dirname "$installed")")
for e in "$siblings"/*; do n=$(basename "$e"); [ "$n" = "@wirecat" ] || ln -s "$(readlink -f "$e")" "$out/core/node_modules/$n"; done
for e in "$siblings"/@wirecat/*; do n=$(basename "$e"); [ "$n" = "cli-core" ] || ln -s "$(readlink -f "$e")" "$out/core/node_modules/@wirecat/$n"; done
cp -r "$installed" "$out/core/node_modules/@wirecat/cli-core"
copy="$out/core/node_modules/@wirecat/cli-core"
cp "$core/dist/cli/entry.js" "$copy/dist/cli/entry.js"
cp "$core/dist/cli/first-run.js" "$copy/dist/cli/first-run.js"
node -e '
const fs = require("fs"); const p = process.argv[1]; const j = JSON.parse(fs.readFileSync(p, "utf8"))
j.exports["./cli/start"] = { types: "./dist/cli/entry.d.ts", default: "./dist/cli/entry.js" }
fs.writeFileSync(p, JSON.stringify(j, null, 2))' "$copy/package.json"
for e in "$tool"/node_modules/*; do n=$(basename "$e"); [ "$n" = "@wirecat" ] || ln -s "$(readlink -f "$e")" "$out/tool/node_modules/$n"; done
for e in "$tool"/node_modules/@wirecat/*; do n=$(basename "$e"); [ "$n" = "cli-core" ] || ln -s "$(readlink -f "$e")" "$out/tool/node_modules/@wirecat/$n"; done
ln -s "$copy" "$out/tool/node_modules/@wirecat/cli-core"
cp -r "$tool/dist" "$tool/package.json" "$out/tool/"
[ -d "$tool/skills" ] && ln -s "$tool/skills" "$out/tool/skills" || true
sed -i 's#import("@wirecat/cli-core/cli")#import("@wirecat/cli-core/cli/start")#' "$out/tool/dist/bin/$bin.js"
echo "$out/tool/dist/bin/$bin.js"
