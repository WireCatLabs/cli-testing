// node ab.mjs <rounds> <name>=<bin.js> ... : each read-only command run by every variant in turn, the order rotating
// each round; prints median wall and CPU (user+sys of the child) in ms. One untimed warm-up per variant and command.
import { spawnSync } from "node:child_process"
import { loadavg } from "node:os"

const [rounds, ...pairs] = process.argv.slice(2)
const variants = pairs.map((p) => p.split("="))
const commands = (process.env.COMMANDS ?? "--version|--help|config show --json|runs list --json")
  .split("|")
  .map((c) => c.split(" "))
const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }
const once = (bin, args) => {
  const t = process.hrtime.bigint()
  const r = spawnSync("/usr/bin/time", ["-f", "%U %S", process.execPath, bin, ...args], { env, encoding: "utf8" })
  const wall = Number(process.hrtime.bigint() - t) / 1e6
  const [u, s] = r.stderr.trim().split("\n").at(-1).split(" ").map(Number)
  return { wall, cpu: (u + s) * 1000, status: r.status }
}
const print = (line) => process.stdout.write(`${line}\n`)
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
print(
  `load average at start: ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
for (const args of commands) {
  const seen = Object.fromEntries(variants.map(([n]) => [n, { wall: [], cpu: [], status: 0 }]))
  for (const [, bin] of variants) once(bin, args)
  for (let i = 0; i < Number(rounds); i++)
    for (let k = 0; k < variants.length; k++) {
      const [n, bin] = variants[(i + k) % variants.length]
      const r = once(bin, args)
      seen[n].wall.push(r.wall)
      seen[n].cpu.push(r.cpu)
      seen[n].status = r.status
    }
  for (const [n] of variants)
    print(
      `${args.join(" ")}\t${n}\twall ${median(seen[n].wall).toFixed(0)}\tcpu ${median(seen[n].cpu).toFixed(0)}\texit ${seen[n].status}`,
    )
}
print(
  `load average at end: ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
