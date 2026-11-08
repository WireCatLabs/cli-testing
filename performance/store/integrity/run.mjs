// node run.mjs <scenario> --core <version> [--seconds S] [--messages N]
// Makes a synthetic store, runs the scenario's writers as separate processes, checks the store, writes result.json.
import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { freemem, hostname } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./check.mjs"
import { args, HARNESS, installCore } from "./lib.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const MAX_WRITERS = 6
const WRITER_MB = 150
const SPARE_MB = 4096

const opts = args(process.argv.slice(2))
const [id] = opts._
const core = opts.core ?? "0.608.0"
const { scenario } = await import(`./scenarios/${id}.mjs`)
const seconds = Number(opts.seconds ?? scenario.seconds)
const writers = scenario.writers.flatMap((writer) => Array.from({ length: writer.count ?? 1 }, () => writer))
if (writers.length > MAX_WRITERS) throw new Error(`${writers.length} writers; at most ${MAX_WRITERS} at once`)
const needMb = writers.length * WRITER_MB + SPARE_MB
// MemFree leaves out the page cache the kernel gives back; MemAvailable is what a new process can have.
const availableMb = () => {
  const line = existsSync("/proc/meminfo") && /MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))
  return line ? Number(line[1]) / 1024 : freemem() / 2 ** 20
}
if (availableMb() < needMb) throw new Error(`needs ${needMb} MB available memory, has ${Math.round(availableMb())}`)

installCore(core)
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const runDir = opts.out ?? join(HARNESS, "runs", `${id}-${core}-${stamp}`)
const store = join(runDir, "store", "wirecat.db")
for (const dir of ["store", "home", "ledgers"]) mkdirSync(join(runDir, dir), { recursive: true })

// A moved HOME and no D-Bus: nothing a writer does can reach the owner's store or keyring.
const env = {
  PATH: process.env.PATH,
  HOME: join(runDir, "home"),
  XDG_CONFIG_HOME: join(runDir, "home", ".config"),
  XDG_DATA_HOME: join(runDir, "home", ".local", "share"),
  XDG_STATE_HOME: join(runDir, "home", ".local", "state"),
  MESSAGING_STORE: store,
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
  NODE_NO_WARNINGS: "1",
}

const node = (script, argv, log) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(HERE, script), ...argv], { env, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    const limit = setTimeout(() => child.kill("SIGKILL"), (seconds + 120) * 1000)
    child.on("exit", (code, signal) => {
      clearTimeout(limit)
      if (log) writeFileSync(log, output)
      resolve({ pid: child.pid, code, signal, output: output.slice(-2000) })
    })
  })

const started = Date.now()
const made = await node("make-store.mjs", [
  store,
  "--core",
  core,
  "--messages",
  String(opts.messages ?? scenario.messages),
])
if (made.code !== 0) throw new Error(`make-store failed: ${made.output}`)

const ledgers = writers.map((_, i) => join(runDir, "ledgers", `${i}.jsonl`))
for (const ledger of ledgers) writeFileSync(ledger, "")
const exits = await Promise.all(
  writers.map(async (writer, i) => {
    await new Promise((resolve) => setTimeout(resolve, writer.after ?? 0))
    const argv = ["--role", writer.role, "--core", writer.core ?? core, "--store", store, "--ledger", ledgers[i]]
    for (const [key, value] of Object.entries(writer.args ?? {})) argv.push(`--${key}`, String(value))
    argv.push("--seconds", String(seconds))
    return { role: writer.role, ...(await node("writer.mjs", argv, join(runDir, "ledgers", `${i}.log`))) }
  }),
)

const kept = join(runDir, "kept")
mkdirSync(kept)
for (const part of ["", "-wal", "-shm"])
  if (existsSync(store + part)) copyFileSync(store + part, join(kept, `wirecat.db${part}`))
const checks = await check(store, ledgers)
if (checks.verdict === "ok") rmSync(kept, { recursive: true })

const corePackage = (version) =>
  JSON.parse(
    readFileSync(join(HARNESS, "cores", version, "node_modules", "@wirecat", "cli-core", "package.json"), "utf8"),
  ).version
const result = {
  scenario: id,
  why: scenario.why,
  parameters: { seconds, messages: Number(opts.messages ?? scenario.messages), writers: scenario.writers },
  node: process.version,
  host: hostname(),
  cli_core: [...new Set(writers.map((writer) => writer.core ?? core))].map(corePackage),
  started: new Date(started).toISOString(),
  duration_s: Math.round((Date.now() - started) / 1000),
  writers: exits.map(({ output, ...exit }) => exit),
  checks,
  verdict: checks.verdict,
  kept: checks.verdict === "ok" ? null : kept,
}
writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ scenario: id, core, verdict: result.verdict, run: runDir })}\n`)
