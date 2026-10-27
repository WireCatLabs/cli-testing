// usage: node phases.mjs <file.cpuprofile>...: CPU time by what it was spent on, attributing each sample by its whole stack.
import { readFileSync } from "node:fs"

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const RESOLVE =
  /^(defaultResolve|moduleResolve|resolveSync|packageResolve|getPackageScopeConfig|getPackageType|finalizeResolution)$/
const COMPILE =
  /^(compileSourceTextModule|compileFunctionForCJSLoader|wrapSafe|compileFunction|ModuleWrap|compileForInternalLoader)$/
const phaseOf = (stack) => {
  const leaf = stack[0].callFrame.functionName
  if (leaf === "(garbage collector)") return "garbage collection"
  if (leaf === "(idle)" || leaf === "(program)") return "idle or unattributed"
  const names = stack.map((n) => n.callFrame.functionName)
  if (names.some((n) => RESOLVE.test(n))) return "resolving imports to files (paths, package.json, stat, realpath)"
  if (names.some((n) => COMPILE.test(n))) return "compiling (with the compile cache on)"
  if (names.includes("createProgram")) return "building the program (createProgram)"
  if (names.includes("runOnce")) return "parsing and running the command"
  const nearest = stack.find(
    (n) => n.callFrame.url.startsWith("file:") || /^node:internal\/(modules|vm)/.test(n.callFrame.url),
  )
  if (nearest?.callFrame.url.startsWith("file:")) return "running modules' top-level code"
  if (nearest) return "reading, linking, instantiating modules"
  return "Node start and other internals"
}
const totals = new Map()
const files = process.argv.slice(2)
for (const file of files) {
  const profile = JSON.parse(readFileSync(file, "utf8"))
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const memo = new Map()
  profile.samples.forEach((id, i) => {
    let phase = memo.get(id)
    if (!phase) {
      const stack = []
      for (let at = id; at !== undefined; at = parent.get(at)) stack.push(byId.get(at))
      phase = phaseOf(stack)
      memo.set(id, phase)
    }
    totals.set(phase, (totals.get(phase) ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000 / files.length)
  })
}
const all = [...totals.values()].reduce((a, b) => a + b, 0)
log(`mean CPU sampled per run: ${Math.round(all)} ms (${files.length} runs)`)
for (const [k, ms] of [...totals].sort((a, b) => b[1] - a[1]))
  log(`${String(Math.round(ms)).padStart(5)} ms  ${String(Math.round((ms / all) * 100)).padStart(3)}%  ${k}`)
