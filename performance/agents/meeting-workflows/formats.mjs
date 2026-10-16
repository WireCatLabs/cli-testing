import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { digest, runner, selectors } from "./runtime.mjs"
import { passageRequest } from "./workflow.mjs"

const { values } = parseArgs({
  options: {
    install: { type: "string" },
    results: { type: "string" },
    "run-root": { type: "string" },
    output: { type: "string" },
  },
})
for (const key of ["install", "results", "run-root", "output"]) assert.ok(values[key], `provide --${key}`)
assert.equal(existsSync(values.output), false, "choose a new output file")
const results = JSON.parse(readFileSync(values.results, "utf8"))
const install = resolve(values.install)
const guard = fileURLToPath(new URL("./guard.cjs", import.meta.url))
const source = fileURLToPath(import.meta.url)
const report = {
  schema_version: 1,
  scope: "passage output size only; excluded from timed workflow comparison",
  samples: 3,
  packages: results.packages,
  source_sha256: digest(readFileSync(source)),
  workflow_results_sha256: digest(readFileSync(values.results)),
  cases: [],
}
for (const item of results.cases) {
  const directory = resolve(values["run-root"], item.name, "seed")
  assert.ok(existsSync(join(directory, "store.db")))
  const requests = item.evidence.sources.map((hit, index) => passageRequest(hit.ref, `p${index}`))
  const tool = runner(install, directory)
  const formats = {}
  for (const format of ["json-full", "json-compact", "text", "markdown"]) {
    const samples = []
    for (let sample = 0; sample < 3; sample++) {
      if (format.startsWith("json")) {
        const answer = tool.requests(requests, "batch-full", {
          selector: format === "json-compact" ? selectors.passage : undefined,
        })
        assert.equal(answer.meta.complete, true)
        assert.ok(answer.items.every((row) => row.status === "ok"))
        samples.push(tool.calls.at(-1).stdout_bytes)
      } else {
        const result = spawnSync(
          process.execPath,
          [
            "--no-addons",
            "--require",
            guard,
            join(install, "node_modules/@wirecat/zoom-cli/dist/bin/zm.js"),
            "batch",
            "-",
            "--format",
            format,
            "--offline",
          ],
          {
            env: tool.env,
            cwd: directory,
            input: JSON.stringify({ requests }),
            encoding: "utf8",
            timeout: 30000,
            maxBuffer: 4 * 1024 * 1024,
          },
        )
        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.stderr, "")
        assert.equal(existsSync(tool.env.MEETING_BENCH_DENIED), false)
        assert.equal(existsSync(tool.env.MEETING_BENCH_LOADED), true)
        for (const cue of item.evidence.contexts) {
          for (const value of [cue.ref, cue.text, cue.speaker_name])
            assert.ok(result.stdout.includes(value), `${format} lost ${value}`)
          const second = Math.floor(cue.start_ms / 1000)
          const timestamp = [Math.floor(second / 3600), Math.floor(second / 60) % 60, second % 60]
            .map((value) => String(value).padStart(2, "0"))
            .join(":")
          assert.ok(result.stdout.includes(timestamp))
        }
        assert.equal(result.stdout.split("Cues:").length - 1, requests.length, "coverage repeated or omitted")
        assert.equal(
          result.stdout.split("archive: unknown").length - 1,
          requests.length,
          "unknown archive coverage lost",
        )
        samples.push(Buffer.byteLength(result.stdout))
      }
    }
    formats[format] = { median_stdout_bytes: [...samples].sort((a, b) => a - b)[1], samples }
  }
  report.cases.push({
    name: item.name,
    requests: requests.length,
    cues: item.evidence.contexts.length,
    formats,
    content_and_coverage_checks: "passed",
  })
}
writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`)
process.stderr.write("All passage output formats retained the checked citation and context fields.\n")
