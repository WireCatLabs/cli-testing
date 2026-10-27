// usage: node ab.mjs <rounds> <name>=<shell command> ...
// Runs each command once untimed, then <rounds> rounds pinned to CPUs 0-3, the order rotating each round.
// Prints the median wall and CPU (user + system) time per variant, in ms.
import { spawnSync } from "node:child_process"

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const [roundsArg, ...specs] = process.argv.slice(2)
const rounds = Number(roundsArg)
const variants = specs.map((spec) => {
  const at = spec.indexOf("=")
  return { name: spec.slice(0, at), command: spec.slice(at + 1), wall: [], cpu: [] }
})
const once = (command) => {
  const started = process.hrtime.bigint()
  const result = spawnSync(
    "/usr/bin/time",
    ["-f", "%U %S", "taskset", "-c", "0-3", "sh", "-c", `${command} >/dev/null 2>/dev/null`],
    {
      encoding: "utf8",
    },
  )
  const wall = Number(process.hrtime.bigint() - started) / 1e6
  const [user, system] = result.stderr.trim().split("\n").at(-1).split(" ").map(Number)
  return { wall, cpu: (user + system) * 1000 }
}
for (const v of variants) once(v.command)
for (let round = 0; round < rounds; round++)
  for (let i = 0; i < variants.length; i++) {
    const v = variants[(i + round) % variants.length]
    const { wall, cpu } = once(v.command)
    v.wall.push(wall)
    v.cpu.push(cpu)
  }
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
for (const v of variants)
  log(
    `${v.name.padEnd(28)} wall ${String(Math.round(median(v.wall))).padStart(5)} ms   cpu ${String(Math.round(median(v.cpu))).padStart(5)} ms`,
  )
