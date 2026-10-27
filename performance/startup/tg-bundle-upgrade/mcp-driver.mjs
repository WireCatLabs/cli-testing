// usage: node mcp-driver.mjs <tg-bin> <profile> <logfile> <gofile> <calls-before.json> <calls-after.json>
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"

const [bin, profile, log, go, beforeFile, afterFile] = process.argv.slice(2)
const child = spawn(bin, [profile, "mcp"], { stdio: ["pipe", "pipe", "pipe"] })
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
  return `ok ${JSON.stringify(r).slice(0, 400)}`
}

const phase = async (name, file) => {
  const calls = JSON.parse(readFileSync(file, "utf8"))
  for (const [method, params] of calls) {
    const label = `${method} ${params?.name ?? ""} ${JSON.stringify(params?.arguments ?? params?.uri ?? "")}`
    say(`[${name}] ${label} -> ${brief(await rpc(method, params))}`)
  }
}
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "upgrade-test", version: "0" },
})
say(`init -> ${brief(init)}`)
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
await phase("before", beforeFile)
say("waiting for go file")
while (!existsSync(go)) await new Promise((r) => setTimeout(r, 500))
await phase("after", afterFile)
say("done; closing stdin")
child.stdin.end()
setTimeout(() => process.exit(0), 5000)
