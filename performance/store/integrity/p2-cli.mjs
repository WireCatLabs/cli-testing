// node p2-cli.mjs <cli> [--calls N]: P2 on an installed CLI: start `<cli> mcp serve` on a fresh synthetic store
// under a moved HOME, make MCP tool calls that read and write the store, and count the descriptors the server
// process holds on the store file the whole time. More than one means the process opened the store twice, which on
// cli-core before 0.599.0 dropped its locks (BUG-557), and which P2 forbids whatever the version.
import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { args, CURRENT, HARNESS } from "./lib.mjs"

const opts = args(process.argv.slice(2))
const [cli] = opts._
const rounds = Number(opts.calls ?? 5)
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = join(HARNESS, "runs", `P2-${cli}-${stamp}`)
const store = join(dir, "store", "wirecat.db")
mkdirSync(join(dir, "store"), { recursive: true })
const env = {
  PATH: process.env.PATH,
  HOME: join(dir, "home"),
  XDG_CONFIG_HOME: join(dir, "home", ".config"),
  XDG_DATA_HOME: join(dir, "home", ".local", "share"),
  XDG_STATE_HOME: join(dir, "home", ".local", "state"),
  MESSAGING_STORE: store,
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
  NODE_NO_WARNINGS: "1",
}
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL("make-store.mjs", import.meta.url)),
    store,
    "--core",
    CURRENT,
    "--messages",
    "2000",
    "--emails",
    "300",
    "--notes",
    "100",
  ],
  { env, stdio: "ignore" },
)

const server = spawn(cli, ["mcp", "serve"], { env, stdio: ["pipe", "pipe", "pipe"] })
const answers = new Map()
let buffer = ""
let stderr = ""
server.stdout.on("data", (chunk) => {
  buffer += chunk
  for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
    const line = buffer.slice(0, i)
    buffer = buffer.slice(i + 1)
    try {
      const message = JSON.parse(line)
      if (message.id !== undefined) answers.set(message.id, message)
    } catch {}
  }
})
server.stderr.on("data", (chunk) => (stderr += chunk))
let exited = false
const gone = new Promise((resolve) => server.on("exit", resolve)).then(() => (exited = true))

let id = 0
const call = async (method, params) => {
  const mine = ++id
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`)
  for (let waited = 0; waited < 30_000 && !answers.has(mine) && !exited; waited += 20) await sleep(20)
  return answers.get(mine) ?? { timeout: method }
}

const fds = () => {
  try {
    return readdirSync(`/proc/${server.pid}/fd`).filter((fd) => {
      try {
        return readlinkSync(`/proc/${server.pid}/fd/${fd}`).replace(/ \(deleted\)$/, "") === store
      } catch {
        return false
      }
    }).length
  } catch {
    return 0
  }
}
// The lock a WAL connection holds on the database file for its whole life (bytes 1073741826-1073742335).
const dbLocks = () => {
  const ino = execFileSync("stat", ["-c", "%i", store], { encoding: "utf8" }).trim()
  return readFileSync("/proc/locks", "utf8")
    .split("\n")
    .filter((line) => line.includes(` ${server.pid} `) && line.includes(`:${ino} `)).length
}

const samples = []
const watcher = setInterval(() => samples.push(fds()), 25)
await call("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "store-harness-p2", version: "0" },
})
const tools = await call("tools/list", {})
const names = tools?.result?.tools?.map((tool) => tool.name) ?? []
const read = names.find((name) => name.endsWith("_read"))
const write = names.find((name) => name.endsWith("_write"))
const calls = []
const steps = [
  [read, { command: "notes list" }],
  [read, { command: "search all", arguments: { query: "alpha" } }],
  [read, { command: "memories list" }],
  [write, { command: "notes add", arguments: { text: "harness note" } }],
]
for (let i = 0; i < rounds; i++)
  for (const [tool, input] of steps) {
    if (!tool) continue
    const answer = await call("tools/call", { name: tool, arguments: input })
    calls.push({
      tool,
      command: input.command,
      error: answer.error?.message ?? (answer.result?.isError ? "tool error" : null),
    })
    samples.push(fds())
  }
const locksWhileOpen = fds() > 0 ? dbLocks() : null
clearInterval(watcher)
// An MCP server on stdio ends when its client closes stdin; SIGKILL by its own pid only if it does not.
server.stdin.end()
if (!(await Promise.race([gone.then(() => true), sleep(5000).then(() => false)]))) server.kill("SIGKILL")
await gone

const version = (() => {
  try {
    return execFileSync(cli, ["--version"], { env, encoding: "utf8" }).trim()
  } catch {
    return null
  }
})()
const result = {
  cli,
  started: names.length > 0,
  version,
  tools: names,
  calls: calls.length,
  failed_calls: calls.filter((one) => one.error).length,
  max_store_fds: Math.max(0, ...samples),
  samples: samples.length,
  db_locks_at_end: locksWhileOpen,
  verdict: names.length === 0 ? "did not start" : Math.max(0, ...samples) <= 1 ? "one open" : "opened twice",
  stderr: stderr.slice(-500),
  stdout_error: [...answers.values()].find((answer) => answer.error)?.error ?? null,
}
writeFileSync(join(dir, "result.json"), `${JSON.stringify({ ...result, call_log: calls }, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ ...result, stderr: undefined, run: dir })}\n`)
