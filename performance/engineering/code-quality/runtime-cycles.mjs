import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const { default: ts } = await import(
  pathToFileURL(
    process.env.WIRECAT_TYPESCRIPT_API ??
      (() => {
        throw new Error("Set WIRECAT_TYPESCRIPT_API to TypeScript 5.9.3 lib/typescript.js")
      })(),
  ).href
)
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((n) => (n.isDirectory() ? walk(path.join(d, n.name)) : [path.join(d, n.name)]))
const files = walk("src").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
const graph = new Map()
for (const file of files) {
  const s = fs.readFileSync(file, "utf8"),
    a = ts.createSourceFile(file, s, 99, true)
  const edges = []
  for (const n of a.statements) {
    if (ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) {
      if (
        n.importClause?.namedBindings &&
        ts.isNamedImports(n.importClause.namedBindings) &&
        n.importClause.namedBindings.elements.every((e) => e.isTypeOnly) &&
        !n.importClause.name
      )
        continue
      const p = n.moduleSpecifier.text
      if (p.startsWith(".")) edges.push(path.normalize(path.join(path.dirname(file), p.replace(/\.js$/, ".ts"))))
    }
    if (ts.isExportDeclaration(n) && !n.isTypeOnly && n.moduleSpecifier) {
      if (n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.every((e) => e.isTypeOnly))
        continue
      const p = n.moduleSpecifier.text
      if (p.startsWith(".")) edges.push(path.normalize(path.join(path.dirname(file), p.replace(/\.js$/, ".ts"))))
    }
  }
  graph.set(file, edges)
}
let index = 0
const indices = new Map(),
  low = new Map(),
  active = new Set(),
  stack = [],
  cycles = []
const visit = (f) => {
  indices.set(f, index)
  low.set(f, index++)
  stack.push(f)
  active.add(f)
  for (const next of graph.get(f) ?? []) {
    if (!graph.has(next)) continue
    if (!indices.has(next)) {
      visit(next)
      low.set(f, Math.min(low.get(f), low.get(next)))
    } else if (active.has(next)) low.set(f, Math.min(low.get(f), indices.get(next)))
  }
  if (low.get(f) === indices.get(f)) {
    const group = []
    let at
    do {
      at = stack.pop()
      active.delete(at)
      group.push(at)
    } while (at !== f)
    if (group.length > 1) cycles.push(group)
  }
}
for (const f of files) if (!indices.has(f)) visit(f)
const relevantCycles = cycles.filter((c) => c.some((f) => f.startsWith("src/store/") || f.startsWith("src/services/")))
process.stdout.write(`${JSON.stringify(relevantCycles, null, 2)}\n`)
if (relevantCycles.length) process.exitCode = 1
