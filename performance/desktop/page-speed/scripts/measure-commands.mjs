#!/usr/bin/env node
// Times read-only memo commands as a cold process and through one `memo commands --serve` server.
// Prints only timings, byte sizes and row counts: never an answer's content.
// Usage: node measure-commands.mjs commands.json [runs]
import { spawn, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createInterface } from "node:readline"

const QUIET = ["--json", "--no-record"]
const file = process.argv[2]
const runs = Number(process.argv[3] ?? 3)
const bin = process.env.MEMO_BIN ?? "memo"
const commands = JSON.parse(readFileSync(file, "utf8"))

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const shape = (stdout) => {
  try {
    const v = JSON.parse(stdout)
    const items = Array.isArray(v.items) ? v.items.length : Array.isArray(v) ? v.length : null
    return { rows: items, total: v.page?.total?.value ?? null, ok: !v.error }
  } catch {
    return { rows: null, total: null, ok: false }
  }
}

const argvOf = (c) => {
  const [head, query] = Array.isArray(c) ? [c, null] : [c.argv, c.query]
  return query == null ? [...head, ...QUIET] : [...head, ...QUIET, "--", query]
}

const label = (c) => (Array.isArray(c) ? c.join(" ") : (c.label ?? c.argv.join(" ")))

const cold = (argv) => {
  const t = performance.now()
  const r = spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
  return { ms: performance.now() - t, bytes: Buffer.byteLength(r.stdout ?? ""), code: r.status, ...shape(r.stdout) }
}

const startServer = () =>
  new Promise((resolve, reject) => {
    const t = performance.now()
    const child = spawn(bin, ["commands", "--serve"], { stdio: ["pipe", "pipe", "ignore"] })
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    const waiting = new Map()
    let ready = false
    lines.on("line", (line) => {
      let v
      try {
        v = JSON.parse(line)
      } catch {
        return
      }
      if (!ready && v.ready) {
        ready = true
        resolve({ child, startMs: performance.now() - t, send })
        return
      }
      waiting.get(v.id)?.(v)
      waiting.delete(v.id)
    })
    child.on("exit", (code) => !ready && reject(new Error(`server exited ${code}`)))
    let next = 1
    const send = (argv) =>
      new Promise((done) => {
        const id = next++
        const t0 = performance.now()
        waiting.set(id, (v) =>
          done({
            ms: performance.now() - t0,
            bytes: Buffer.byteLength(v.stdout ?? ""),
            code: v.code,
            ...shape(v.stdout),
          }),
        )
        child.stdin.write(`${JSON.stringify({ id, argv })}\n`)
      })
  })

const results = []
for (const c of commands) {
  const argv = argvOf(c)
  const colds = Array.from({ length: runs }, () => cold(argv))
  results.push({ label: label(c), argv, colds })
}

const server = await startServer()
process.stderr.write(`${`server ready in ${server.startMs.toFixed(0)} ms, pid ${server.child.pid}`}\n`)
for (const r of results) {
  r.served = []
  for (let i = 0; i < runs; i++) r.served.push(await server.send(r.argv))
}
server.child.stdin.end()
server.child.kill()

const rows = results.map((r) => ({
  command: r.label,
  cold_ms: Math.round(median(r.colds.map((x) => x.ms))),
  served_ms: Math.round(median(r.served.map((x) => x.ms))),
  rows: r.served[0].rows,
  total: r.served[0].total,
  kb: Math.round(r.served[0].bytes / 1024),
  ok: r.served[0].ok && r.served[0].code === 0,
}))
process.stdout.write(`${JSON.stringify({ serverStartMs: Math.round(server.startMs), rows }, null, 1)}\n`)
