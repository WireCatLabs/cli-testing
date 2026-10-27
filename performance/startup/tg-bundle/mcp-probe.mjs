// mcp-probe.mjs <tg> <args...>: initialize, list tools and prompts, get each prompt; prints the responses
import { spawn } from "node:child_process"

const say = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const [tg, ...args] = process.argv.slice(2)
const child = spawn(tg, args, { stdio: ["pipe", "pipe", "inherit"] })
let buf = ""
const waiting = new Map()
let id = 0
child.stdout.on("data", (d) => {
  buf += d
  for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const m = JSON.parse(line)
    waiting.get(m.id)?.(m)
  }
})
const call = (method, params) =>
  new Promise((ok) => {
    const n = ++id
    waiting.set(n, ok)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`)
  })
const out = []
out.push(
  await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "probe", version: "1" },
  }),
)
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
const tools = await call("tools/list", {})
out.push(tools)
const prompts = await call("prompts/list", {})
out.push(prompts)
for (const p of prompts.result?.prompts ?? [])
  out.push(
    await call("prompts/get", {
      name: p.name,
      arguments: Object.fromEntries((p.arguments ?? []).map((a) => [a.name, "x"])),
    }),
  )
say(JSON.stringify(out, null, 1))
child.stdin.end()
child.kill()
