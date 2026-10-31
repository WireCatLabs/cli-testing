// Usage: node cross-os.mjs <cli-base tarball> <out-dir> [managers=npm,pnpm,bun]
// Installs two fixture CLIs built on the given cli-base globally with each package manager, in throwaway folders, and
// checks the wcat launcher, dispatch, shortcuts and repair through every shell of the system (bash; cmd and PowerShell
// on Windows). Needs npm, pnpm and bun on PATH. Writes <out-dir>/results.json and <out-dir>/summary.md.
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"

const windows = process.platform === "win32"
const [baseTarball, outArg, managerArg] = process.argv.slice(2)
if (!baseTarball) throw new Error("usage: node cross-os.mjs <cli-base tarball> <out-dir> [managers]")
const outDir = resolve(outArg ?? "wcat-cross-os-out")
const managers = (managerArg ?? "npm,pnpm,bun").split(",")
const root = realpathSync(mkdtempSync(join(tmpdir(), "wcat-cross-os-")))
mkdirSync(outDir, { recursive: true })

const clip = (text, size = 1200) => {
  const clean = (text ?? "").split(root).join("<tmp>").trim()
  return clean.length > size ? `…${clean.slice(-size)}` : clean
}

const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { encoding: "utf8", timeout: 240_000, ...options })
  return { exit: result.status, error: result.error?.message, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

// One command line, typed into a shell the way a person would type it.
const shells = windows
  ? {
      cmd: (line, env) =>
        run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { env, windowsVerbatimArguments: true }),
      pwsh: (line, env) =>
        run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `${line}; exit $LASTEXITCODE`], { env }),
    }
  : { bash: (line, env) => run("bash", ["-c", line], { env }) }

const fixture = (name) => `#!/usr/bin/env node
import { wcatStart } from "@wirecat/cli-base/wcat/start"

const { code } = await wcatStart({ command: "${name}", version: "1.0.0", description: "fixture ${name}" })
if (code !== undefined) process.exitCode = code
else {
  const [verb, ...rest] = process.argv.slice(2)
  if (verb === "--version") process.stdout.write("${name} 1.0.0\\n")
  else if (verb === "args") process.stdout.write(JSON.stringify(rest) + "\\n")
  else if (verb === "exit") process.exitCode = Number(rest[0])
  else if (verb === "stdin") {
    let text = ""
    for await (const chunk of process.stdin) text += chunk
    process.stdout.write("stdin:" + text.trim() + "\\n")
  } else process.exitCode = 2
}
`

const baseManifest = JSON.parse(
  run("tar", ["-xzOf", baseTarball, "package/package.json"], { cwd: root }).stdout || "{}",
)
if (!baseManifest.version) throw new Error(`cannot read package.json from ${baseTarball}`)

const pack = (name) => {
  const folder = join(root, "src", name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, "bin.mjs"), fixture(name))
  const manifest = {
    name: `wcat-fixture-${name}`,
    version: "1.0.0",
    type: "module",
    license: "MIT",
    bin: { [`wcat-${name}`]: "bin.mjs" },
    dependencies: { "@wirecat/cli-base": baseManifest.version },
  }
  writeFileSync(join(folder, "package.json"), JSON.stringify(manifest, null, 2))
  const packed = run("npm", ["pack", "--pack-destination", join(root, "tarballs")], { cwd: folder, shell: windows })
  if (packed.exit !== 0) throw new Error(`npm pack failed: ${packed.stderr}`)
  return { manifest, tarball: join(root, "tarballs", `${manifest.name}-1.0.0.tgz`) }
}

mkdirSync(join(root, "tarballs"), { recursive: true })
const served = [pack("alpha"), pack("beta"), { manifest: baseManifest, tarball: resolve(baseTarball) }]

