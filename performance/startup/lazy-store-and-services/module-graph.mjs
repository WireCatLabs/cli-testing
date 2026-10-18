// Static import graph of a built package, by regular expression over its `dist` (tsc output; dynamic import() is
// not an edge, `import type` is skipped). Usage: node module-graph.mjs <dist> <entry.js> <mode> [arg]
//   none | dirs                      modules the entry reaches, by top folder (DEPTH=2 for two levels)
//   direct | cut                     what each direct export, or each single module, adds on its own
//   path <substring>                 the shortest import chain from the entry to a module
//   edges <folder/>                  who imports into a folder from outside it (V=1 lists them)
//   whatif <regex>                   modules reached if nothing imported the modules the regex matches
//   floor | targets | dropped <re>   ...if cli/ and mcp/ modules imported nothing under the folders matched
// It approximates; count-modules.mjs on a real run is the number to trust.
import { existsSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

const print = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)
const root = resolve(process.argv[2])
const entry = resolve(root, process.argv[3] ?? "cli/index.js")
const cache = new Map()
function deps(file) {
  if (cache.has(file)) return cache.get(file)
  const src = readFileSync(file, "utf8")
  const out = []
  const re =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g
  for (const m of src.matchAll(re)) {
    const spec = m[2] ?? m[3]
    if (m[1] && /^type\s/.test(m[1])) continue
    if (spec.startsWith(".")) {
      const p = resolve(dirname(file), spec)
      if (existsSync(p)) out.push(p)
    } else out.push(`pkg:${spec}`)
  }
  cache.set(file, out)
  return out
}
function closure(start, skip = new Set()) {
  const seen = new Set()
  const stack = [start]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f) || skip.has(f)) continue
    seen.add(f)
    if (!f.startsWith("pkg:")) stack.push(...deps(f))
  }
  return seen
}
const all = closure(entry)
const internal = [...all].filter((f) => !f.startsWith("pkg:"))
print("internal modules reached:", internal.length)
const mode = process.argv[4] ?? "direct"
if (mode === "direct") {
  // marginal: modules only reachable through this direct dep
  const direct = deps(entry).filter((d) => !d.startsWith("pkg:"))
  const rows = []
  for (const d of direct) {
    const without = closure(entry, new Set([d]))
    const own = closure(d)
    rows.push([relative(root, d), own.size, all.size - without.size])
  }
  rows.sort((a, b) => b[2] - a[2])
  for (const r of rows.slice(0, 40)) print(String(r[2]).padStart(5), String(r[1]).padStart(5), r[0])
}
if (mode === "dirs") {
  const by = {}
  for (const f of internal) {
    const k = relative(root, f)
      .split("/")
      .slice(0, process.env.DEPTH ? +process.env.DEPTH : 1)
      .join("/")
    by[k] = (by[k] ?? 0) + 1
  }
  for (const [k, v] of Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50))
    print(String(v).padStart(5), k)
}
if (mode === "path") {
  // BFS shortest path to a target substring
  const target = process.argv[5]
  const prev = new Map([[entry, null]])
  const q = [entry]
  while (q.length) {
    const f = q.shift()
    if (f.includes(target)) {
      const p = []
      let c = f
      while (c) {
        p.unshift(relative(root, c))
        c = prev.get(c)
      }
      print(p.join("\n  -> "))
      break
    }
    if (f.startsWith("pkg:")) continue
    for (const d of deps(f))
      if (!prev.has(d)) {
        prev.set(d, f)
        q.push(d)
      }
  }
}
if (mode === "cut") {
  const rows = []
  for (const f of internal) {
    if (f === entry) continue
    const without = closure(entry, new Set([f]))
    rows.push([all.size - without.size, closure(f).size, relative(root, f)])
  }
  rows.sort((a, b) => b[0] - a[0])
  for (const r of rows.slice(0, 40)) print(String(r[0]).padStart(5), String(r[1]).padStart(5), r[2])
}
if (mode === "edges") {
  const pre = process.argv[5]
  const inX = (f) => relative(root, f).startsWith(pre)
  const rows = {}
  for (const f of internal) {
    if (inX(f)) continue
    for (const d of deps(f))
      if (!d.startsWith("pkg:") && inX(d)) {
        const key = relative(root, d)
        rows[key] = [...(rows[key] ?? []), relative(root, f)]
      }
  }
  for (const [k, v] of Object.entries(rows).sort((a, b) => b[1].length - a[1].length))
    print(String(v.length).padStart(4), k, process.env.V ? "\n      " + v.join("\n      ") : "")
}
if (mode === "floor") {
  const heavy = new RegExp(`^(${process.argv[5]})`)
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    if (f.startsWith("pkg:")) continue
    const fromCli = /^(cli|mcp)\//.test(relative(root, f)) && (process.env.WITHENTRY || f !== entry)
    for (const d of deps(f))
      if (
        !(fromCli && !d.startsWith("pkg:") && heavy.test(relative(root, d))) &&
        !(process.env.GCUT && new RegExp(`^(${process.env.GCUT})$`).test(relative(root, d)))
      )
        stack.push(d)
  }
  const inn = [...seen].filter((f) => !f.startsWith("pkg:"))
  print("floor", inn.length)
  const by = {}
  for (const f of inn) {
    const k = relative(root, f)
      .split("/")
      .slice(0, +(process.env.DEPTH ?? 1))
      .join("/")
    by[k] = (by[k] ?? 0) + 1
  }
  for (const [k, v] of Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25))
    print(String(v).padStart(5), k)
}
if (mode === "whatif") {
  const cut = new RegExp(`^(${process.argv[5]})$`)
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    if (f.startsWith("pkg:")) continue
    for (const d of deps(f)) if (d.startsWith("pkg:") || !cut.test(relative(root, d))) stack.push(d)
  }
  const inn = [...seen].filter((f) => !f.startsWith("pkg:"))
  print("whatif", inn.length)
  const by = {}
  for (const f of inn) {
    const k = relative(root, f)
      .split("/")
      .slice(0, +(process.env.DEPTH ?? 1))
      .join("/")
    by[k] = (by[k] ?? 0) + 1
  }
  for (const [k, v] of Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25))
    print(String(v).padStart(5), k)
}
if (mode === "targets") {
  const heavy = new RegExp(`^(${process.argv[5]})`)
  const reach = (cutSet) => {
    const seen = new Set()
    const stack = [entry]
    while (stack.length) {
      const f = stack.pop()
      if (seen.has(f)) continue
      seen.add(f)
      if (f.startsWith("pkg:")) continue
      const fromCli = /^(cli|mcp)\//.test(relative(root, f))
      for (const d of deps(f)) if (!(fromCli && cutSet.has(d))) stack.push(d)
    }
    return seen.size
  }
  const targets = new Set()
  for (const f of internal)
    if (/^(cli|mcp)\//.test(relative(root, f)))
      for (const d of deps(f)) if (!d.startsWith("pkg:") && heavy.test(relative(root, d))) targets.add(d)
  const base = reach(new Set()),
    allCut = reach(targets)
  print("base", base, "all cut", allCut, "targets", targets.size)
  const rows = [...targets].map((t) => [
    base - reach(new Set([t])),
    allCut - reach(new Set([...targets].filter((x) => x !== t))),
    relative(root, t),
  ])
  rows.sort((a, b) => b[1] - a[1])
  for (const r of rows) if (r[0] || r[1]) print(String(r[0]).padStart(5), String(r[1]).padStart(5), r[2])
}
if (mode === "dropped") {
  const heavy = new RegExp(`^(${process.argv[5]})`)
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    if (f.startsWith("pkg:")) continue
    const fromCli = /^(cli|mcp)\//.test(relative(root, f))
    for (const d of deps(f)) if (!(fromCli && !d.startsWith("pkg:") && heavy.test(relative(root, d)))) stack.push(d)
  }
  const gone = [...all].filter((f) => !seen.has(f))
  const by = {}
  for (const f of gone) {
    const k = f.startsWith("pkg:")
      ? f
      : relative(root, f)
          .split("/")
          .slice(0, +(process.env.DEPTH ?? 2))
          .join("/")
    by[k] = (by[k] ?? 0) + 1
  }
  print("dropped", gone.length)
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) print(String(v).padStart(5), k)
}
