#!/usr/bin/env bash
# usage: variant.sh <tool worktree> <out dir> [stub]
# Copies a tool's dist and its cli-core and cli-base (real files, never hardlinks into the pnpm store) to <out dir>,
# with every other dependency symlinked. With "stub", the third-party packages cli-core and cli-base import at the
# top of a module but use only inside functions are not imported, to measure what loading them costs a start.
set -euo pipefail
tool=$1; out=$2; mode=${3:-}
core=$(readlink -f "$tool/node_modules/@wirecat/cli-core"); base=$(readlink -f "$tool/node_modules/@wirecat/cli-base")
rm -rf "$out"; mkdir -p "$out/tool/node_modules/@wirecat" "$out/node_modules/@wirecat"
cp -r "$tool/dist" "$tool/package.json" "$out/tool/"
for d in "$tool"/node_modules/* "$tool"/node_modules/.bin; do [ "$(basename "$d")" = "@wirecat" ] || ln -s "$(readlink -f "$d")" "$out/tool/node_modules/$(basename "$d")"; done
for d in "$tool"/node_modules/@wirecat/*; do n=$(basename "$d"); [ "$n" = cli-core ] || [ "$n" = cli-base ] || ln -s "$(readlink -f "$d")" "$out/tool/node_modules/@wirecat/$n"; done
for d in "$(dirname "$core")"/../*; do [ "$(basename "$d")" = "@wirecat" ] || ln -s "$(readlink -f "$d")" "$out/node_modules/$(basename "$d")"; done
for d in "$(dirname "$base")"/../*; do [ -e "$out/node_modules/$(basename "$d")" ] || [ "$(basename "$d")" = "@wirecat" ] || ln -s "$(readlink -f "$d")" "$out/node_modules/$(basename "$d")"; done
mkdir -p "$out/node_modules/@wirecat/cli-core" "$out/node_modules/@wirecat/cli-base"
cp -r "$core/dist" "$core/package.json" "$out/node_modules/@wirecat/cli-core/"
cp -r "$base/dist" "$base/package.json" "$out/node_modules/@wirecat/cli-base/"
for d in "$(dirname "$core")"/*; do n=$(basename "$d"); [ "$n" = cli-core ] || [ "$n" = cli-base ] || ln -s "$(readlink -f "$d")" "$out/node_modules/@wirecat/$n"; done
ln -s "$out/node_modules/@wirecat/cli-core" "$out/tool/node_modules/@wirecat/cli-core"
ln -s "$out/node_modules/@wirecat/cli-base" "$out/tool/node_modules/@wirecat/cli-base"
if [ "$mode" = stub ]; then
  c="$out/node_modules/@wirecat/cli-core/dist"
  sed -i 's#^import psl from "psl";#let psl;#' "$c/domain/mentions.js"
  sed -i 's#^import { DOMParser } from "@xmldom/xmldom";#let DOMParser;#; s#^import { Unzip, UnzipInflate } from "fflate";#let Unzip, UnzipInflate;#' "$c/attachments/container.js"
  sed -i 's#^import { gunzipSync } from "fflate";#let gunzipSync;#' "$c/embeddings/onnx-runtime.js"
  sed -i 's#^import { Context, Liquid, Tag, } from "liquidjs";#let Context, Liquid, Tag;#' "$c/replies/template.js"
  sed -i 's#^import { analyse } from "chardet";#let analyse;#; s#^import iconv from "iconv-lite";#let iconv;#' "$c/attachments/encoding.js"
  for f in attachments/ocr.js attachments/pdf-preview.js mcp/tools/attachments.js; do sed -i 's#^import { imageSize } from "image-size";#let imageSize;#' "$c/$f"; done
  sed -i 's#^import Table from "cli-table3";#let Table;#' "$out/node_modules/@wirecat/cli-base/dist/pretty.js"
fi