// Our three packages by name; everything else (cli-base's own dependencies) is passed on to npmjs.
const registryServer = `
const http = require("node:http")
const https = require("node:https")
const fs = require("node:fs")
const path = require("node:path")
const [folder, portFile] = process.argv.slice(1)
const packuments = JSON.parse(fs.readFileSync(path.join(folder, "packuments.json"), "utf8"))
const server = http.createServer((request, response) => {
  const base = "http://127.0.0.1:" + server.address().port
  const name = decodeURIComponent(request.url.slice(1))
  const send = (body) => {
    response.setHeader("content-type", "application/json")
    return response.end(JSON.stringify(body).split("REGISTRY").join(base))
  }
  if (packuments[name]) return send(packuments[name])
  // pnpm asks for one version: /<name>/latest
  const cut = name.lastIndexOf("/")
  const whole = packuments[name.slice(0, cut)]
  if (whole) {
    const wanted = name.slice(cut + 1)
    const version = whole.versions[whole["dist-tags"][wanted] ?? wanted]
    if (version) return send(version)
  }
  const file = path.join(folder, path.basename(request.url))
  if (request.url.startsWith("/-/") && fs.existsSync(file)) return fs.createReadStream(file).pipe(response)
  const upstream = https.get("https://registry.npmjs.org" + request.url, { headers: { accept: request.headers.accept || "application/json" } }, (answer) => {
    response.writeHead(answer.statusCode, { "content-type": answer.headers["content-type"] || "application/json" })
    answer.pipe(response)
  })
  upstream.on("error", () => { response.statusCode = 502; response.end("{}") })
})
server.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(server.address().port)))
`

