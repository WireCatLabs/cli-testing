// Usage: taskset -c 0-3 node bench.mjs <tg-cli checkout, built> [processes=9] [warm=20]
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

if (process.argv[2] === "--child") {
  const tg = process.argv[3]
  const warm = Number(process.argv[4])
  const { createProgram, run } = await import(pathToFileURL(join(tg, "dist/program.js")).href)
  const { assertSharedContracts } = await import(
    pathToFileURL(join(tg, "node_modules/@wirecat/cli-base/dist/commands/index.js")).href
  )
  const time = (fn) => {
    const start = performance.now()
    fn()
    return performance.now() - start
  }
  const timeAsync = async (fn) => {
    const start = performance.now()
    await fn()
    return performance.now() - start
  }
  let output = ""
  const quiet = { tty: false, streams: { data: (text) => (output = text), diagnostic: () => {} } }
  let program
  const first = {
    construct: time(() => {
      program = createProgram()
    }),
    assert: time(() => assertSharedContracts(program)),
    version: await timeAsync(() => run(["--version"], quiet)),
  }
  const warmRuns = { construct: [], assert: [], version: [] }
  for (let i = 0; i < warm; i++) {
    warmRuns.construct.push(
      time(() => {
        program = createProgram()
      }),
    )
    warmRuns.assert.push(time(() => assertSharedContracts(program)))
    warmRuns.version.push(await timeAsync(() => run(["--version"], quiet)))
  }
  if (!/\d+\.\d+/.test(output)) throw new Error(`--version printed ${JSON.stringify(output)}`)
  process.stderr.write(
    `${JSON.stringify({ first, warm: Object.fromEntries(Object.entries(warmRuns).map(([k, v]) => [k, median(v)])) })}\n`,
  )
} else {
  const tg = resolve(process.argv[2] ?? ".")
  const processes = Number(process.argv[3] ?? 9)
  const warm = Number(process.argv[4] ?? 20)
  const home = mkdtempSync(join(tmpdir(), "contract-bench-"))
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    XDG_CACHE_HOME: join(home, "cache"),
    MESSAGING_STORE: join(home, "wirecat.db"),
    NO_UPDATE_NOTIFIER: "1",
  }
  const samples = []
  for (let i = 0; i < processes; i++) {
    const child = spawnSync(process.execPath, [import.meta.filename, "--child", tg, String(warm)], {
      env,
      encoding: "utf8",
    })
    if (child.status !== 0) throw new Error(child.stderr)
    samples.push(JSON.parse(child.stderr.trim().split("\n").at(-1)))
  }
  const row = (pick) =>
    ["construct", "assert", "version"].map((key) => median(samples.map((sample) => pick(sample)[key])).toFixed(1))
  const line = (label, pick) =>
    `${label}${row(pick)
      .map((v) => v.padStart(13))
      .join("")}`
  process.stdout.write(
    [
      `processes=${processes} warm=${warm}`,
      "                 (a) construct  (b) assert  (c) run --version   [ms, median]",
      line("first in process ", (s) => s.first),
      line("warm             ", (s) => s.warm),
      "",
    ].join("\n"),
  )
}
