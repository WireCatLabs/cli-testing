import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = process.argv[2]
if (!root) {
  console.error("usage: node bench.mjs <empty bench dir> [--skip-install]")
  process.exit(2)
}
const skipInstall = process.argv.includes("--skip-install")
const RUNS = 10
const RSS_RUNS = 5

const clis = [
  { pkg: "tg-cli", bin: "tg" },
  { pkg: "max-cli", bin: "max" },
  { pkg: "cli-memo", bin: "memo" },
  { pkg: "drive-cli", bin: "drive" },
  { pkg: "zoom-cli", bin: "zm" },
]
const commands = [["--version"], ["--help"], ["commands", "--json"]]
const heavy = {
  "sherpa-onnx": /\/node_modules\/sherpa-onnx[^/]*\//,
  echarts: /\/node_modules\/(echarts|zrender)\//,
  "@resvg/resvg-js": /\/node_modules\/@resvg\//,
  "@anthropic-ai/sdk": /\/node_modules\/@anthropic-ai\/sdk\//,
  "MCP SDK": /\/node_modules\/@modelcontextprotocol\//,
  "pdf (unpdf)": /\/node_modules\/unpdf\//,
  "docx (mammoth)": /\/node_modules\/mammoth\//,
  "doc (word-extractor)": /\/node_modules\/word-extractor\//,
  "html (defuddle/linkedom)": /\/node_modules\/(defuddle|linkedom)\//,
  "@huggingface/tokenizers": /\/node_modules\/@huggingface\//,
  "better-sqlite3": /\/node_modules\/better-sqlite3\//,
  "@wirecat/cli-core-sqlite": /\/node_modules\/@wirecat\/cli-core-sqlite\//,
  "node:sqlite": /^node:sqlite$/,
  googleapis: /\/node_modules\/(@googleapis|googleapis-common|google-auth-library)\//,
  "@mtcute": /\/node_modules\/@mtcute\//,
}

const optionalOnDisk = [
  "echarts",
  "zrender",
  "@resvg",
  "@napi-rs",
  "@anthropic-ai",
  "sherpa-onnx",
  "onnxruntime-common",
  "@wirecat/cli-core-onnx",
  "@wirecat/cli-core-sqlite",
  "@huggingface",
  "ogg-opus-decoder",
  "@wasm-audio-decoders",
  "unpdf",
  "mammoth",
  "word-extractor",
  "defuddle",
  "linkedom",
  "@mixmark-io",
]
const importAlone = ["@modelcontextprotocol/server", "@wirecat/cli-base", "@wirecat/cli-core"]

for (const d of ["home", "store", "state", "apps", "trace", "npm-cache"]) mkdirSync(join(root, d), { recursive: true })
const env = {
  ...process.env,
  HOME: join(root, "home"),
  MESSAGING_STORE: join(root, "store"),
  WIRECAT_STATE_DIR: join(root, "state"),
  NO_COLOR: "1",
}

const duKb = (path) => Number(execFileSync("du", ["-sk", path], { encoding: "utf8" }).split("\t")[0])
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function install(cli) {
  const dir = join(root, "apps", cli.pkg)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "package.json"), '{"private":true}\n')
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent", `@wirecat/${cli.pkg}@latest`],
    { cwd: dir, env: { ...env, npm_config_cache: join(root, "npm-cache") }, stdio: "inherit" },
  )
}

function topPackages(nm) {
  const dirs = []
  for (const name of readdirSync(nm)) {
    if (name.startsWith(".")) continue
    if (name.startsWith("@")) for (const sub of readdirSync(join(nm, name))) dirs.push(`${name}/${sub}`)
    else dirs.push(name)
  }
  return dirs
    .map((name) => ({ name, mb: +(duKb(join(nm, name)) / 1024).toFixed(1) }))
    .sort((a, b) => b.mb - a.mb)
    .slice(0, 10)
}

function optionalMb(nm) {
  const present = optionalOnDisk.map((name) => join(nm, name)).filter(existsSync)
  return +(present.reduce((kb, path) => kb + duKb(path), 0) / 1024).toFixed(1)
}

function version(nm, name) {
  try {
    return JSON.parse(readFileSync(join(nm, name, "package.json"), "utf8")).version
  } catch {
    return null
  }
}

