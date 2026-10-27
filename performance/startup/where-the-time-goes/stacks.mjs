// usage: node stacks.mjs <file.cpuprofile> <function name regex> [depth]: total self+children time under matching frames, with their callers.
import { readFileSync } from "node:fs"

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const [file, pattern, depthArg] = process.argv.slice(2)
const depth = Number(depthArg ?? 8)
const profile = JSON.parse(readFileSync(file, "utf8"))
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const parent = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const self = new Map()
for (const [i, id] of profile.samples.entries())
  self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000)
const total = (id) => (self.get(id) ?? 0) + (byId.get(id).children ?? []).reduce((s, c) => s + total(c), 0)
const re = new RegExp(pattern)
const label = (n) =>
  `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.replace(/.*node_modules\//, "").replace(/^file:\/\/.*\/dist\//, "tool/dist/")}:${n.callFrame.lineNumber + 1}`
const rows = new Map()
for (const n of profile.nodes) {
  if (!re.test(n.callFrame.functionName)) continue
  // skip frames nested under another match, so time is not counted twice
  let p = parent.get(n.id),
    nested = false
  while (p !== undefined) {
    if (re.test(byId.get(p).callFrame.functionName)) {
      nested = true
      break
    }
    p = parent.get(p)
  }
  if (nested) continue
  const chain = []
  p = parent.get(n.id)
  while (p !== undefined && chain.length < depth) {
    chain.push(label(byId.get(p)))
    p = parent.get(p)
  }
  const key = `${label(n)}\n    <- ${chain.join("\n    <- ")}`
  rows.set(key, (rows.get(key) ?? 0) + total(n.id))
}
for (const [k, ms] of [...rows].sort((a, b) => b[1] - a[1]).slice(0, 6)) log(`${ms.toFixed(1)} ms  ${k}\n`)
