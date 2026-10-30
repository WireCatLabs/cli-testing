// Usage: node measure.mjs <out-dir> [managers=npm,pnpm,bun,volta]
// Needs npm, pnpm, bun and (for volta) volta + volta-shim on PATH. Writes <out-dir>/results.json and summary.md.
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, delimiter, join, resolve } from "node:path"

const windows = process.platform === "win32"
const outDir = resolve(process.argv[2] ?? "wcat-umbrella-out")
const managers = (process.argv[3] ?? "npm,pnpm,bun,volta").split(",")
const voltaNode = process.env.VOLTA_NODE ?? "22.16.0"
const rawRoot = mkdtempSync(join(tmpdir(), "wcat-umbrella-"))
const root = realpathSync(rawRoot)
mkdirSync(outDir, { recursive: true })

const tail = (text, size = 1500) => {
  const clean = (text ?? "").split(root).join("<tmp>").split(rawRoot).join("<tmp>").trim()
  return clean.length > size ? `…${clean.slice(-size)}` : clean
}

const quote = (arg) => (windows && /[\s&()^]/.test(arg) ? `"${arg}"` : arg)

const exec = (command, args, env, cwd = root) => {
  const started = performance.now()
  const result = spawnSync(windows ? [command, ...args].map(quote).join(" ") : command, windows ? [] : args, {
    cwd,
    env,
    encoding: "utf8",
    shell: windows,
    timeout: 240_000,
  })
  return {
    command: [command, ...args].join(" ").split(root).join("<tmp>"),
    exit: result.status,
    signal: result.signal,
    error: result.error?.message,
    ms: Math.round(performance.now() - started),
    stdout: tail(result.stdout),
    stderr: tail(result.stderr),
  }
}

const tool = (name, version) => `#!/usr/bin/env node
if (process.argv[2] === "--version") process.stdout.write("${name} ${version}\\n")
else process.stdout.write("${name} ${version} " + process.argv.slice(2).join(" ") + "\\n")
`

// The dispatcher the plan describes, at its smallest: find wcat-<tool> on PATH and run it with inherited stdio.
const dispatcher = (name, version) => `#!/usr/bin/env node
const { spawnSync } = require("node:child_process")
const { existsSync } = require("node:fs")
const { delimiter, join } = require("node:path")
const [first, ...rest] = process.argv.slice(2)
if (first === "--which") {
  process.stdout.write("wcat from ${name}@${version}\\n")
  process.exit(0)
}
const windows = process.platform === "win32"
const extensions = windows ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""]
let found
for (const folder of (process.env.PATH || "").split(delimiter)) {
  for (const extension of extensions) {
    const candidate = join(folder, "wcat-" + first + extension)
    if (folder && existsSync(candidate)) {
      found = candidate
      break
    }
  }
  if (found) break
}
if (!found) {
  process.stderr.write("wcat: no wcat-" + first + " on PATH\\n")
  process.exit(127)
}
const result = windows
  ? spawnSync([found, ...rest].map((a) => '"' + a + '"').join(" "), { stdio: "inherit", shell: true })
  : spawnSync(found, rest, { stdio: "inherit" })
process.exit(result.status ?? 1)
`

const pack = (name, version, bins) => {
  const folder = join(root, "src", `${name}-${version}`)
  mkdirSync(folder, { recursive: true })
  const bin = {}
  for (const [command, kind] of Object.entries(bins)) {
    const file = `${command}.js`
    bin[command] = file
    writeFileSync(join(folder, file), kind === "dispatcher" ? dispatcher(name, version) : tool(name, version))
  }
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name, version, bin, license: "MIT" }, null, 2))
  const result = exec("npm", ["pack", "--pack-destination", join(root, "tarballs")], process.env, folder)
  if (result.exit !== 0) throw new Error(`npm pack failed: ${result.stderr}`)
  return join(root, "tarballs", `${name}-${version}.tgz`)
}

