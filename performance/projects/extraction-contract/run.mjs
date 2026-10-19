import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import "../../documents/drive-shared-store/guard.mjs"
import { cases } from "./fixtures.mjs"

const [prefix, output] = process.argv.slice(2)
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON")
const root = realpathSync(process.env.HOME)
assert.ok(root.startsWith("/var/tmp/") && root !== "/var/tmp", "use a fresh /var/tmp HOME")
for (const key of [
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "MESSAGING_STORE",
  "WIRECAT_STATE_DIR",
  "TMPDIR",
]) {
  assert.ok(process.env[key], `set isolated ${key}`)
  const child = relative(root, resolve(process.env[key]))
  assert.ok(!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`), `${key} must stay inside HOME`)
}
assert.ok(!existsSync(process.env.MESSAGING_STORE), "refuse an existing store")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const lockBytes = readFileSync(join(resolve(prefix), "package-lock.json"))
const lock = JSON.parse(lockBytes)
const packages = join(resolve(prefix), "node_modules/@wirecat")
const artifacts = {}
for (const [name, version, integrity] of [
  [
    "cli-core",
    "0.358.0",
    // biome-ignore lint/security/noSecrets: public npm tarball integrity, not a credential.
    "sha512-AdnFXfVwPP4Bs5GA3rjs9tFYP9jNeEt+OHJdd4JxzEmuqD77n3ylz+0yD8U+P61zHr3I6SgsyrX0lOdbL207LA==",
  ],
  [
    "cli-base",
    "0.47.1",
    "sha512-v6hQV0tKr9FkJenqALpMG9b06H8ZZdDCxZPhpBLAZgr/kKyy1beJBQSCQ4V3jRhRAeM0RQFv1jUlytY/BM0qeA==",
  ],
]) {
  const manifestBytes = readFileSync(join(packages, name, "package.json"))
  assert.equal(JSON.parse(manifestBytes).version, version)
  const installed = lock.packages[`node_modules/@wirecat/${name}`]
  assert.equal(installed.version, version)
  assert.equal(installed.integrity, integrity)
  artifacts[name] = { version, integrity, manifest_sha256: hash(manifestBytes) }
}
const require = createRequire(join(packages, "cli-core/package.json"))
assert.equal(
  realpathSync(require.resolve("@wirecat/cli-base")),
  realpathSync(createRequire(join(resolve(prefix), "package.json")).resolve("@wirecat/cli-base")),
)
const entry = require.resolve("@wirecat/cli-core/documents")
const { extractMemories } = await import(pathToFileURL(entry))
const validatorEntry = require.resolve("valibot")
const validatorManifest = JSON.parse(readFileSync(join(dirname(validatorEntry), "../package.json")))
assert.equal(validatorManifest.version, "1.5.0")
const results = []
for (const test of cases()) {
  let calls = 0
  let answer
  let failure
  try {
    answer = await extractMemories(test.text, async (request) => {
      calls++
      assert.equal(request.purpose, "memories")
      assert.equal(request.allowSourceQuotes, true)
      assert.equal(request.maxTokens, 6000)
      assert.equal(request.data, test.text)
      return { text: test.answer, provider: "synthetic", model: "fake-completion", tokens: 0 }
    })
  } catch (error) {
    failure = error
  }
  assert.equal(calls, test.calls ?? 1, test.id)
  assert.equal(!failure, test.accepted, test.id)
  if (failure) assert.equal(failure.code, test.code, test.id)
  else {
    assert.equal(answer.items.length, test.count, test.id)
    assert.equal(answer.provider, "synthetic")
    assert.equal(answer.model, "fake-completion")
    if (test.normalized_body) assert.equal(answer.items[0].body, test.normalized_body)
    assert.equal(Object.hasOwn(answer, "source_ref"), false)
    if (test.stripped) assert.deepEqual(Object.keys(answer.items[0]).sort(), ["body", "kind", "quote"])
  }
  results.push({
    id: test.id,
    source_kind: test.source.kind,
    external_source_ref: test.source.ref,
    input_utf16_units: test.text.length,
    input_utf8_bytes: Buffer.byteLength(test.text),
    response_utf16_units: test.answer.length,
    completion_calls: calls,
    outcome: failure ? "rejected" : "accepted",
    items: answer?.items.length ?? 0,
    error_code: failure?.code ?? null,
    risk: test.risk ?? null,
  })
}
assert.ok(!existsSync(process.env.MESSAGING_STORE), "the study must not create a store")
const fileHash = (url) => hash(readFileSync(fileURLToPath(url)))
const report = {
  classification: "synthetic-extraction-contract-not-model-quality",
  node: process.version,
  artifacts,
  installed_lock_sha256: hash(lockBytes),
  documents_entry_sha256: hash(readFileSync(entry)),
  extractor_function_sha256: hash(extractMemories.toString()),
  validator: { version: validatorManifest.version, entry_sha256: hash(readFileSync(validatorEntry)) },
  fixture_sha256: fileHash(new URL("./fixtures.mjs", import.meta.url)),
  runner_sha256: fileHash(import.meta.url),
  guard_sha256: fileHash(new URL("../../documents/drive-shared-store/guard.mjs", import.meta.url)),
  cases: results,
  total_cases: results.length,
  accepted: results.filter((item) => item.outcome === "accepted").length,
  rejected: results.filter((item) => item.outcome === "rejected").length,
  source_refs: "External synthetic labels attached by the runner; not SDK inputs/outputs or valid application locators",
  limits:
    "Fake completion only; no model/network calls, store API, proposals saved, extraction accuracy score or attribution guarantee. Installed lock digest is run-specific; registry integrity/manifest and executed function hashes do not attest the complete dependency tree.",
}
mkdirSync(dirname(resolve(output)), { recursive: true })
writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(
  `${results.length} synthetic contract cases matched; no model or store calls; ${resolve(output)}\n`,
)
