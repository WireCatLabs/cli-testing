#!/usr/bin/env bash
# compare.sh <dirA> <dirB> — byte-compares outputs after normalising iso paths, run ids, timestamps and durations.
a=$1; b=$2
norm() { sed -E -e "s#$(cat $1/iso)#ISO#g" -e 's#/[^"]*/iso-[A-Za-z0-9]{4}#ISO#g' \
  -e 's/[0-9]{8}T[0-9]{6}Z-[a-z-]+-[0-9a-f]{6}/RUNID/g' -e 's/20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/TIME/g' \
  -e 's/"(duration_ms|elapsed_ms|took_ms|ms)":[0-9]+/"\1":N/g' -e 's/[0-9]+ ?ms\b/N ms/g' -e 's/\.pnpm\/[^/]+\//.pnpm\/X\//g' \
  -e 's#/[^"]*/node_modules/(@wirecat/)?[^/"]+/#PKG/#g' -e 's#/[^"]*/(npm|pnpm)-[A-Za-z0-9]{4}/[^"]*#INSTALL#g' -e 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/UUID/g' -e 's/pid[":= ]+[0-9]+/pid N/g' "$2"; }
n=0; d=0
for dir in "$a" "$b"; do
  [ -s "$dir/mcp.json" ] || { echo "REFUSED: $dir/mcp.json is empty — the MCP session did not run"; exit 1; }
  grep -lq '"commands"\|"cli"' "$dir"/*.out || { echo "REFUSED: no commands --json output in $dir"; exit 1; }
done
for f in "$a"/*.out "$a"/*.err "$a"/*.json; do
  [ -e "$f" ] || continue
  base=$(basename "$f"); n=$((n+1))
  if ! cmp -s <(norm $a "$f") <(norm $b "$b/$base"); then d=$((d+1)); echo "DIFF $base: $(cat $a/${base%.*}.cmd 2>/dev/null)"; diff <(norm $a "$f" | tr ',' '\n') <(norm $b "$b/$base" | tr ',' '\n') | head -${LINES_SHOWN:-6}; fi
done
echo "compared $n files, $d differ"