mkdirSync(join(root, "tarballs"), { recursive: true })
const tarballs = {
  a: pack("wcat-fixture-a", "1.0.0", { wcat: "dispatcher", "wcat-a": "tool" }),
  b: pack("wcat-fixture-b", "1.0.0", { wcat: "dispatcher", "wcat-b": "tool" }),
  c1: pack("wcat-fixture-c", "1.0.0", { "wcat-c": "tool" }),
  c2: pack("wcat-fixture-c", "1.1.0", { "wcat-c": "tool" }),
}
const packageName = { a: "wcat-fixture-a", b: "wcat-fixture-b", c1: "wcat-fixture-c", c2: "wcat-fixture-c" }

// Upgrades by name from a registry, as a real update does: bun refuses to replace one global tarball with another.
const registryServer = `
const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const [folder, portFile] = process.argv.slice(1)
const packuments = JSON.parse(fs.readFileSync(path.join(folder, "packuments.json"), "utf8"))
const server = http.createServer((request, response) => {
  const base = "http://127.0.0.1:" + server.address().port
  const name = decodeURIComponent(request.url.slice(1))
  if (packuments[name]) {
    response.setHeader("content-type", "application/json")
    return response.end(JSON.stringify(packuments[name]).split("REGISTRY").join(base))
  }
  const file = path.join(folder, path.basename(request.url))
  if (request.url.startsWith("/-/") && fs.existsSync(file)) return fs.createReadStream(file).pipe(response)
  response.statusCode = 404
  response.end("{}")
})
server.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(server.address().port)))
`

const startRegistry = () => {
  const versions = {}
  for (const [key, tarball] of Object.entries(tarballs)) {
    const name = packageName[key]
    const data = readFileSync(tarball)
    const manifest = JSON.parse(readFileSync(join(root, "src", basename(tarball, ".tgz"), "package.json"), "utf8"))
    versions[name] ??= {}
    versions[name][manifest.version] = {
      ...manifest,
      _id: `${name}@${manifest.version}`,
      dist: {
        tarball: `REGISTRY/-/${basename(tarball)}`,
        shasum: createHash("sha1").update(data).digest("hex"),
        integrity: `sha512-${createHash("sha512").update(data).digest("base64")}`,
      },
    }
  }
  const packuments = {}
  for (const [name, byVersion] of Object.entries(versions)) {
    const latest = Object.keys(byVersion).sort().at(-1)
    packuments[name] = { name, "dist-tags": { latest }, versions: byVersion }
  }
  const folder = join(root, "tarballs")
  writeFileSync(join(folder, "packuments.json"), JSON.stringify(packuments))
  const portFile = join(root, "registry.port")
  const child = spawn(process.execPath, ["-e", registryServer, folder, portFile], { stdio: "ignore" })
  const waitUntil = Date.now() + 10_000
  while (!existsSync(portFile) && Date.now() < waitUntil)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  if (!existsSync(portFile)) throw new Error("the local registry did not start")
  return { child, url: `http://127.0.0.1:${readFileSync(portFile, "utf8")}/` }
}
const registry = startRegistry()

const withPath = (folders, extra = {}) => {
  const env = { ...process.env, npm_config_registry: registry.url, BUN_CONFIG_REGISTRY: registry.url, ...extra }
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH"
  env[key] = [...folders, env[key]].join(delimiter)
  return env
}

