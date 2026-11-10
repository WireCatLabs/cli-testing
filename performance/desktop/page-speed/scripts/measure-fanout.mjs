#!/usr/bin/env node
// A page's reads fired at once, the way Desktop's pool runs them: N servers, a call that finds none idle starts its
// own process. Compares that with every call as its own process and with a bigger pool.
// Prints timings only. Usage: node measure-fanout.mjs commands.json "<label prefix>" [runs]
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createInterface } from "node:readline"

const QUIET = ["--json", "--no-record"]
const [file, prefix, runsArg] = process.argv.slice(2)
const runs = Number(runsArg ?? 3)
const bin = process.env.MEMO_BIN ?? "memo"
const commands = JSON.parse(readFileSync(file, "utf8")).filter((c) => (c.label ?? "").startsWith(prefix))
const argvOf = (c) => (c.query == null ? [...c.argv, ...QUIET] : [...c.argv, ...QUIET, "--", c.query])
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const cold = (argv) =>
  new Promise((done) => {
    const t = performance.now()
    const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "ignore"] })
    child.stdout.on("data", () => {})
    child.on("exit", () => done(performance.now() - t))
  })

const server = () =>
  new Promise((resolve) => {
    const child = spawn(bin, ["commands", "--serve"], { stdio: ["pipe", "pipe", "ignore"] })
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    const waiting = new Map()
    let next = 1
    const s = {
      child,
      busy: false,
      send: (argv) =>
        new Promise((done) => {
          const id = next++
          waiting.set(id, done)
          child.stdin.write(`${JSON.stringify({ id, argv })}\n`)
        }),
    }
    lines.on("line", (line) => {
      const v = JSON.parse(line)
      if (v.ready) return resolve(s)
      waiting.get(v.id)?.(v)
    })
  })

const viaPool = (pool, argv) => {
  const idle = pool.find((s) => !s.busy)
  if (!idle) return cold(argv)
  idle.busy = true
  const t = performance.now()
  return idle.send(argv).then(() => {
    idle.busy = false
    return performance.now() - t
  })
}

const together = async (fn) => {
  const t = performance.now()
  await Promise.all(commands.map((c) => fn(argvOf(c))))
  return performance.now() - t
}

const out = { page: prefix, calls: commands.length }
const colds = []
for (let i = 0; i < runs; i++) colds.push(await together(cold))
out.all_cold_ms = Math.round(median(colds))
for (const size of [1, 2, commands.length]) {
  const pool = await Promise.all(Array.from({ length: size }, server))
  const xs = []
  for (let i = 0; i < runs; i++) xs.push(await together((argv) => viaPool(pool, argv)))
  out[`pool_${size}_ms`] = Math.round(median(xs))
  for (const s of pool) {
    s.child.stdin.end()
    s.child.kill()
  }
}
// One server, the calls one after another: what a single server with a queue (no spill to processes) would give.
const one = await server()
const xs = []
for (let i = 0; i < runs; i++) {
  const t = performance.now()
  for (const c of commands) await one.send(argvOf(c))
  xs.push(performance.now() - t)
}
out.one_server_queued_ms = Math.round(median(xs))
one.child.stdin.end()
one.child.kill()
process.stdout.write(`${JSON.stringify(out)}\n`)
