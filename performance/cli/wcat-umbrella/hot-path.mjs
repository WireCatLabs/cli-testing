// Usage: node hot-path.mjs <cli-base dist dir> <work dir>

import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [dist, work] = process.argv.slice(2)
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const t0 = performance.now()
const start = await import(join(dist, "wcat/start.js"))
const importMs = performance.now() - t0
const { findTools } = await import(join(dist, "wcat/path.js"))
rmSync(work, { recursive: true, force: true })
const prefix = join(work, "prefix"),
  bin = join(prefix, "bin")
const pkg = join(prefix, "lib/node_modules/@wirecat/tg-cli/dist/bin")
mkdirSync(bin, { recursive: true })
mkdirSync(pkg, { recursive: true })
writeFileSync(join(pkg, "tg.js"), "", { mode: 0o755 })
symlinkSync(join(pkg, "tg.js"), join(bin, "wcat-tg"))
const script = join(prefix, "lib/node_modules/@wirecat/tg-cli/node_modules/@wirecat/cli-base/dist/wcat/start.js")
const io = {
  argv: ["node", join(bin, "wcat-tg"), "chats", "list"],
  env: { PATH: process.env.PATH },
  platform: "linux",
  script,
}
const tool = { command: "tg", version: "1.0.0", description: "x" }
process.stdout.write(`${["first run:", (await start.wcatStart(tool, io)).launcher].join(" ")}\n`)
const kept = []
for (let i = 0; i < 2000; i++) {
  const a = performance.now()
  await start.wcatStart(tool, io)
  kept.push(performance.now() - a)
}
const scan = []
for (let i = 0; i < 2000; i++) {
  const a = performance.now()
  findTools({ env: process.env, platform: "linux" })
  scan.push(performance.now() - a)
}
process.stdout.write(
  `${[JSON.stringify({ import_start_module_ms: +importMs.toFixed(3), wcatStart_kept_median_ms: +median(kept).toFixed(4), wcatStart_kept_p99_ms: +[...kept].sort((a, b) => a - b)[1979].toFixed(4), path_scan_all_wcat_median_ms: +median(scan).toFixed(4), path_entries: process.env.PATH.split(":").length })].join(" ")}\n`,
)
// cold process: node with and without importing start.js, 20 runs each, alternating
const cold = { bare: [], withStart: [] }
for (let i = 0; i < 23; i++) {
  for (const [k, code] of [
    ["bare", ""],
    ["withStart", `await import(${JSON.stringify(join(dist, "wcat/start.js"))})`],
  ]) {
    const a = performance.now()
    spawnSync(process.execPath, ["--input-type=module", "-e", code])
    const ms = performance.now() - a
    if (i >= 3) cold[k].push(ms)
  }
}
process.stdout.write(
  `${[JSON.stringify({ node_start_bare_median_ms: +median(cold.bare).toFixed(1), node_start_import_start_median_ms: +median(cold.withStart).toFixed(1) })].join(" ")}\n`,
)
