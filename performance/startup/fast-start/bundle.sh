#!/usr/bin/env bash
# bundle.sh <tool worktree> <bin name> <out dir> [esbuild]: one-file ESM bundle of a built tool's program, beside its dist
# so relative assets resolve. Native and runtime-specific modules stay external.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tool=$1; bin=$2; out=$3; esbuild=${4:-esbuild}
rm -rf "$out"; mkdir -p "$out"
cp -r "$tool/dist" "$tool/package.json" "$out/"
ln -s "$tool/node_modules" "$out/node_modules"
[ -d "$tool/skills" ] && ln -s "$tool/skills" "$out/skills" || true
"$esbuild" "$out/dist/bin/$bin.js" --bundle --platform=node --format=esm --target=node22 \
  --outfile="$out/dist/bin/$bin.bundle.mjs" --log-level=warning \
  --alias:bun:sqlite="$here/stubs/bun-sqlite.mjs" --external:@napi-rs/* --external:onnxruntime-node --external:sharp --external:@resvg/* --external:*.node --external:@huggingface/* --alias:better-sqlite3="$here/stubs/better-sqlite3.mjs" \
  --banner:js='import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);'
# The bundle's own enableCompileCache() runs too late for the bundle itself; this entry turns it on first.
printf 'import { enableCompileCache } from "node:module"\nenableCompileCache()\nawait import("./%s.bundle.mjs")\n' "$bin" \
  >"$out/dist/bin/$bin-cached.mjs"
echo "$out/dist/bin/$bin.bundle.mjs" "$out/dist/bin/$bin-cached.mjs"
