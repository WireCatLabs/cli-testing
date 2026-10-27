// usage: node cpuprof.mjs <file.cpuprofile>: self time by kind and by package.
import { readFileSync } from "node:fs"

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const profile = JSON.parse(readFileSync(process.argv[2], "utf8"))
const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const self = new Map()
const dt = profile.timeDeltas
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]
  self.set(id, (self.get(id) ?? 0) + (dt[i + 1] ?? 0) / 1000)
}
const FIND =
  /package_json_reader|getPackageScopeConfig|internalModuleStat|realpathSync|^resolve|Resolve|pathToFileURL|fileURLToPath|getPathFromURL|normalizeString|^URL$|legacyMainResolve|finalizeResolution/
const COMPILE =
  /compileSourceTextModule|compileFunctionForCJSLoader|wrapSafe|compileFunction|^ModuleWrap$|compileForInternalLoader/
const kind = (node) => {
  const { url, functionName } = node.callFrame
  if (functionName === "(garbage collector)") return "garbage collection"
  if (functionName === "(idle)") return "idle"
  if (functionName === "(program)") return "native, unattributed"
  if (COMPILE.test(functionName)) return "compiling"
  if (
    FIND.test(functionName) ||
    url.startsWith("node:internal/modules/esm/resolve") ||
    url.startsWith("node:internal/modules/package_json")
  )
    return "finding files (resolve, package.json, stat, realpath)"
  if (url.startsWith("node:internal/modules") || url.startsWith("node:internal/vm") || functionName === "readFileUtf8")
    return "loading and linking (read, translate, link, instantiate)"
  if (url.startsWith("node:") || url === "") return "other Node internals"
  const at = url.lastIndexOf("/node_modules/")
  if (at < 0) return "the tool's own code"
  const rest = url.slice(at + 14).split("/")
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]
}
const totals = new Map()
let all = 0
for (const [id, ms] of self) {
  const k = kind(byId.get(id))
  totals.set(k, (totals.get(k) ?? 0) + ms)
  all += ms
}
log(`sampled ${Math.round(all)} ms`)
for (const [k, ms] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25))
  log(`${String(Math.round(ms)).padStart(6)} ms  ${k}`)
const fns = [...self]
  .map(([id, ms]) => [byId.get(id).callFrame, ms])
  .filter(([f]) => f.url && !f.url.startsWith("node:"))
  .sort((a, b) => b[1] - a[1])
  .slice(0, Number(process.argv[3] ?? 15))
log("\nhottest functions in package code (self ms):")
for (const [f, ms] of fns)
  log(
    `${ms.toFixed(1).padStart(6)}  ${f.functionName || "(anonymous)"}  ${f.url.replace(/.*node_modules\//, "")}:${f.lineNumber + 1}`,
  )
