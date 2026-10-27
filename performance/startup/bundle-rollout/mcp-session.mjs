// usage: node mcp-session.mjs <bin> <args...>   e.g. <bin> smoke mcp serve
// One MCP session over stdio: initialize, tools/list, prompts/list, resources/list. Prints the answers as JSON and
// exits 1 when the server does not answer or lists fewer than three tools, so a wrong command cannot pass as identical.
import { spawn } from "node:child_process"

const [bin, ...args] = process.argv.slice(2)
const child = spawn(process.execPath, [bin, ...args], { stdio: ["pipe", "pipe", "inherit"] })
let buffer = ""
const waiting = new Map()
child.stdout.on("data", (d) => {
  buffer += d
  for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
    const line = buffer.slice(0, i)
    buffer = buffer.slice(i + 1)
    if (!line.trim()) continue
    const message = JSON.parse(line)
    waiting.get(message.id)?.(message)
    waiting.delete(message.id)
  }
})
const fail = (why) => {
  console.error(`mcp-session: ${why}`)
  child.kill()
  process.exit(1)
}
child.on("exit", (code) => fail(`the server exited (${code}) before the session ended`))
let id = 0
const call = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id
    waiting.set(n, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`)
    setTimeout(() => waiting.has(n) && fail(`no answer to ${method} in 30 s`), 30_000).unref()
  })
const out = []
out.push(
  await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "identity", version: "1" },
  }),
)
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
const tools = await call("tools/list")
if ((tools.result?.tools?.length ?? 0) < 3) fail(`tools/list gave ${JSON.stringify(tools).slice(0, 200)}`)
out.push(tools, await call("prompts/list"), await call("resources/list"))
const printed = new Promise((resolve) => process.stdout.write(`${JSON.stringify(out, null, 1)}\n`, resolve))
child.removeAllListeners("exit")
// memo's server finishes its work before it exits on SIGTERM; the session is over, so do not wait for it.
child.kill("SIGKILL")
await printed
process.exit(0)
