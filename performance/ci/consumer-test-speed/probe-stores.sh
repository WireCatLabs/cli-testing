#!/usr/bin/env bash
# Counts the stores a consumer's test suite opens, and times their migration.
#   probe-stores.sh <consumer checkout> <output file>
# Replaces cli-core's dist/store/sqlite/open-store.js in the checkout's node_modules with a copy that appends
# "fresh|reopen <migrate ms> <open ms>" per writable open to $PROBE_LOG, runs the suite once, then puts the original back.
# The file is replaced, not edited, so pnpm's shared content store (hard links) is untouched.
set -euo pipefail
repo=$(cd "$1" && pwd) out=$2
file=$(readlink -f "$repo/node_modules/@wirecat/cli-core")/dist/store/sqlite/open-store.js
cp "$file" "$file.orig"
restore() { rm -f "$file"; mv "$file.orig" "$file"; }
trap restore EXIT
rm -f "$file"
node - "$file.orig" "$file" <<'JS'
const fs = require("node:fs")
const [src, dst] = process.argv.slice(2)
let s = fs.readFileSync(src, "utf8")
s = s.replace('import { mkdirSync, statSync, writeFileSync } from "node:fs";',
  'import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";')
s = s.replace("export const openStoreContext = async ({", "const openStoreContextReal = async ({")
s = s.replace("migrate(database, { now, command });",
  "{ const t = performance.now(); migrate(database, { now, command }); globalThis.__probeMigrate = performance.now() - t; }")
s += `
export const openStoreContext = async (options = {}) => {
  if (options.readOnly) return openStoreContextReal(options)
  const file = options.path ?? storePath(options.env)
  const fresh = !statSync(file, { throwIfNoEntry: false })?.size
  const t = performance.now()
  const result = await openStoreContextReal(options)
  appendFileSync(process.env.PROBE_LOG, \`\${fresh ? "fresh" : "reopen"} \${globalThis.__probeMigrate.toFixed(2)} \${(performance.now() - t).toFixed(2)}\\n\`)
  return result
}
`
fs.writeFileSync(dst, s)
JS
: > "$out"
cd "$repo"
PROBE_LOG="$out" pnpm exec vitest run > "$out.vitest.log" 2>&1 || true
grep -E "Test Files|Tests " "$out.vitest.log" | sed 's/\x1b\[[0-9;]*m//g'
awk '{n[$1]++; m[$1]+=$2; o[$1]+=$3} END {for (k in n) printf "%s: %d opens, migrate %.1f ms avg (%.1f s total), open %.1f ms avg (%.1f s total)\n", k, n[k], m[k]/n[k], m[k]/1000, o[k]/n[k], o[k]/1000}' "$out"
