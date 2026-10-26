// usage: node dev-cost.mjs <runtime-index.js> <standards/index.js> <runs> — loads the runtime half first, then times
// importing the full entry in the same process, so only the dev-only files are left to load. Median and min, in ms.
// Node's compile cache is on, as in max's bin, and one warm-up run fills it.
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [, , runtime, full, runs] = process.argv
const probe = [
  `await import(${JSON.stringify(runtime)})`,
  "const t = performance.now()",
  `await import(${JSON.stringify(full)})`,
  "console.log(performance.now() - t)",
].join("\n")
const env = { ...process.env, NODE_COMPILE_CACHE: mkdtempSync(join(tmpdir(), "compile-cache-")) }
const once = () => Number(spawnSync("node", ["--input-type=module", "-e", probe], { encoding: "utf8", env }).stdout)
once()
const times = Array.from({ length: Number(runs) }, once)
times.sort((a, b) => a - b)
const median = times[Math.floor(times.length / 2)]
process.stdout.write(`${median.toFixed(1)} ms  min ${times[0].toFixed(1)}  dev-only files after the runtime half\n`)
