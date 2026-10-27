// usage: node bench.mjs <rounds> <commands.json> <before bin> <after bin>
// commands.json: { "setup": [[...args]], "commands": [[...args], ...] }. Each variant gets its own empty HOME, XDG
// folders, MESSAGING_STORE and TMPDIR; the setup commands run once, untimed. warm: one compile cache folder per
// variant, filled by an untimed run; cold: an empty cache folder for every run. Each command runs once per variant per
// round, pinned to CPUs 0-3, the variant order alternating each round. Prints the load per round and the median wall
// and CPU (user + system) per mode, command and variant, in ms.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const say = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)
const note = (...parts) => process.stderr.write(`${parts.join(" ")}\n`)

const [roundsArg, plan, beforeBin, afterBin] = process.argv.slice(2)
const rounds = Number(roundsArg)
const { setup = [], commands } = JSON.parse(readFileSync(plan, "utf8"))
const load = () => readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).join(" ")
const PREFIXES = ["TG", "MAX", "WA", "ZM", "ZOOM", "MEMO", "DRIVE", "GCAL", "WHATSAPP"]

const variants = [
  ["before", beforeBin],
  ["after", afterBin],
].map(([name, bin]) => {
  const home = mkdtempSync(join(tmpdir(), `bundle-${name}-`))
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_STATE_HOME: join(home, ".local/state"),
    XDG_CACHE_HOME: join(home, ".cache"),
    MESSAGING_STORE: join(home, "store.db"),
    WIRECAT_STATE_DIR: join(home, "wirecat"),
    TMPDIR: join(home, "tmp"),
    ...Object.fromEntries(PREFIXES.map((prefix) => [`${prefix}_NO_UPDATE_CHECK`, "1"])),
  }
  mkdirSync(env.TMPDIR, { recursive: true })
  for (const args of setup) spawnSync(bin, args, { env: { ...env, NODE_COMPILE_CACHE: join(home, "ncc") } })
  return { name, bin, home, env }
})

const once = (variant, args, cache) => {
  const started = process.hrtime.bigint()
  const result = spawnSync("/usr/bin/time", ["-f", "%U %S", "taskset", "-c", "0-3", variant.bin, ...args], {
    encoding: "utf8",
    env: { ...variant.env, NODE_COMPILE_CACHE: cache },
  })
  const wall = Number(process.hrtime.bigint() - started) / 1e6
  const [user, system] = result.stderr.trim().split("\n").at(-1).split(" ").map(Number)
  return { wall, cpu: (user + system) * 1000 }
}

const times = {}
const loads = []
for (const mode of ["warm", "cold"]) {
  for (const v of variants) for (const args of commands) once(v, args, join(v.home, "ncc"))
  for (let round = 0; round < rounds; round++) {
    const at = load()
    loads.push(at)
    note(`${mode} round ${round + 1}: load ${at}`)
    for (const args of commands) {
      const order = round % 2 === 0 ? variants : [...variants].reverse()
      for (const v of order) {
        const cache = mode === "warm" ? join(v.home, "ncc") : mkdtempSync(join(v.home, "cold-"))
        const key = `${mode}\t${args.join(" ")}\t${v.name}`
        times[key] ??= { wall: [], cpu: [] }
        const { wall, cpu } = once(v, args, cache)
        times[key].wall.push(wall)
        times[key].cpu.push(cpu)
      }
    }
  }
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const ones = loads.map((l) => Number(l.split(" ")[0]))
say(`load average (1 min) over the rounds: ${Math.min(...ones)}–${Math.max(...ones)}`)
for (const [key, { wall, cpu }] of Object.entries(times))
  say(`${key}\twall ${Math.round(median(wall))}\tcpu ${Math.round(median(cpu))}`)