const startRegistry = () => {
  const folder = join(root, "tarballs")
  const packuments = {}
  for (const { manifest, tarball } of served) {
    const data = readFileSync(tarball)
    const file = `${manifest.name.replace("/", "-")}-${manifest.version}.tgz`
    writeFileSync(join(folder, file), data)
    const published = "2020-01-01T00:00:00.000Z"
    packuments[manifest.name] = {
      name: manifest.name,
      "dist-tags": { latest: manifest.version },
      time: { created: published, modified: published, [manifest.version]: published },
      versions: {
        [manifest.version]: {
          ...manifest,
          _id: `${manifest.name}@${manifest.version}`,
          dist: {
            tarball: `REGISTRY/-/${file}`,
            shasum: createHash("sha1").update(data).digest("hex"),
            integrity: `sha512-${createHash("sha512").update(data).digest("base64")}`,
          },
        },
      },
    }
  }
  writeFileSync(join(folder, "packuments.json"), JSON.stringify(packuments))
  const portFile = join(root, "registry.port")
  const child = spawn(process.execPath, ["-e", registryServer, folder, portFile], { stdio: "ignore" })
  const until = Date.now() + 10_000
  while (!existsSync(portFile) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  if (!existsSync(portFile)) throw new Error("the local registry did not start")
  return { child, url: `http://127.0.0.1:${readFileSync(portFile, "utf8")}/` }
}
const registry = startRegistry()

const withPath = (folders, extra) => {
  const env = { ...process.env, npm_config_registry: registry.url, BUN_CONFIG_REGISTRY: registry.url, ...extra }
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH"
  env[key] = [...folders, env[key]].join(delimiter)
  return env
}

const pm = (command, args, env) => run(command, args, { env, cwd: root, shell: windows })

const setups = {
  npm: (home) => {
    const prefix = join(home, "prefix")
    writeFileSync(join(home, "npmrc"), "")
    const binDir = windows ? prefix : join(prefix, "bin")
    const env = withPath([binDir], {
      NPM_CONFIG_PREFIX: prefix,
      npm_config_userconfig: join(home, "npmrc"),
      npm_config_cache: join(home, "cache"),
      npm_config_fund: "false",
      npm_config_audit: "false",
      npm_config_update_notifier: "false",
    })
    return {
      env,
      binDir,
      add: (name) => pm("npm", ["install", "-g", name], env),
      remove: (name) => pm("npm", ["uninstall", "-g", name], env),
      version: () => pm("npm", ["--version"], env).stdout.trim(),
    }
  },
  pnpm: (home) => {
    const pnpmHome = join(home, "pnpm")
    mkdirSync(pnpmHome, { recursive: true })
    // pnpm 12 keeps global commands in $PNPM_HOME/bin; earlier versions in $PNPM_HOME.
    const env = withPath([join(pnpmHome, "bin"), pnpmHome], {
      PNPM_HOME: pnpmHome,
      npm_config_update_notifier: "false",
    })
    return {
      env,
      get binDir() {
        return existsSync(join(pnpmHome, "bin")) ? join(pnpmHome, "bin") : pnpmHome
      },
      // pnpm 12 does not read npm_config_registry from the environment.
      add: (name) => pm("pnpm", ["add", "-g", name, `--registry=${registry.url}`, "--config.minimumReleaseAge=0"], env),
      remove: (name) => pm("pnpm", ["remove", "-g", name], env),
      version: () => pm("pnpm", ["--version"], env).stdout.trim(),
    }
  },
  bun: (home) => {
    const bunHome = join(home, "bun")
    const env = withPath([join(bunHome, "bin")], { BUN_INSTALL: bunHome, BUN_INSTALL_CACHE_DIR: join(home, "cache") })
    return {
      env,
      binDir: join(bunHome, "bin"),
      add: (name) => pm("bun", ["add", "-g", name], env),
      remove: (name) => pm("bun", ["remove", "-g", name], env),
      version: () => pm("bun", ["--version"], env).stdout.trim(),
    }
  },
}

const MARK = /^(?:#|REM) wirecat-shim (\d+) (launcher|shortcut) (\S+)\r?$/m
const shimsIn = (binDir, name) =>
  existsSync(binDir)
    ? readdirSync(binDir)
        .filter((file) => file === name || file === `${name}.cmd` || file === `${name}.ps1`)
        .map((file) => {
          const text = readFileSync(join(binDir, file), "utf8")
          const mark = MARK.exec(text)
          return { file, mark: mark ? `${mark[2]} → ${mark[3]}` : "not ours" }
        })
    : []

const quoted = ["two words", 'say "hi"', "a&b"]
const lines = {
  bash: { args: `args "two words" 'say "hi"' 'a&b'`, pipe: (cmd) => `printf 'piped text' | ${cmd}` },
  cmd: { args: `args "two words" "say \\"hi\\"" "a&b"`, pipe: (cmd) => `echo piped text| ${cmd}` },
  pwsh: { args: `args "two words" 'say "hi"' 'a&b'`, pipe: (cmd) => `'piped text' | ${cmd}` },
}

const scenario = (manager) => {
  const home = join(root, manager)
  mkdirSync(home, { recursive: true })
  const setup = setups[manager](home)
  const checks = []
  const check = (label, shell, result, ok) =>
    checks.push({
      label,
      shell,
      pass: Boolean(ok),
      exit: result?.exit,
      stdout: clip(result?.stdout),
      stderr: clip(result?.stderr),
      ...(result?.error ? { error: result.error } : {}),
    })
  const note = (label, value, ok) => checks.push({ label, shell: "-", pass: Boolean(ok), value })

  for (const name of ["alpha", "beta"]) {
    const added = setup.add(`wcat-fixture-${name}`)
    check(`install wcat-fixture-${name}`, manager, added, added.exit === 0)
  }
  const firstShell = Object.keys(shells)[0]
  const first = shells[firstShell]("wcat-alpha --version", setup.env)
  check("first run of wcat-alpha", firstShell, first, first.stdout.trim() === "alpha 1.0.0")
  const launcher = shimsIn(setup.binDir, "wcat")
  const expected = windows ? ["wcat.cmd", "wcat.ps1"] : ["wcat"]
  note(
    "launcher written",
    launcher,
    expected.every((file) => launcher.some((one) => one.file === file && one.mark.startsWith("launcher → wcat-alpha"))),
  )

  for (const [shell, type] of Object.entries(shells)) {
    const words = lines[shell]
    let r = type("wcat alpha --version", setup.env)
    check("wcat alpha --version", shell, r, r.exit === 0 && r.stdout.trim() === "alpha 1.0.0")
    r = type("wcat --help", setup.env)
    check(
      "wcat --help lists both with descriptions",
      shell,
      r,
      r.exit === 0 && /fixture alpha/.test(r.stdout) && /fixture beta/.test(r.stdout),
    )
    r = type("wcat --json", setup.env)
    let items = []
    try {
      items = JSON.parse(r.stdout).items
    } catch {}
    check(
      "wcat --json",
      shell,
      r,
      items.some((i) => i.name === "beta" && i.description === "fixture beta"),
    )
    r = type("wcat beta exit 42", setup.env)
    check("exit code passes through", shell, r, r.exit === 42)
    r = type(`wcat alpha ${words.args}`, setup.env)
    check("arguments with spaces, quotes and &", shell, r, r.stdout.trim() === JSON.stringify(quoted))
    r = type(words.pipe("wcat alpha stdin"), setup.env)
    check("stdin passes through", shell, r, r.stdout.trim() === "stdin:piped text")
    r = type("wcat nope --json", setup.env)
    check("unknown tool is not_found, exit 6", shell, r, r.exit === 6 && /tool\.not-installed/.test(r.stderr))
  }

  const add = shells[firstShell]("wcat shortcuts add alpha --json", setup.env)
  let made
  try {
    made = JSON.parse(add.stdout).items[0]
  } catch {}
  check("wcat shortcuts add alpha", firstShell, add, made?.status === "made")
  note("shortcut files", shimsIn(setup.binDir, "alpha"), shimsIn(setup.binDir, "alpha").length === expected.length)
  for (const [shell, type] of Object.entries(shells)) {
    let r = type("alpha --version", setup.env)
    check("the shortcut runs the tool", shell, r, r.stdout.trim() === "alpha 1.0.0")
    r = type("alpha exit 3", setup.env)
    check("the shortcut passes the exit code", shell, r, r.exit === 3)
    r = type(`alpha ${lines[shell].args}`, setup.env)
    check("the shortcut passes quoted arguments", shell, r, r.stdout.trim() === JSON.stringify(quoted))
    r = type(lines[shell].pipe("alpha stdin"), setup.env)
    check("the shortcut passes stdin", shell, r, r.stdout.trim() === "stdin:piped text")
  }
  const removed = shells[firstShell]("wcat shortcuts remove alpha --json", setup.env)
  check(
    "wcat shortcuts remove alpha",
    firstShell,
    removed,
    removed.exit === 0 && shimsIn(setup.binDir, "alpha").length === 0,
  )

  const gone = setup.remove("wcat-fixture-alpha")
  check("uninstall wcat-fixture-alpha", manager, gone, gone.exit === 0)
  const broken = shells[firstShell]("wcat beta --version", setup.env)
  check("wcat before repair (expected to fail: its tool is gone)", firstShell, broken, broken.exit !== 0)
  const repair = shells[firstShell]("wcat-beta --version", setup.env)
  check("run wcat-beta once", firstShell, repair, repair.stdout.trim() === "beta 1.0.0")
  const repaired = shimsIn(setup.binDir, "wcat")
  note(
    "launcher repaired to wcat-beta",
    repaired,
    repaired.length === expected.length && repaired.every((one) => one.mark.startsWith("launcher → wcat-beta")),
  )
  for (const [shell, type] of Object.entries(shells)) {
    const r = type("wcat beta --version", setup.env)
    check("wcat beta --version after repair", shell, r, r.stdout.trim() === "beta 1.0.0")
  }
  return { version: setup.version(), checks }
}

const results = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  cliBase: baseManifest.version,
  managers: {},
}
for (const manager of managers) {
  try {
    results.managers[manager] = scenario(manager)
  } catch (error) {
    results.managers[manager] = { error: error.stack }
  }
}
registry.child.kill()

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2))
const summary = [
  `# ${process.platform} ${process.arch}, Node ${process.version}, cli-base ${baseManifest.version}`,
  "",
  ...Object.entries(results.managers).flatMap(([manager, result]) => [
    `## ${manager} ${result.version ?? ""}`,
    "",
    ...(result.error
      ? ["```", result.error, "```"]
      : [
          "| check | shell | result |",
          "| --- | --- | --- |",
          ...result.checks.map(
            (c) => `| ${c.label} | ${c.shell} | ${c.pass ? "pass" : `**FAIL** (exit ${c.exit ?? "-"})`} |`,
          ),
        ]),
    "",
  ]),
].join("\n")
writeFileSync(join(outDir, "summary.md"), summary)
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" })
process.stdout.write(`${summary}\n`)
const failed = Object.values(results.managers).some((r) => r.error || r.checks.some((c) => !c.pass))
process.exitCode = failed ? 1 : 0
