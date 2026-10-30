// Usage: node mcp-time.mjs <runs> <tool> <argsJson> -- <cmd> [args...]
// Spawns an MCP stdio server, times: spawn→initialize answer, tools/list, and one tools/call. Prints median/p95.
import { spawn } from "node:child_process"

const [runsArg, tool, argsJson, separator, cmd, ...args] = process.argv.slice(2)
if (separator !== "--") throw new Error("usage: mcp-time.mjs <runs> <tool> <argsJson> -- <cmd> [args...]")
const once = () =>
  new Promise((resolve, reject) => {
    const t0 = performance.now()
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] })
    let buf = ""
    const marks = {}
    const waiting = new Map()
    child.stdout.on("data", (chunk) => {
      buf += chunk
      for (let at = buf.indexOf("\n"); at >= 0; at = buf.indexOf("\n")) {
        const line = buf.slice(0, at)
        buf = buf.slice(at + 1)
        if (!line.trim()) continue
        const msg = JSON.parse(line)
        waiting.get(msg.id)?.(msg)
      }
    })
    let err = ""
    child.stderr.on("data", (c) => (err += c))
    const ask = (id, method, params) =>
      new Promise((ok) => {
        waiting.set(id, ok)
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
      })
    ;(async () => {
      await ask(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "bench", version: "0" },
      })
      marks.initialize = performance.now() - t0
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
      let t = performance.now()
      const list = await ask(2, "tools/list", {})
      marks.list = performance.now() - t
      marks.tools = list.result?.tools?.map((one) => one.name)
      t = performance.now()
      const call = await ask(3, "tools/call", { name: tool, arguments: JSON.parse(argsJson) })
      marks.call = performance.now() - t
      marks.callError = call.error ?? call.result?.isError ?? false
      marks.callBytes = JSON.stringify(call).length
      marks.sample = JSON.stringify(call).slice(0, 300)
      child.stdin.end()
      child.kill("SIGTERM")
      resolve(marks)
    })().catch(reject)
    setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`timeout; stderr: ${err.slice(0, 500)}`))
    }, 60_000).unref()
  })
const runs = Number(runsArg)
const all = []
for (let i = 0; i < runs + 1; i++) all.push(await once())
const first = all.shift()
const stat = (key) => {
  const v = all.map((m) => m[key]).sort((a, b) => a - b)
  const q = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)]
  return { median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1) }
}
process.stdout.write(
  `${JSON.stringify({ runs, initialize: stat("initialize"), list: stat("list"), call: stat("call"), tools: first.tools, callError: first.callError, callBytes: first.callBytes })}\n`,
)
if (process.env.BENCH_SHOW) process.stderr.write(`${first.sample}\n`)
