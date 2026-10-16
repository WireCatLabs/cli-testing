import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { cpus, platform, release } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { seed } from "./fixture.mjs"
import { digest, installedMetadata, runner } from "./runtime.mjs"
import { qualityProbes, workflow } from "./workflow.mjs"

const { values } = parseArgs({
  options: {
    install: { type: "string" },
    output: { type: "string" },
    rounds: { type: "string", default: "5" },
    scale: { type: "string", default: "both" },
  },
})
assert.ok(values.install && values.output, "provide --install and --output")
const rounds = Number(values.rounds)
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 10)
assert.ok(["small", "medium", "both"].includes(values.scale))
const install = resolve(values.install),
  output = resolve(values.output)
assert.ok(!existsSync(output), "output directory already exists; choose a new path")
mkdirSync(output, { recursive: true })
const here = dirname(fileURLToPath(import.meta.url)),
  metadata = installedMetadata(install)
assert.equal(metadata["zoom-cli"].version, "0.21.2")
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const report = {
  schema_version: 1,
  created_at: new Date().toISOString(),
  scope: "scripted tool workflow; no language-model reasoning or tokenizer measurement",
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpu: cpus()[0].model,
    logical_cpus: cpus().length,
  },
  packages: metadata,
  install_lock_sha256: digest(readFileSync(join(install, "package-lock.json"))),
  harness: {
    base_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: here, encoding: "utf8" }).trim(),
    files: Object.fromEntries(
      ["runtime.mjs", "fixture.mjs", "workflow.mjs", "run.mjs", "guard.cjs"].map((name) => [
        name,
        digest(readFileSync(join(here, name))),
      ]),
    ),
  },
  protocol: {
    rounds,
    index: "warm before timed runs",
    os_cache: "not flushed",
    order: "forward modes on even rounds; reversed on odd rounds",
    page_size: 3,
    passage_before: 1,
    passage_after: 1,
  },
  cases: [],
}
const sizes = [
  ["small", { meetings: 24, cues: 80 }],
  ["medium", { meetings: 120, cues: 120 }],
].filter(([name]) => values.scale === "both" || name === values.scale)
const modes = ["single-full", "batch-full", "single-compact", "batch-compact"]
for (const [name, size] of sizes) {
  const seedRoot = join(output, name, "seed")
  mkdirSync(seedRoot, { recursive: true })
  const seeded = seed(install, seedRoot, size)
  const item = {
    name,
    fixture: seeded.fixture,
    oracle: {
      query_hits: seeded.oracle.queries,
      unique_hits: 17,
      context_cues: 51,
      decision_context_cues: 48,
      foreign_meeting: seeded.oracle.foreign_meeting,
    },
    trials: [],
  }
  process.stderr.write(`${name}: fixture and oracle ready; ${seeded.fixture.setup_calls} setup calls\n`)
  let expectedDigest
  for (let round = 0; round < rounds; round++) {
    for (const mode of round % 2 ? [...modes].reverse() : modes) {
      const directory = join(output, name, `round-${round}-${mode}`)
      cpSync(seedRoot, directory, { recursive: true })
      const tool = runner(install, directory)
      const result = workflow(tool, mode, seeded.oracle)
      expectedDigest ??= result.evidence_sha256
      assert.equal(result.evidence_sha256, expectedDigest, "strategies changed retained evidence")
      if (!item.evidence) item.evidence = result.evidence
      const { evidence: _, fingerprints: __, ...trial } = result
      item.trials.push({ round, ...trial })
      process.stderr.write(
        `${name} round ${round + 1} ${mode}: ${(result.wall_ms / 1000).toFixed(2)}s, ${result.calls} calls, ${result.stdout_bytes} bytes\n`,
      )
      writeFileSync(
        join(output, "checkpoint.json"),
        `${JSON.stringify({ metadata: report.packages, case: name, completed_trials: item.trials }, null, 2)}\n`,
      )
    }
  }
  const probeRoot = join(output, name, "quality")
  cpSync(seedRoot, probeRoot, { recursive: true })
  item.quality = qualityProbes(runner(install, probeRoot), seeded.oracle)
  item.summary = Object.fromEntries(
    modes.map((mode) => {
      const trials = item.trials.filter((trial) => trial.mode === mode)
      return [
        mode,
        {
          samples: trials.length,
          median_ms: median(trials.map((t) => t.wall_ms)),
          min_ms: Math.min(...trials.map((t) => t.wall_ms)),
          max_ms: Math.max(...trials.map((t) => t.wall_ms)),
          calls: trials[0].calls,
          median_stdout_bytes: median(trials.map((t) => t.stdout_bytes)),
          median_input_bytes: median(trials.map((t) => t.input_bytes)),
          evidence_sha256: expectedDigest,
        },
      ]
    }),
  )
  report.cases.push(item)
  writeFileSync(join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`)
}
process.stderr.write(
  `Completed ${report.cases.length} fixtures; results.json contains all measured trials and correctness checks.\n`,
)
