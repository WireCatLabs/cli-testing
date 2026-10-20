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
  "cli-memo": artifact("cli-memo", "0.79.0"),
  "cli-core": artifact("cli-core", "0.367.0"),
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
  const result = command("projects", "evidence", "CCL", "--source", seeded.source)
  const found = result.answer.item
  assert.equal(found.items.length, 1)
  assert.equal(found.units.length, 5)
  assert.ok(found.units.every((unit) => unit.state === "done" && unit.pages >= 1))
  assert.equal(found.complete, true)
  assert.equal(found.checkpoint, null)
  assert.deepEqual(found.oversized, [])
  const item = found.items[0]
  const attempts = [
    {
      invocation: 1,
      items: found.items.length,
      lanes_matching_the_document: item.lanes.length,
      matched_again: found.matched_again.length,
      returned_excerpt_bytes: Buffer.byteLength(item.text),
      around_entries: (item.around ?? []).length,
      output_bytes: result.output_bytes,
      usage: found.usage,
      units: found.units,
      checkpoint_present: found.checkpoint !== null,
      complete: found.complete,
      stopped: found.stopped,
      oversized: found.oversized.length,
    },
  ]
  const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
  for (const [name, item] of Object.entries(artifacts)) {
    item.integrity = lock.packages[`node_modules/@wirecat/${name}`].integrity
    assert.ok(item.integrity)
  }
  const report = {
    classification: "large-document-read-after-fix",
    node: process.version,
    artifacts,
    source_bytes: sourceBytes,
    page_budget_bytes: 65536,
    control: { items: control.answer.item.items.length, usage: control.answer.item.usage },
    attempts,
    limits:
      "Same synthetic fixture as run.mjs, one CLI invocation on the fixed release; no owner data, remote calls, timing benchmark, memory measurement or claim about documents above 256 KiB (listed under oversized, covered by Core tests).",
  }
  mkdirSync(dirname(resolve(output)), { recursive: true })
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Large document read in one invocation; ${resolve(output)}\n`)
}
