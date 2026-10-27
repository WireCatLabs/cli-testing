// One stdio MCP session, as an agent app holds it: initialize, then stay open until the stop file appears.
import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"

const [tg, profile, pidFile, stopFile] = process.argv.slice(2)
const child = spawn(tg, [profile, "mcp", "serve"], { stdio: ["pipe", "pipe", "inherit"] })
let buffer = ""
child.stdout.on("data", (chunk) => {
  buffer += chunk
  for (const line of buffer.split("\n").slice(0, -1)) process.stdout.write(`client got: ${line.slice(0, 160)}\n`)
  buffer = buffer.slice(buffer.lastIndexOf("\n") + 1)
})
child.stdin.write(
  `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } })}\n`,
)
writeFileSync(pidFile, String(child.pid))
const timer = setInterval(() => {
  if (!existsSync(stopFile)) return
  clearInterval(timer)
  child.stdin.end()
}, 500)
child.on("exit", (code) => process.stdout.write(`session exited ${code}\n`))
