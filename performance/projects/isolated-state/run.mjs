import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { capture, logical, restore } from "./annotations.mjs"
import { addAnnotations, seed, sharedState } from "./fixture.mjs"

const [prefix, output] = process.argv.slice(2)
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON")
const root = realpathSync(process.env.HOME)
assert.ok(root.startsWith(`/var/tmp/${sep === "/" ? "" : sep}`) && root !== "/var/tmp", "use a fresh /var/tmp HOME")
for (const name of ["source.db", "target-1.db", "target-2.db", "overflow.db"])
  assert.ok(!existsSync(join(root, name)), "use fresh stores; existing datasets are never reset")
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
globalThis.fetch = async () => {
  throw new Error("network disabled for synthetic restore")
}
const installed = join(resolve(prefix), "node_modules/@wirecat/cli-core")
const require = createRequire(join(installed, "package.json"))
const core = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"))
const basePath = require.resolve("@wirecat/cli-base")
const base = JSON.parse(readFileSync(resolve(basePath, "../../package.json"), "utf8"))
assert.equal(core.version, "0.358.0")
assert.equal(base.version, "0.47.1")
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const fixtures = []
const checks = []
const check = async (name, run) => {
  await run()
  checks.push(name)
}
try {
  const source = await seed(openStore, join(root, "source.db"))
  fixtures.push(source)
  await addAnnotations(source)
  const manifest = await capture(source)
  assert.ok(!JSON.stringify(manifest).includes("SOURCE_BODY_NOT_FOR_EXPORT"))
  const sourceBefore = await sharedState(source)
  const beforeManifest = JSON.stringify(manifest)
  const manifestPath = join(root, "derived-manifest.json")
  writeFileSync(manifestPath, `${beforeManifest}\n`, { mode: 0o600 })
  const frozen = JSON.parse(readFileSync(manifestPath, "utf8"))
  await check("manifest excludes source bodies and declares its supported subset", () => {
    assert.equal(frozen.coverage.completeness, "supported-subset-only")
    assert.equal(frozen.coverage.truncated, false)
    assert.equal(frozen.excluded.includes("tasks"), true)
  })
  let receipt
  for (const ordinal of [1, 2]) {
    const target = await seed(openStore, join(root, `target-${ordinal}.db`), true)
    fixtures.push(target)
    const before = await sharedState(target)
    const bindings = Object.fromEntries(
      Object.entries(manifest.reused).map(([kind, ref]) => [
        ref,
        { project: target.project.ref, person: target.personRef, source: target.sourceRef }[kind],
      ]),
    )
    assert.notEqual(target.project.ref, source.project.ref)
    assert.notEqual(target.sourceRef, source.sourceRef)
    await check(`target ${ordinal}: missing bindings fail before annotation writes`, async () => {
      const empty = await capture(target)
      await assert.rejects(restore(frozen, target, {}))
      assert.deepEqual(await capture(target), empty)
    })
    receipt = await restore(frozen, target, bindings)
    await check(`target ${ordinal}: logical derived state survives remapped references`, async () => {
      assert.equal(logical(await capture(target)), logical(frozen))
    })
    await check(`target ${ordinal}: shared person, source and unrelated state are unchanged`, async () => {
      assert.deepEqual(await sharedState(target), before)
    })
    await check(`target ${ordinal}: proposed facts and links stay unconfirmed`, async () => {
      const result = await capture(target)
      assert.ok(result.links.every((link) => link.confirmed === false))
      assert.ok(result.facts.every((fact) => fact.status === "proposed"))
      await assert.rejects(restore(frozen, target, bindings), /fresh annotation target/)
    })
  }
  await check("source annotations and shared records remain unchanged", async () => {
    assert.equal(JSON.stringify(await capture(source)), beforeManifest)
    assert.deepEqual(await sharedState(source), sourceBefore)
  })
  const overflow = await seed(openStore, join(root, "overflow.db"))
  fixtures.push(overflow)
  for (let index = 0; index < 9; index++)
    await overflow.store.knowledge.addVocabularyAlias({ kind: "project", id: overflow.project.id }, `Overflow ${index}`)
  await check("an over-bound subset is refused instead of silently truncated", async () => {
    await assert.rejects(capture(overflow), /explicit bounds/)
  })
  const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
  const report = {
    node: process.version,
    artifacts: Object.fromEntries(
      ["cli-core", "cli-base"].map((name) => [
        name,
        {
          version: name === "cli-core" ? core.version : base.version,
          integrity: lock.packages[`node_modules/@wirecat/${name}`].integrity,
        },
      ]),
    ),
    manifest_sha256: createHash("sha256").update(beforeManifest).digest("hex"),
    checks,
    receipt,
    coverage: frozen.coverage,
    excluded: frozen.excluded,
    qualification:
      "Synthetic explicit-binding reconstruction only; no production importer, atomic rollback, history fidelity, retrieval benchmark, AI, owner data or destructive reset.",
  }
  mkdirSync(resolve(output, ".."), { recursive: true })
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${checks.length} checks passed; ${resolve(output)}\n`)
} finally {
  for (const fixture of fixtures) await fixture.store.close()
}
