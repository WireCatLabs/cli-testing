// Usage: node ab.mjs <spec.json> <rounds> [out.json]
// spec: [{ "label": "...", "argv": ["cmd", "arg", ...], "cache": "<compile cache dir>" }, ...]
// Each round runs every variant once in a shuffled order, so a load spike lands on all of them alike. Two untimed
// warm-up rounds fill each variant's own compile cache first. Every run gets a throwaway HOME, XDG folders, app
// folders and store unless the variant's argv sets its own (gcal-in.sh), and DBUS_SESSION_BUS_ADDRESS is unset.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
import { join } from "node:path"

const [specPath, roundsArg, outPath] = process.argv.slice(2)
const spec = JSON.parse(readFileSync(specPath, "utf8"))
const rounds = Number(roundsArg)
const sandbox = mkdtempSync(join(tmpdir(), "gcal-ab-"))
const home = join(sandbox, "home")
mkdirSync(join(sandbox, "store"), { recursive: true })
mkdirSync(home, { recursive: true })
const base = { ...process.env }
delete base.DBUS_SESSION_BUS_ADDRESS
Object.assign(base, {
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local/share"),
  XDG_STATE_HOME: join(home, ".local/state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  NO_UPDATE_NOTIFIER: "1",
  npm_config_update_notifier: "false",
  MESSAGING_STORE: join(sandbox, "store", "wirecat.db"),
})
for (const prefix of ["GCAL", "DRIVE", "MEMO", "TG"]) {
  base[`${prefix}_NO_UPDATE_CHECK`] = "1"
  for (const kind of ["CONFIG", "STATE", "CACHE"])
    base[`${prefix}_${kind}_DIR`] = join(sandbox, prefix.toLowerCase(), kind.toLowerCase())
}

const once = (variant) => {
  const env = { ...base, ...(variant.cache ? { NODE_COMPILE_CACHE: variant.cache } : {}) }
  const started = process.hrtime.bigint()
  const result = spawnSync(variant.argv[0], variant.argv.slice(1), { env, encoding: "utf8", maxBuffer: 1 << 28 })
  return { ms: Number(process.hrtime.bigint() - started) / 1e6, code: result.status, bytes: result.stdout.length }
}
const shuffled = (list) => {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const first = new Map()
for (let warm = 0; warm < 2; warm++) for (const variant of spec) first.set(variant.label, once(variant))
const times = new Map(spec.map((variant) => [variant.label, []]))
const loads = []
for (let round = 0; round < rounds; round++) {
  loads.push(loadavg()[0])
  for (const variant of shuffled(spec)) times.get(variant.label).push(once(variant).ms)
}
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
const rows = spec.map(({ label }) => {
  const sorted = [...times.get(label)].sort((a, b) => a - b)
  const { code, bytes } = first.get(label)
  return {
    label,
    runs: sorted.length,
    median: +quantile(sorted, 0.5).toFixed(1),
    p95: +quantile(sorted, 0.95).toFixed(1),
    min: +sorted[0].toFixed(1),
    exit: code,
    outBytes: bytes,
  }
})
const load = { min: Math.min(...loads), max: Math.max(...loads) }
for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`)
process.stdout.write(`${JSON.stringify({ load1: load })}\n`)
if (outPath) writeFileSync(outPath, `${JSON.stringify({ rounds, load1: load, rows }, null, 2)}\n`)
