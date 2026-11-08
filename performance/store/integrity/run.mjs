// node run.mjs <scenario> --core <version> [--seconds S] [--messages N]
// Makes a synthetic store, runs the scenario's writers as separate processes, checks the store, writes result.json.
// A scenario may also export `drive(ctx)`: it runs beside the writers and kills, starts or touches files on purpose.
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs"
import { freemem, hostname } from "node:os"
import { dirname, join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { check } from "./check.mjs"
import { args, CURRENT, HARNESS, installCore } from "./lib.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const MAX_WRITERS = 6
const WRITER_MB = 150
const SPARE_MB = 4096
const MIN_FREE_DISK_GB = 5

const opts = args(process.argv.slice(2))
const [id] = opts._
const core = opts.core ?? CURRENT
const { scenario, drive, after } = await import(`./scenarios/${id}.mjs`)
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
mkdirSync(join(HARNESS, "runs"), { recursive: true })
const { bavail, bsize } = statfsSync(join(HARNESS, "runs"))
if ((bavail * bsize) / 2 ** 30 < MIN_FREE_DISK_GB)
  throw new Error(`under ${MIN_FREE_DISK_GB} GB free on the harness disk; free space first`)

installCore(core)
for (const writer of writers) if (writer.core) installCore(writer.core)
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

// Only processes this run started are ever killed, by the pid spawn gave back.
const children = []
const events = []
const note = (event) => events.push({ at_ms: Date.now() - started, ...event })

const launch = (command, argv, { log, limit, label }) => {
  const child = spawn(command, argv, { env, stdio: ["ignore", "pipe", "pipe"] })
  const handle = Object.assign(new EventEmitter(), { pid: child.pid, label, child, maxStoreFds: 0, exit: null })
  let output = ""
  let pending = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
    pending += chunk
    const lines = pending.split("\n")
    pending = lines.pop()
    for (const line of lines) if (line.startsWith("MARK ")) handle.emit("mark", line.slice(5))
  })
  child.stderr.on("data", (chunk) => (output += chunk))
  const timer = setTimeout(() => child.kill("SIGKILL"), limit)
  handle.exited = new Promise((resolve) =>
    child.on("exit", (code, signal) => {
      clearTimeout(timer)
      if (log) writeFileSync(log, output)
      handle.exit = { code, signal }
      resolve({ pid: child.pid, label, code, signal, max_store_fds: handle.maxStoreFds, output: output.slice(-2000) })
    }),
  )
  children.push(handle)
  return handle
}

const node = (script, argv, log) =>
  launch(process.execPath, [join(HERE, script), ...argv], { log, limit: (seconds + 300) * 1000, label: script }).exited

let ledgerCount = 0
const ledgers = [join(runDir, "ledgers", "seed.jsonl")]
const startWriter = (writer, extra = {}) => {
  const i = ledgerCount++
  const ledger = join(runDir, "ledgers", `${i}.jsonl`)
  writeFileSync(ledger, "")
  ledgers.push(ledger)
  const argv = [
    "--role",
    writer.role,
    "--core",
    writer.core ?? core,
    "--store",
    writer.path?.(store) ?? store,
    "--ledger",
    ledger,
  ]
  for (const [key, value] of Object.entries({ ...writer.args, ...extra })) argv.push(`--${key}`, String(value))
  if (!("seconds" in { ...writer.args, ...extra })) argv.push("--seconds", String(seconds))
  const [command, prefix] = writer.wrap
    ? writer.wrap(writer.node ?? process.execPath)
    : [writer.node ?? process.execPath, []]
  return launch(command, [...prefix, join(HERE, "writer.mjs"), ...argv], {
    log: join(runDir, "ledgers", `${i}.log`),
    limit: (seconds + 300) * 1000,
    label: writer.role,
  })
}

// P2: how many descriptors each process holds on the store file. Two or more means it opened the store twice.
const storeFds = (pid) => {
  try {
    return readdirSync(`/proc/${pid}/fd`).filter((fd) => {
      try {
        return readlinkSync(`/proc/${pid}/fd/${fd}`).replace(/ \(deleted\)$/, "") === store
      } catch {
        return false
      }
    }).length
  } catch {
    return 0
  }
}
const watcher = setInterval(() => {
  for (const child of children) if (!child.exit) child.maxStoreFds = Math.max(child.maxStoreFds, storeFds(child.pid))
}, 200)

const started = Date.now()
const seedLedger = join(runDir, "ledgers", "seed.jsonl")
writeFileSync(seedLedger, "")
const made = await node("make-store.mjs", [
  store,
  "--ledger",
  seedLedger,
  "--core",
  scenario.storeCore ?? core,
  "--messages",
  String(opts.messages ?? scenario.messages),
  "--emails",
  String(scenario.emails ?? 0),
  "--notes",
  String(scenario.notes ?? 0),
])
if (made.code !== 0) throw new Error(`make-store failed: ${made.output}`)

const kill = (handle, why) => {
  if (handle.exit) return false
  note({ kill: handle.pid, role: handle.label, why })
  handle.child.kill("SIGKILL")
  return true
}
const command = (argv) =>
  launch(process.execPath, [join(HERE, "store-command.mjs"), "--core", core, ...argv], {
    limit: 120_000,
    label: argv
      .filter((word) => !word.startsWith("--"))
      .slice(0, 2)
      .join(" "),
  }).exited
const ctx = { store, runDir, core, env, seconds, children, note, kill, sleep, startWriter, launch, command, started }

await Promise.all([
  ...writers.map(async (writer) => {
    await sleep(writer.after ?? 0)
    return startWriter(writer).exited
  }),
  drive ? drive(ctx).then(() => null) : null,
])
while (children.some((child) => !child.exit)) await Promise.all(children.map((child) => child.exited))
clearInterval(watcher)
const findings = after ? await after({ ...ctx, ledgers, events }) : null

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
const all = await Promise.all(children.map((child) => child.exited))
const result = {
  scenario: id,
  why: scenario.why,
  parameters: {
    seconds,
    messages: Number(opts.messages ?? scenario.messages),
    emails: scenario.emails ?? 0,
    notes: scenario.notes ?? 0,
    writers: scenario.writers.map(({ path, wrap, ...writer }) => writer),
  },
  node: process.version,
  host: hostname(),
  cli_core: [...new Set([core, ...writers.map((writer) => writer.core ?? core)])].map(corePackage),
  started: new Date(started).toISOString(),
  duration_s: Math.round((Date.now() - started) / 1000),
  writers: all.filter((exit) => exit.label !== "make-store.mjs").map(({ output, ...exit }) => exit),
  events,
  findings,
  checks,
  verdict: checks.verdict,
  kept: checks.verdict === "ok" ? null : kept,
}
writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
const kills = events.filter((event) => event.kill).length
process.stdout.write(`${JSON.stringify({ scenario: id, core, verdict: result.verdict, kills, run: runDir })}\n`)