function timeRuns(argv, extra = {}) {
  const opts = { env: { ...env, ...extra.env }, cwd: extra.cwd, stdio: "ignore" }
  spawnSync(process.execPath, argv, opts)
  const ms = []
  for (let i = 0; i < RUNS; i++) {
    const t = process.hrtime.bigint()
    const r = spawnSync(process.execPath, argv, opts)
    ms.push(Number(process.hrtime.bigint() - t) / 1e6)
    if (r.status !== 0) throw new Error(`${argv.join(" ")} exited ${r.status}`)
  }
  return { median: +median(ms).toFixed(1), min: +Math.min(...ms).toFixed(1), max: +Math.max(...ms).toFixed(1) }
}

function peakRssMb(argv) {
  const kb = []
  for (let i = 0; i < RSS_RUNS; i++) {
    const r = spawnSync("/usr/bin/time", ["-f", "%M", process.execPath, ...argv], { env, encoding: "utf8" })
    kb.push(Number(r.stderr.trim().split("\n").at(-1)))
  }
  return +(median(kb) / 1024).toFixed(1)
}

function trace(cli, argv, label) {
  const file = join(root, "trace", `${cli.pkg}-${label}.json`)
  spawnSync(process.execPath, ["--import", join(here, "trace-hook.mjs"), ...argv], {
    env: { ...env, TRACE_OUT: file },
    stdio: "ignore",
  })
  const urls = JSON.parse(readFileSync(file, "utf8"))
  const perPackage = {}
  for (const u of urls) {
    const m = u.match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)
    if (!m) continue
    const pkg = m.at(-1).slice("/node_modules/".length, -1)
    perPackage[pkg] = (perPackage[pkg] ?? 0) + 1
  }
  return {
    files: urls.filter((u) => u.startsWith("file:")).length,
    nodeModulesFiles: urls.filter((u) => u.includes("/node_modules/")).length,
    native: urls.filter((u) => u.startsWith("native:")).map((u) => u.replace(/.*\/node_modules\//, "")),
    packages: Object.keys(perPackage).sort(),
    heavyLoaded: Object.entries(heavy)
      .filter(([, re]) => urls.some((u) => re.test(u)))
      .map(([name]) => name),
  }
}

const baseline = timeRuns(["-e", "0"])
const results = []
for (const cli of clis) {
  if (!skipInstall) install(cli)
  const dir = join(root, "apps", cli.pkg)
  const nm = join(dir, "node_modules")
  const lock = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"))
  const bin = join(nm, "@wirecat", cli.pkg, "dist", "bin", `${cli.bin}.js`)
  const r = {
    cli: `@wirecat/${cli.pkg}`,
    version: version(nm, `@wirecat/${cli.pkg}`),
    cliCore: version(nm, "@wirecat/cli-core"),
    cliBase: version(nm, "@wirecat/cli-base"),
    installMb: +(duKb(nm) / 1024).toFixed(1),
    packages: Object.keys(lock.packages).filter(Boolean).length,
    optionalOnDiskMb: optionalMb(nm),
    biggest: topPackages(nm),
    timing: {},
    loaded: {},
  }
  for (const c of commands) r.timing[c.join(" ")] = timeRuns([bin, ...c])
  r.timing["--help, NODE_COMPILE_CACHE warm"] = timeRuns([bin, "--help"], {
    env: { NODE_COMPILE_CACHE: join(root, "compile-cache", cli.pkg) },
  })
  r.importAlone = Object.fromEntries(
    importAlone.map((name) => [name, timeRuns(["--input-type=module", "-e", `await import("${name}")`], { cwd: dir })]),
  )
  r.helpPeakRssMb = peakRssMb([bin, "--help"])
  r.loaded["--help"] = trace(cli, [bin, "--help"], "help")
  r.loaded["commands --json"] = trace(cli, [bin, "commands", "--json"], "commands")
  results.push(r)
  console.error(`${cli.pkg} done`)
}

const machine = {
  date: new Date().toISOString(),
  uname: execFileSync("uname", ["-a"], { encoding: "utf8" }).trim(),
  cpu: execFileSync("sh", ["-c", "lscpu | sed -n 's/^Model name: *//p'"], { encoding: "utf8" }).trim(),
  node: process.version,
  npm: execFileSync("npm", ["-v"], { encoding: "utf8" }).trim(),
  nodeBaselineMs: baseline,
}
process.stdout.write(`${JSON.stringify({ machine, results }, null, 2)}\n`)
