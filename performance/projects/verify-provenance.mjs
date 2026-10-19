import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstatSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))
const allowed = new Set([
  "performance/projects/evidence/README.md",
  "performance/projects/evidence/evidence.ts",
  "performance/projects/evidence/baseline.json",
  "performance/projects/evidence/result.json",
  "performance/projects/drive-context/README.md",
  "performance/projects/drive-context/run.mjs",
  "performance/projects/drive-context/mcp.mjs",
  "performance/projects/drive-context/result.json",
  "performance/projects/drive-context/result-old-site.json",
  "performance/projects/drive-context/result-reviewed-pair.json",
  "performance/documents/drive-shared-store/guard.mjs",
  "performance/projects/isolated-state/README.md",
  "performance/projects/isolated-state/run.mjs",
  "performance/projects/isolated-state/fixture.mjs",
  "performance/projects/isolated-state/annotations.mjs",
  "performance/projects/isolated-state/result.json",
  "performance/projects/large-document/README.md",
  "performance/projects/large-document/run.mjs",
  "performance/projects/large-document/result.json",
])
const read = (path) => {
  const stat = lstatSync(path)
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 262144, "bounded ordinary file required")
  assert.equal(realpathSync(path), path, "symlink paths are refused")
  return readFileSync(path)
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const ledger = JSON.parse(read(join(root, "performance/projects/provenance.json")))
assert.equal(ledger.schema_version, 1)
assert.equal(ledger.repository, "WireCatLabs/cli-testing")
assert.ok(Array.isArray(ledger.artifacts) && ledger.artifacts.length > 0 && ledger.artifacts.length <= 32)
const ids = new Set()
let working = 0
for (const artifact of ledger.artifacts) {
  assert.ok(typeof artifact.id === "string" && !ids.has(artifact.id), "unique artifact id required")
  ids.add(artifact.id)
  assert.ok(allowed.has(artifact.path), "only allowlisted synthetic benchmark paths may be read")
  assert.match(artifact.commit, /^[a-f0-9]{40}$/)
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0 && artifact.bytes <= 262144)
  assert.equal(typeof artifact.working_copy, "boolean")
  const bytes = execFileSync("git", ["cat-file", "blob", `${artifact.commit}:${artifact.path}`], {
    cwd: root,
    maxBuffer: 262144,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      GIT_NO_LAZY_FETCH: "1",
      GIT_ALLOW_PROTOCOL: "",
      GIT_TERMINAL_PROMPT: "0",
    },
  })
  assert.equal(bytes.length, artifact.bytes, `${artifact.id}: immutable size changed`)
  assert.equal(hash(bytes), artifact.sha256, `${artifact.id}: immutable hash changed`)
  if (artifact.working_copy) {
    assert.equal(hash(read(join(root, artifact.path))), artifact.sha256, `${artifact.id}: working copy changed`)
    working++
  }
}
for (const study of ledger.studies) {
  for (const id of study.artifacts) assert.ok(ids.has(id), "study references an unknown artifact")
  if (study.reproduction_runner) assert.ok(ids.has(study.reproduction_runner))
}
process.stdout.write(
  `${ledger.artifacts.length} immutable artifact hashes and ${working} working copies match; metadata only, no package execution or network\n`,
)