const setups = {
  npm: (home) => {
    const prefix = join(home, "prefix")
    writeFileSync(join(home, "npmrc"), "")
    const env = withPath([windows ? prefix : join(prefix, "bin")], {
      NPM_CONFIG_PREFIX: prefix,
      npm_config_userconfig: join(home, "npmrc"),
      npm_config_cache: join(home, "cache"),
      npm_config_fund: "false",
      npm_config_audit: "false",
      npm_config_update_notifier: "false",
    })
    return {
      env,
      binDir: windows ? prefix : join(prefix, "bin"),
      add: (t) => exec("npm", ["install", "-g", t], env),
      remove: (n) => exec("npm", ["uninstall", "-g", n], env),
      version: () => exec("npm", ["--version"], env).stdout,
    }
  },
  pnpm: (home) => {
    const pnpmHome = join(home, "pnpm")
    mkdirSync(pnpmHome, { recursive: true })
    const env = withPath([pnpmHome, join(pnpmHome, "bin")], {
      PNPM_HOME: pnpmHome,
      npm_config_store_dir: join(home, "store"),
      npm_config_cache_dir: join(home, "cache"),
      npm_config_update_notifier: "false",
    })
    return {
      env,
      binDir: null,
      // pnpm 12 does not read npm_config_registry from the environment.
      add: (t) => exec("pnpm", ["add", "-g", t, `--registry=${registry.url}`], env),
      remove: (n) => exec("pnpm", ["remove", "-g", n], env),
      version: () => exec("pnpm", ["--version"], env).stdout,
    }
  },
  bun: (home) => {
    const bunHome = join(home, "bun")
    const env = withPath([join(bunHome, "bin")], {
      BUN_INSTALL: bunHome,
      BUN_INSTALL_BIN: join(bunHome, "bin"),
      BUN_INSTALL_GLOBAL_DIR: join(bunHome, "global"),
      BUN_INSTALL_CACHE_DIR: join(home, "cache"),
    })
    return {
      env,
      binDir: join(bunHome, "bin"),
      add: (t) => exec("bun", ["add", "-g", t], env),
      remove: (n) => exec("bun", ["remove", "-g", n], env),
      version: () => exec("bun", ["--version"], env).stdout,
    }
  },
  volta: (home) => {
    const voltaHome = join(home, "volta")
    const env = withPath([join(voltaHome, "bin")], { VOLTA_HOME: voltaHome })
    // A runner's own global prefix (Windows sets NPM_CONFIG_PREFIX) would send npm past Volta's interception.
    for (const key of Object.keys(env)) if (key.toLowerCase() === "npm_config_prefix") delete env[key]
    const node = exec("volta", ["install", `node@${voltaNode}`], env)
    if (node.exit !== 0) return { skipped: `volta install node failed: ${node.stderr || node.error}` }
    results.voltaShims ??= {
      bin: readdirSync(join(voltaHome, "bin")),
      npm: exec(windows ? "where" : "which", ["npm"], env).stdout,
    }
    // Volta has no tarball form of `volta install`; it takes over `npm i -g` and records the package as its own.
    return {
      env,
      binDir: join(voltaHome, "bin"),
      add: (t) => exec("npm", ["install", "-g", t], env),
      remove: (n) => exec("npm", ["uninstall", "-g", n], env),
      version: () => exec("volta", ["--version"], env).stdout,
    }
  },
}

const findBinDir = (home, command) => {
  const names = windows ? [`${command}.cmd`, `${command}.exe`, command] : [command]
  const walk = (folder, depth) => {
    if (depth > 6) return null
    let entries
    try {
      entries = readdirSync(folder, { withFileTypes: true })
    } catch {
      return null
    }
    if (entries.some((e) => names.includes(e.name)) && !folder.includes("node_modules")) return folder
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        const found = walk(join(folder, entry.name), depth + 1)
        if (found) return found
      }
    }
    return null
  }
  return walk(home, 0)
}

const findPackageFile = (home, name, file) => {
  const seen = new Set()
  const walk = (folder, depth) => {
    if (depth > 10) return null
    let real
    try {
      real = realpathSync(folder)
    } catch {
      return null
    }
    if (seen.has(real)) return null
    seen.add(real)
    const candidate = join(folder, file)
    if (folder.endsWith(name) && existsSync(candidate)) return candidate
    let entries
    try {
      entries = readdirSync(folder, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const found = walk(join(folder, entry.name), depth + 1)
        if (found) return found
      }
    }
    return null
  }
  return walk(home, 0)
}

