// Usage: BASE_MODULE=<a trivial .mjs> node cold-import.mjs <module> [runs]: median wall time of a fresh node that
// imports node:fs, node:path, node:url and BASE_MODULE, with and without <module>.
import { spawnSync } from "node:child_process"

const [mod, runs = "41"] = process.argv.slice(2)
const base =
  "await import('node:fs'); await import('node:path'); await import('node:url'); await import(" +
  JSON.stringify(process.env.BASE_MODULE ?? "node:os") +
  ");"
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const r = { without: [], with: [] }
for (let i = 0; i < Number(runs) + 3; i++)
  for (const [k, code] of [
    ["without", base],
    ["with", `${base} await import(${JSON.stringify(mod)})`],
  ]) {
    const a = performance.now()
    spawnSync(process.execPath, ["--input-type=module", "-e", code])
    const ms = performance.now() - a
    if (i >= 3) r[k].push(ms)
  }
process.stdout.write(
  `${[JSON.stringify({ module: mod.split("/").slice(-2).join("/"), runs: Number(runs), without_ms: +med(r.without).toFixed(2), with_ms: +med(r.with).toFixed(2), added_ms: +(med(r.with) - med(r.without)).toFixed(2) })].join(" ")}\n`,
)
