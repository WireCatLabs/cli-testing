// node --import graph.mjs -e "await import('X')": at exit, the modules each one alone holds in (what goes if its import edges were lazy)
import { registerHooks } from "node:module"

const edges = new Map()
registerHooks({
  resolve(spec, ctx, next) {
    const r = next(spec, ctx)
    const p = ctx.parentURL ?? "root"
    if (!edges.has(p)) edges.set(p, new Set())
    edges.get(p).add(r.url)
    return r
  },
})
const short = (u) =>
  u.replace(/^file:\/\/.*?\/(node_modules\/\.pnpm\/[^/]+\/node_modules\/|node_modules\/|dist\/)/, "$1")
process.on("exit", () => {
  const roots = [...edges.keys()].filter((k) => k.includes("[eval") || k === "root")
  const reach = (skip) => {
    const seen = new Set()
    const stack = [...roots]
    while (stack.length) {
      const u = stack.pop()
      if (u === skip || seen.has(u)) continue
      seen.add(u)
      for (const v of edges.get(u) ?? []) stack.push(v)
    }
    return seen
  }
  const all = reach(null)
  const own = [...all].filter((u) => (process.env.ONLY ? u.includes(process.env.ONLY) : true) && !u.startsWith("node:"))
  const rows = own
    .map((u) => [all.size - reach(u).size, short(u)])
    .sort((a, b) => b[0] - a[0])
    .slice(0, Number(process.env.TOP ?? 30))
  process.stderr.write(`total ${all.size}\n`)
  for (const [n, u] of rows) process.stderr.write(`${String(n).padStart(5)} ${u}\n`)
})
