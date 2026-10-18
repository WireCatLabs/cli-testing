// Self time of a --cpu-prof profile, by package or cli-core folder. Usage: node profile-by-package.mjs <profile dir>
import { readdirSync, readFileSync } from "node:fs"

const print = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)
const dir = process.argv[2]
const f = readdirSync(dir).find((x) => x.endsWith(".cpuprofile"))
const p = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))
const dt = {}
for (let i = 0; i < p.samples.length; i++) dt[p.samples[i]] = (dt[p.samples[i]] ?? 0) + (p.timeDeltas[i] ?? 0)
const byKey = {}
let total = 0
for (const n of p.nodes) {
  const t = (dt[n.id] ?? 0) / 1000
  total += t
  let u = n.callFrame.url || `(${n.callFrame.functionName || "native"})`
  u = u
    .replace(/.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+).*/, "pkg:$1")
    .replace(/.*\/dist\/([^/]+)\/.*/, "core:$1")
    .replace(/.*\/dist\/([^/]+)$/, "core:$1")
  byKey[u] = (byKey[u] ?? 0) + t
}
print("total ms", total.toFixed(0))
for (const [k, v] of Object.entries(byKey)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 400))
  print(v.toFixed(1).padStart(8), k)
