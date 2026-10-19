import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [prefix, output, worker] = process.argv.slice(2)
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
const packages = join(resolve(prefix), "node_modules/@wirecat")
const memo = join(packages, "cli-memo")
const require = createRequire(join(memo, "package.json"))
const artifact = (name, expected) => {
  const path = join(packages, name, "package.json")
  const { version } = JSON.parse(readFileSync(path, "utf8"))
  assert.equal(version, expected)
  return { version }
}
const artifacts = {
  "cli-memo": artifact("cli-memo", "0.76.0"),
  "cli-core": artifact("cli-core", "0.358.0"),
  "cli-base": artifact("cli-base", "0.47.1"),
}
const sourceText = "Copper Chronicle CCL Orchard review Planning digest Budget context. ".repeat(1400)
const sourceBytes = Buffer.byteLength(sourceText)
if (worker === "seed") {
  assert.ok(!existsSync(process.env.MESSAGING_STORE), "refuse an existing store")
  const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
  const store = await openStore({ env: process.env })
  try {
    const project = await store.knowledge.addProject({ name: "Copper Chronicle", key: "CCL" })
    for (const alias of ["Orchard review", "Planning digest", "Budget context"])
      await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, alias)
    await store.knowledge.addProject({ name: "Small Control", key: "SMC" })
    const folder = await store.notes.addFolder({ name: "Synthetic document limit" })
    for (const [path, text] of [
      ["large.md", sourceText],
      ["small.md", "Small Control SMC tiny evidence"],
    ])
      await store.notes.saveFileNote({ folderId: folder.id, path, title: path, text })
    process.stdout.write(JSON.stringify({ source: `notes:${folder.id}`, source_bytes: sourceBytes }))
  } finally {
    await store.close()
  }
} else {
  assert.ok(!existsSync(process.env.MESSAGING_STORE), "refuse an existing store")
  const guard = fileURLToPath(new URL("../../documents/drive-shared-store/guard.mjs", import.meta.url))
  const invoke = (entry, args) => {
    const stdout = execFileSync(process.execPath, ["--import", guard, entry, ...args], {
      env: process.env,
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return { answer: JSON.parse(stdout), output_bytes: Buffer.byteLength(stdout) }
  }
  const seeded = invoke(fileURLToPath(import.meta.url), [prefix, output, "seed"]).answer
  assert.ok(seeded.source_bytes > 65536)
  const command = (...args) => invoke(join(memo, "dist/bin/memo.js"), [...args, "--json"])
  const control = command("projects", "evidence", "SMC", "--source", seeded.source)
  assert.equal(control.answer.item.items.length, 1)
  const attempts = []
  let cursor
  let firstUnits
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = command(
      "projects",
      "evidence",
      "CCL",
      "--source",
      seeded.source,
      ...(cursor ? ["--cursor", cursor] : []),
    )
    const found = result.answer.item
    assert.equal(found.items.length, 0)
    assert.equal(found.units.length, 5)
    assert.ok(
      found.units.every(
        (unit) => unit.state === "read-limited" && unit.issue === "validation_error" && unit.pages === 0,
      ),
    )
    assert.equal(found.usage.read_bytes, 5 * 65536)
    assert.equal(found.complete, false)
    assert.ok(found.checkpoint)
    if (firstUnits) assert.deepEqual(found.units, firstUnits)
    else firstUnits = found.units
    cursor = found.checkpoint
    attempts.push({
      invocation: attempt + 1,
      resumed: found.resumed,
      items: found.items.length,
      returned_excerpt_bytes: found.items.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0),
      output_bytes: result.output_bytes,
      usage: found.usage,
      totals: found.totals,
      units: found.units,
      checkpoint_present: true,
      complete: found.complete,
      stopped: found.stopped,
    })
  }
  const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
  for (const [name, item] of Object.entries(artifacts)) {
    item.integrity = lock.packages[`node_modules/@wirecat/${name}`].integrity
    assert.ok(item.integrity)
  }
  const report = {
    classification: "known-limitation-reproduced",
    node: process.version,
    artifacts,
    source_bytes: sourceBytes,
    page_budget_bytes: 65536,
    control: { items: control.answer.item.items.length, usage: control.answer.item.usage },
    attempts,
    limits:
      "Synthetic single-source CLI replay, initial invocation plus two resumes; no owner data, remote calls, timing benchmark, producer fix, whole-document hydration proof or successful large-document retrieval claim. Charged bytes are reservations on failed reads, not returned or proven hydrated source bytes.",
  }
  mkdirSync(dirname(resolve(output)), { recursive: true })
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Known limitation reproduced across ${attempts.length} invocations; ${resolve(output)}\n`)
}
