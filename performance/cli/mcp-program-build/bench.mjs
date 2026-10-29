// Usage: taskset -c 0-3 node bench.mjs <tg-cli checkout, built> [processes=9] [warm=50]
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
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
  const { definition } = await import(pathToFileURL(join(tg, "dist/program.js")).href)
  const { createProgram, run } = await import(
    pathToFileURL(join(tg, "node_modules/@wirecat/cli-core/dist/cli/index.js")).href
  )
  const silent = { out: () => {}, err: () => {} }
  let output = ""
  const quiet = {
    tty: false,
    env: process.env,
    streams: { data: (text) => (output += text), diagnostic: () => {} },
  }
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
  const commands = async () => {
    output = ""
    const code = await run(["commands", "--json"], definition, quiet)
    if (code !== 0) throw new Error(`commands --json exited ${code}`)
  }
  const first = {
    build: time(() => createProgram(definition, silent)),
    commands: await timeAsync(commands),
  }
  const shape = createHash("sha256").update(output).digest("hex").slice(0, 12)
  const runs = { build: [], commands: [] }
  for (let i = 0; i < warm; i++) {
    runs.build.push(time(() => createProgram(definition, silent)))
    runs.commands.push(await timeAsync(commands))
  }
  const warmMedians = Object.fromEntries(Object.entries(runs).map(([key, values]) => [key, median(values)]))
  process.stderr.write(`${JSON.stringify({ first, warm: warmMedians, shape, bytes: output.length })}\n`)
} else {
  const tg = resolve(process.argv[2] ?? ".")
  const processes = Number(process.argv[3] ?? 9)
  const warm = Number(process.argv[4] ?? 50)
  const home = mkdtempSync(join(tmpdir(), "program-build-bench-"))
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    XDG_CACHE_HOME: join(home, "cache"),
    TG_CONFIG_DIR: join(home, "tg-config"),
    TG_STATE_DIR: join(home, "tg-state"),
    MESSAGING_STORE: join(home, "wirecat.db"),
    NO_UPDATE_NOTIFIER: "1",
  }
  // The keyring is reached over D-Bus, not through HOME.
  delete env.DBUS_SESSION_BUS_ADDRESS
  const samples = []
  for (let i = 0; i < processes; i++) {
    const child = spawnSync(process.execPath, [import.meta.filename, "--child", tg, String(warm)], {
      env,
      encoding: "utf8",
    })
    if (child.status !== 0) throw new Error(child.stderr)
    samples.push(JSON.parse(child.stderr.trim().split("\n").at(-1)))
  }
  const cell = (pick, key) =>
    median(samples.map((sample) => pick(sample)[key]))
      .toFixed(1)
      .padStart(16)
  const shapes = [...new Set(samples.map((sample) => `${sample.shape} (${sample.bytes} bytes)`))]
  process.stdout.write(
    [
      `processes=${processes} warm=${warm}  commands --json output: ${shapes.join(", ")}`,
      "                   createProgram  run commands --json   [ms, median]",
      `first in process ${cell((s) => s.first, "build")}${cell((s) => s.first, "commands")}`,
      `warm             ${cell((s) => s.warm, "build")}${cell((s) => s.warm, "commands")}`,
      "",
    ].join("\n"),
  )
}
