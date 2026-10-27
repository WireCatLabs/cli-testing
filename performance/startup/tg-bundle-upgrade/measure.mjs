// node measure.mjs <script> : time to the initialize answer, RSS after 4 s, stderr
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"

const t0 = performance.now()
const c = spawn(process.execPath, [process.argv[2], "demo", "mcp"], { stdio: ["pipe", "pipe", "pipe"] })
let err = ""
c.stderr.on("data", (d) => {
  err += d
})
let initAt
c.stdout.on("data", () => {
  initAt ??= performance.now() - t0
})
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "m", version: "0" } },
}
c.stdin.write(`${JSON.stringify(initialize)}\n`)
setTimeout(() => {
  const rss = readFileSync(`/proc/${c.pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)[1]
  const result = { init_ms: Math.round(initAt), rss_mb: Math.round(rss / 1024), stderr: err.slice(0, 300) }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  c.stdin.end()
}, 4000)