const inspect = (binDir, command, env, args) => {
  if (!binDir || !existsSync(binDir)) return { files: [], run: null }
  const files = readdirSync(binDir)
    .filter((f) => f === command || f.startsWith(`${command}.`))
    .map((f) => {
      const path = join(binDir, f)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(path)
        let dangling = false
        try {
          realpathSync(path)
        } catch {
          dangling = true
        }
        return { name: f, link: tail(target), dangling }
      }
      const text = f.endsWith(".exe") ? "" : readFileSync(path, "utf8")
      const mentions = text.match(/wcat-fixture-[abc][^"'\s]*/g) ?? []
      return { name: f, file: true, bytes: stat.size, mentions: [...new Set(mentions)].map((m) => tail(m)) }
    })
  if (files.length === 0) return { files, run: null }
  const runnable = windows
    ? (files.find((f) => f.name === `${command}.cmd`) ?? files.find((f) => f.name === `${command}.exe`))
    : files.find((f) => f.name === command)
  const run = runnable ? exec(join(binDir, runnable.name), args, env) : null
  return { files, run: run && { exit: run.exit, stdout: run.stdout, stderr: run.stderr } }
}

const answer = (state) => {
  if (state.files.length === 0) return "absent"
  if (state.files.some((f) => f.dangling)) return "dangling link"
  if (!state.run) return "present, not runnable"
  if (state.run.exit !== 0) return `broken (exit ${state.run.exit})`
  const who = state.run.stdout.match(/wcat-fixture-([abc])@?\s?([\d.]+)/)
  return who ? `runs ${who[1]}@${who[2]}` : `runs: ${state.run.stdout}`
}

const fresh = (manager, label) => {
  const home = join(root, manager, label)
  mkdirSync(home, { recursive: true })
  const setup = setups[manager](home)
  return { home, setup }
}

const shared = (manager, order) => {
  const { home, setup } = fresh(manager, `shared-${order}`)
  if (setup.skipped) return { skipped: setup.skipped }
  const steps = []
  const step = (label, result) => {
    const binDir = setup.binDir ?? findBinDir(home, "wcat-a") ?? findBinDir(home, "wcat-b")
    const state = inspect(binDir, "wcat", setup.env, ["--which"])
    const b = inspect(binDir, "wcat-b", setup.env, ["--version"])
    steps.push({ label, result, wcat: answer(state), wcatFiles: state.files, wcatB: answer(b) })
  }
  step("install a", setup.add(tarballs.a))
  step("install b", setup.add(tarballs.b))
  const first = order === "a-first" ? "a" : "b"
  const second = order === "a-first" ? "b" : "a"
  step(`uninstall ${first}`, setup.remove(packageName[first]))
  step(`uninstall ${second}`, setup.remove(packageName[second]))
  return { version: setup.version(), steps }
}

const foreign = (manager) => {
  const { home, setup } = fresh(manager, "foreign")
  if (setup.skipped) return { skipped: setup.skipped }
  const steps = []
  const install = setup.add("wcat-fixture-c@1.0.0")
  const binDir = setup.binDir ?? findBinDir(home, "wcat-c")
  const target = findPackageFile(home, "wcat-fixture-c", "wcat-c.js")
  if (!binDir || !target) return { error: "could not find the bin folder or the installed package", install }
  if (windows) {
    const node = process.execPath
    writeFileSync(join(binDir, "wcat.cmd"), `@REM wcat-umbrella foreign shim\r\n@"${node}" "${target}" %*\r\n`)
    writeFileSync(
      join(binDir, "wcat.ps1"),
      `# wcat-umbrella foreign shim\n& "${node}" "${target}" $args\nexit $LASTEXITCODE\n`,
    )
    writeFileSync(join(binDir, "wcat"), `#!/bin/sh\n# wcat-umbrella foreign shim\nexec node "${target}" "$@"\n`)
  } else {
    symlinkSync(target, join(binDir, "wcat"))
  }
  const step = (label, result) => {
    const state = inspect(binDir, "wcat", setup.env, ["--version"])
    const own = inspect(binDir, "wcat-c", setup.env, ["--version"])
    steps.push({
      label,
      result,
      wcat: answer(state),
      wcatFiles: state.files,
      wcatC: answer(own),
      wcatCFiles: own.files,
    })
  }
  step("install c@1.0.0 from the registry, then make wcat -> c's wcat-c.js", install)
  step("upgrade c to 1.1.0", setup.add("wcat-fixture-c@1.1.0"))
  step("uninstall c", setup.remove(packageName.c1))
  return { target: tail(target), steps }
}

const median = (values) => {
  const sorted = [...values].sort((x, y) => x - y)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const timing = () => {
  const { setup } = fresh("npm", "timing")
  const install = setup.add(tarballs.a)
  if (install.exit !== 0) return { error: "install failed", install }
  const run = (command, args) => {
    const started = performance.now()
    const result = windows
      ? spawnSync([command, ...args].join(" "), { env: setup.env, encoding: "utf8", shell: windows })
      : spawnSync(command, args, { env: setup.env, encoding: "utf8" })
    const ms = performance.now() - started
    if (result.status !== 0 || !result.stdout.includes("wcat-fixture-a")) {
      throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`)
    }
    return ms
  }
  const direct = []
  const umbrella = []
  for (let i = 0; i < 3; i++) {
    run("wcat-a", ["--version"])
    run("wcat", ["a", "--version"])
  }
  for (let i = 0; i < 20; i++) {
    direct.push(run("wcat-a", ["--version"]))
    umbrella.push(run("wcat", ["a", "--version"]))
  }
  const round = (n) => Math.round(n * 10) / 10
  return {
    runs: 20,
    directMs: round(median(direct)),
    umbrellaMs: round(median(umbrella)),
    addedMs: round(median(umbrella) - median(direct)),
    direct: direct.map(round),
    umbrella: umbrella.map(round),
  }
}

const preexisting = spawnSync(windows ? "where" : "which", ["wcat"], { encoding: "utf8" })
const results = {
  os: process.platform,
  image: `${process.env.ImageOS ?? "?"} ${process.env.ImageVersion ?? ""}`.trim(),
  node: process.version,
  wcatOnPathBefore: preexisting.status === 0 ? preexisting.stdout.trim() : null,
  managers: {},
  timing: null,
}

for (const manager of managers) {
  let entry
  try {
    entry = { aFirst: shared(manager, "a-first"), bFirst: shared(manager, "b-first"), foreign: foreign(manager) }
  } catch (error) {
    entry = { error: String(error?.stack ?? error) }
  }
  results.managers[manager] = entry
  process.stdout.write(`${manager}: done\n`)
}
try {
  results.timing = timing()
} catch (error) {
  results.timing = { error: String(error?.stack ?? error) }
}

registry.child.kill()
writeFileSync(join(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`)

const lines = [`## ${results.os} (${results.image}), Node ${results.node}`, ""]
lines.push(
  "| manager | version | step | exit | `wcat` after | own bin after (`wcat-b` / `wcat-c`) | stderr (start) |",
  "| --- | --- | --- | ---: | --- | --- | --- |",
)
for (const [manager, entry] of Object.entries(results.managers)) {
  for (const [scenario, data] of Object.entries(entry)) {
    if (!data?.steps) {
      const why = tail(data?.skipped ?? data?.error ?? JSON.stringify(data), 300)
        .replace(/\s+/g, " ")
        .replace(/\|/g, "/")
      lines.push(`| ${manager} | | ${scenario} | | ${why} | | |`)
      continue
    }
    for (const s of data.steps) {
      const err = (s.result.stderr || s.result.error || "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 160)
      lines.push(
        `| ${manager} | ${entry.aFirst?.version ?? ""} | ${scenario}: ${s.label} | ${s.result.exit} | ${s.wcat} | ${s.wcatB ?? s.wcatC ?? ""} | ${err} |`,
      )
    }
  }
}
const t = results.timing
lines.push(
  "",
  t?.error
    ? `Timing failed: ${t.error}`
    : `Timing (npm, median of ${t.runs}): \`wcat-a --version\` ${t.directMs} ms, \`wcat a --version\` ${t.umbrellaMs} ms, added ${t.addedMs} ms`,
)
const summary = `${lines.join("\n")}\n`
writeFileSync(join(outDir, "summary.md"), summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
process.stdout.write(summary)
