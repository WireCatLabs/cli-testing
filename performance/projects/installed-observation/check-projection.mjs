import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const temporary = resolve(process.env.TMPDIR)
assert.ok(temporary.startsWith("/var/tmp/"))
assert.equal(resolve(process.env.HOME), temporary)
const privateLabel = "Private Fixture Project"
const privateRef = "document:999991"
const privateBody = "Invented source body that must stay private"
const fixture = {
  memo: "0.79.0",
  dependencies: { core: "0.367.0", base: "0.47.1" },
  node: "v24.19.0",
  project: privateLabel,
  llm_tokens: null,
  runs: Array.from({ length: 3 }, () => ({
    unique_refs: 1,
    wall_ms: 1,
    finished_pagination: true,
    stagnation_detected: false,
    items: [
      {
        ref: privateRef,
        kind: "document",
        text: privateBody,
        text_utf8_bytes: 10,
        around: [
          { ref: privateRef, text: privateBody, text_sha256: "a", text_utf8_bytes: 2 },
          { ref: privateRef, text: privateBody, text_sha256: "b", text_utf8_bytes: 3 },
        ],
      },
    ],
    pages: [
      { scope: { sources: [{ account: privateLabel }] }, oversized: [], usage: { read_bytes: 20, around_bytes: 5 } },
    ],
  })),
}
const input = join(temporary, "fixture.json")
const script = fileURLToPath(new URL("./project-totals.mjs", import.meta.url))
const run = (value) => {
  writeFileSync(input, JSON.stringify(value))
  return spawnSync(process.execPath, [script, input], { env: process.env, encoding: "utf8" })
}
const result = run(fixture)
assert.equal(result.status, 0, result.stderr)
for (const value of [privateLabel, privateRef, privateBody]) assert.ok(!result.stdout.includes(value))
const summary = JSON.parse(result.stdout)
assert.equal(summary.phases[0].distinct_surrounding_excerpt_bytes, 5)
assert.equal(summary.phases[0].surrounding_references, 1)
assert.equal(summary.phases[0].distinct_surrounding_excerpts, 2)
assert.notEqual(run({ ...fixture, memo: privateLabel }).status, 0)
assert.notEqual(run({ ...fixture, llm_tokens: { body: privateBody } }).status, 0)
assert.equal(readFileSync(input, "utf8").includes(privateBody), true)
process.stdout.write(
  `${JSON.stringify({
    metadata_only: true,
    paragraphs_sharing_reference_preserved: true,
    invalid_version_refused: true,
    nonnumeric_token_metadata_refused: true,
    owner_data_access: false,
  })}\n`,
)
