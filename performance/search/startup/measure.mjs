import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { cpus, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const args = process.argv.slice(2)
if (args[0] === "--worker") {
  const [, core, state, models, scenario] = args
  const times = {}
  const started = performance.now()
  const storeModule = await import(pathToFileURL(join(core, "dist/store/index.js")))
  times.store_import_ms = performance.now() - started
  let at = performance.now()
  const store = await storeModule.openStore({ path: join(state, "synthetic.db") })
  times.store_open_ms = performance.now() - at
  await store.close()
  if (scenario === "model") {
    at = performance.now()
    const { openEmbedder } = await import(pathToFileURL(join(core, "dist/embeddings/embed.js")))
    const { textModel } = await import(pathToFileURL(join(core, "dist/embeddings/models.js")))
    times.embed_import_ms = performance.now() - at
    at = performance.now()
    const model = await openEmbedder(textModel("e5-small"), models, { threads: 4 })
    times.model_open_ms = performance.now() - at
    at = performance.now()
    await model.embed(["A fictional invoice for a book club."], "query")
    times.first_query_ms = performance.now() - at
    at = performance.now()
    await model.embed(["A fictional invoice for a book club."], "query")
    times.warm_query_ms = performance.now() - at
    await model.close()
  }
  times.worker_total_ms = performance.now() - started
  process.stdout.write(`${JSON.stringify(times)}\n`)
} else {
  const [coreArg, modelsArg, roundsArg = "8"] = args
  if (!coreArg || !modelsArg)
    throw new Error("usage: node measure.mjs <built-cli-core-root> <downloaded-text-model-directory> [rounds]")
  const core = resolve(coreArg)
  const models = resolve(modelsArg)
  const rounds = Number(roundsArg)
  if (!Number.isInteger(rounds) || rounds < 2) throw new Error("rounds must be an integer >= 2")
  const scratch = mkdtempSync(join(tmpdir(), "search-startup-"))
  const workerEnv = {
    ...process.env,
    HOME: scratch,
    XDG_CONFIG_HOME: scratch,
    XDG_DATA_HOME: scratch,
    MESSAGING_STORE: join(scratch, "synthetic.db"),
    WIRECAT_STATE_DIR: scratch,
  }
  const prepared = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--worker", core, scratch, models, "reopen-store"],
    { encoding: "utf8", timeout: 60_000, env: workerEnv },
  )
  if (prepared.status !== 0) throw new Error(prepared.stderr || "store preparation failed")
  const raw = []
  for (let round = 0; round < rounds; round++) {
    for (const scenario of ["process", "fresh-store", "reopen-store", "model"]) {
      const started = performance.now()
      const state = scenario === "fresh-store" ? mkdtempSync(join(scratch, "fresh-")) : scratch
      const command =
        scenario === "process"
          ? ["--eval", 'console.log("{}")']
          : [fileURLToPath(import.meta.url), "--worker", core, state, models, scenario]
      const child = spawnSync(process.execPath, command, {
        encoding: "utf8",
        timeout: 60_000,
        env: {
          ...process.env,
          HOME: scratch,
          XDG_CONFIG_HOME: scratch,
          XDG_DATA_HOME: scratch,
          MESSAGING_STORE: join(state, "synthetic.db"),
          WIRECAT_STATE_DIR: scratch,
        },
      })
      if (child.status !== 0) throw new Error(child.stderr || `worker failed: ${child.status}`)
      raw.push({ scenario, round, wall_ms: performance.now() - started, ...JSON.parse(child.stdout) })
    }
  }
  const summary = {}
  for (const scenario of ["process", "fresh-store", "reopen-store", "model"]) {
    const rows = raw.filter((row) => row.scenario === scenario)
    summary[scenario] = {}
    for (const field of Object.keys(rows[0]).filter((key) => key.endsWith("_ms"))) {
      const values = rows.map((row) => row[field]).sort((a, b) => a - b)
      summary[scenario][field] = {
        p50: values[Math.floor(values.length * 0.5)],
        p95: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
      }
    }
  }
  const commit = spawnSync("git", ["-C", core, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
  const result = { node: process.version, cpu: cpus()[0]?.model, core_commit: commit, rounds, threads: 4, summary, raw }
  writeFileSync(new URL("results.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}
