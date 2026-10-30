// Usage: node prof-top.mjs <file.cpuprofile> [n]: self time by function and the inclusive time of named functions.
import { readFileSync } from "node:fs"

const prof = JSON.parse(readFileSync(process.argv[2], "utf8"))
const n = Number(process.argv[3] ?? 25)
const byId = new Map(prof.nodes.map((node) => [node.id, node]))
const dt = new Map()
for (let i = 0; i < prof.samples.length; i++)
  dt.set(prof.samples[i], (dt.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0))
const total = [...dt.values()].reduce((a, b) => a + b, 0)
const key = (node) => {
  const f = node.callFrame
  const file = f.url.replace(/.*node_modules\//, "").replace(/.*\/(dist|src)\//, "$1/")
  return `${f.functionName || "(anon)"} ${file}:${f.lineNumber + 1}`
}
const self = new Map()
for (const node of prof.nodes) self.set(key(node), (self.get(key(node)) ?? 0) + (dt.get(node.id) ?? 0))
process.stdout.write(`${`total ${(total / 1000).toFixed(0)} ms`}\n`)
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, n))
  process.stdout.write(`${`${(v / 1000).toFixed(0).padStart(7)} ms self  ${k}`}\n`)
// Inclusive time per function key (each sample counted once per key on its stack).
const parent = new Map()
for (const node of prof.nodes) for (const c of node.children ?? []) parent.set(c, node.id)
const incl = new Map()
for (const [id, t] of dt) {
  const keys = new Set()
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) keys.add(key(byId.get(cur)))
  for (const k of keys) incl.set(k, (incl.get(k) ?? 0) + t)
}
process.stdout.write(`${"--- inclusive"}\n`)
for (const [k, v] of [...incl]
  .sort((a, b) => b[1] - a[1])
  .filter(([k]) => !/^\(|^(anon)|processTicks|runMicrotasks/.test(k))
  .slice(0, n * 2))
  process.stdout.write(`${`${(v / 1000).toFixed(0).padStart(7)} ms incl  ${k}`}\n`)
