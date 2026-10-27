// usage: node mcp-driver.mjs <bin> <command> <profile|-> <logfile> <gofile> <reads.json> [mcp words, default "mcp serve"]
// One MCP session over stdio. Before the go file: initialize, tools/list. After it: <command>_tools_search and
// <command>_read for each [read command, arguments] in reads.json, then prompts/list and resources/list.
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"

const [bin, command, profile, log, go, readsFile, ...words] = process.argv.slice(2)
const mcp = words.length > 0 ? words : ["mcp", "serve"]
const child = spawn(bin, profile === "-" ? mcp : [profile, ...mcp], { stdio: ["pipe", "pipe", "pipe"] })
const say = (line) => appendFileSync(log, `${new Date().toISOString()} ${line}\n`)
say(`child pid ${child.pid}`)
child.on("exit", (code, signal) => say(`CHILD EXIT code=${code} signal=${signal}`))
child.stderr.on("data", (d) => say(`STDERR ${String(d).slice(0, 2000)}`))
let buf = ""
const waiting = new Map()
child.stdout.on("data", (d) => {
  buf += d
  for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg)
      waiting.delete(msg.id)
    }
  }
})
let id = 0
const rpc = (method, params) =>
  new Promise((resolve) => {
    const n = ++id
    waiting.set(n, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`)
    setTimeout(() => {
      if (waiting.has(n)) {
        waiting.delete(n)
        resolve({ timeout: true })
      }
    }, 60000)
  })
const brief = (msg) => {
  if (msg.timeout) return "TIMEOUT"
  if (msg.error) return `RPC ERROR ${JSON.stringify(msg.error).slice(0, 600)}`
  const r = msg.result
  if (r?.tools) return `tools: ${r.tools.map((t) => t.name).join(",")}`
  if (r?.content) {
    const text = r.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join(" ")
    return `${r.isError ? "TOOL ERROR " : "ok "}${text.replaceAll("\n", " ").slice(0, 600)}`
  }
  return `ok ${JSON.stringify(r).slice(0, 300)}`
}
const call = async (phase, method, params) => {
  const label = `${method} ${params?.name ?? ""} ${JSON.stringify(params?.arguments ?? "")}`
  say(`[${phase}] ${label} -> ${brief(await rpc(method, params))}`)
}
say(
  `init -> ${brief(await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "upgrade-test", version: "0" } }))}`,
)
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
await call("before", "tools/list", {})
say("waiting for go file")
while (!existsSync(go)) await new Promise((r) => setTimeout(r, 500))
await call("after", "tools/list", {})
await call("after", "tools/call", { name: `${command}_tools_search`, arguments: {} })
for (const [read, args] of JSON.parse(readFileSync(readsFile, "utf8")))
  await call("after", "tools/call", { name: `${command}_read`, arguments: { command: read, arguments: args } })
await call("after", "prompts/list", {})
await call("after", "resources/list", {})
say("done; closing stdin")
child.stdin.end()
setTimeout(() => process.exit(0), 5000)
