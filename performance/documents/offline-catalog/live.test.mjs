import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { checkFixture, importedDocuments } from "./live-check.mjs"
import { initialize, releaseOf, validateManifest, workspaceEnvironment } from "./live-input.mjs"

const runner = fileURLToPath(new URL("./live.mjs", import.meta.url))
const testPackage = {
  name: "@wirecat/drive-cli",
  version: "0.7.0",
  dependencies: { "@wirecat/cli-core": "0.278.0", "@wirecat/cli-base": "0.28.2" },
}
const fixture = () => ({
  schema_version: 1,
  drive_version: "0.7.0",
  folder_id: "root",
  folders: [{ id: "root" }, { id: "nested", parents: ["root"] }],
  documents: [
    {
      id: "doc",
      parents: ["nested"],
      name: "Synthetic twin",
      markers: ["acceptance-new"],
      absent_markers: ["acceptance-old"],
      markdown_markers: ["# Acceptance"],
      min_tabs: 2,
    },
  ],
  absent_ids: ["gone"],
})
const setup = (change = {}) => {
  const workspace = mkdtempSync(join(tmpdir(), "drive-live-unit-"))
  const calls = []
  const invoke = (words, offline = true, error) => {
    calls.push({ words, offline, error })
    const [group, action, id] = words
    const item = (value) => ({ item: value })
    if (group === "sync") return item({ pending: 0 })
    if (group === "status") return item({ pending: change.pending ?? 0 })
    if (group === "folders") return { items: [{ id: "root" }, ...(change.extraRoot ? [{ id: "unrelated" }] : [])] }
    if (group === "catalog") {
      if (id === "gone") {
        assert.equal(error, "not_found")
        return { error: { code: "not_found" } }
      }
      return item({
        id,
        name: "Synthetic twin",
        parents: id === "doc" ? ["nested"] : id === "nested" ? ["root"] : [],
        ref: `${id}:stable`,
      })
    }
    if (group === "search")
      return item({
        hits: action === "acceptance-old" ? [] : [{ ref: change.wrongHit ? "other:stable" : "doc:stable" }],
      })
    if (group === "documents" && action === "list")
      return {
        items: [{ id: "doc", reference: "doc:stable" }],
        page: { mode: "page", limit: 50, has_more: false },
      }
    if (group === "documents" && action === "show")
      return item({ metadata: { id: "doc" }, text: "acceptance-new", tabs: ["one", "two"] })
    if (group === "documents" && action === "export") {
      const offset = words.indexOf(change.version && change.version !== "0.7.0" ? "--output" : "--out")
      assert.ok(offset >= 0)
      writeFileSync(words[offset + 1], "# Acceptance")
      return item({})
    }
    if (group === "documents" && action === "context")
      return item({
        tags: [{ tag: "wirecat-acceptance", origin: "owner" }],
        notes: {
          items: change.lostContext ? [] : [{ text: "Synthetic acceptance note; preserve across rename and resync." }],
        },
      })
    throw new Error("unexpected fixture command")
  }
  return {
    workspace,
    calls,
    invoke,
    manifest: validateManifest({ ...fixture(), drive_version: change.version ?? "0.7.0" }),
  }
}

test("manifest rejects unknown fields, wrong release, duplicate ids and undeclared parents", () => {
  for (const change of [
    (f) => {
      f.extra = true
    },
    (f) => {
      f.drive_version = "0.9.0"
    },
    (f) => {
      f.documents[0].id = "root"
    },
    (f) => {
      f.documents[0].parents = ["unknown"]
    },
    (f) => {
      f.folders[0].markers = ["ignored"]
    },
    (f) => {
      f.absent_ids = ["doc"]
    },
  ]) {
    const f = fixture()
    change(f)
    assert.throws(() => validateManifest(f))
  }
})
test("workspace is new, private, explicit and excludes ambient credentials/options", () => {
  const parent = mkdtempSync(join(tmpdir(), "drive-live-workspace-"))
  const path = join(parent, "isolated")
  initialize(path, "synthetic")
  assert.equal(statSync(path).mode & 0o777, 0o700)
  assert.throws(() => initialize(path, "synthetic"))
  assert.throws(() => workspaceEnvironment(path, "other"))
  const env = workspaceEnvironment(path, "synthetic")
  for (const key of [
    "NODE_OPTIONS",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "DRIVE_GOOGLE_CLIENT_SECRET",
    "DBUS_SESSION_BUS_ADDRESS",
  ])
    assert.equal(env[key], undefined)
  assert.equal(env.MESSAGING_STORE, join(path, "drive.db"))
})
test("cached verification checks hierarchy, own-source search, tabs, exports and retired ids offline", () => {
  const args = setup()
  const result = checkFixture(args)
  assert.ok(result.checks.includes("marker-finds-own-source"))
  assert.ok(result.checks.includes("old-marker-removed"))
  assert.ok(result.checks.includes("retired-source-hidden"))
  assert.ok(args.calls.every((call) => call.offline))
  assert.equal(result.references.length, 3)
})
test("reviewed 0.8 uses --output while 0.7 keeps --out", () => {
  const args = setup({ version: "0.8.0" })
  checkFixture(args)
  assert.ok(args.calls.some((call) => call.words.includes("--output")))
  assert.ok(args.calls.every((call) => !call.words.includes("--out")))
})
test("reviewed 0.11.1 requires exact shared pins and retains offline fixture checks", () => {
  assert.deepEqual(releaseOf("0.11.1"), {
    export_flag: "--output",
    memory_search: "items",
    list_queries: true,
    core: "0.288.0",
    framework: "0.33.0",
  })
  assert.throws(() => releaseOf("0.11.2"))
  const args = setup({ version: "0.11.1" })
  assert.ok(checkFixture(args).checks.includes("markdown-export"))
  assert.ok(args.calls.every((call) => call.offline))
})
test("paged import checks include sources after the first fifty and reject looping or extra pages", () => {
  const release = releaseOf("0.11.1")
  const calls = []
  const invoke = (words) => {
    calls.push(words)
    const page = Number(words.at(-1))
    return {
      items: Array.from({ length: page === 1 ? 50 : 1 }, (_, i) => ({ id: `doc-${(page - 1) * 50 + i}` })),
      page: { mode: "page", limit: 50, has_more: page === 1, ...(page === 1 ? { next_page: 2 } : {}) },
    }
  }
  const found = importedDocuments(invoke, release, 51)
  assert.equal(found.length, 51)
  assert.equal(found.at(-1).id, "doc-50")
  assert.deepEqual(
    calls.map((words) => words.at(-1)),
    ["1", "2"],
  )
  assert.throws(() =>
    importedDocuments(
      () => ({
        items: [],
        page: { mode: "page", limit: 50, has_more: true, next_page: 1 },
      }),
      release,
      51,
    ),
  )
  let attempts = 0
  assert.throws(() =>
    importedDocuments(
      () => ({
        items: [],
        page: { mode: "page", limit: 50, has_more: true, next_page: ++attempts + 1 },
      }),
      release,
      1,
    ),
  )
  assert.equal(attempts, 1)
})
test("wrong root refuses before any Google access or local annotation", () => {
  const args = setup({ extraRoot: true })
  assert.throws(() => checkFixture({ ...args, refresh: true, annotate: true }))
  assert.equal(args.calls.length, 1)
})
test("search hits in another source cannot satisfy a marker", () => {
  assert.throws(() => checkFixture(setup({ wrongHit: true })))
})
test("a pending sync, changed source identity and lost annotations fail acceptance", () => {
  assert.throws(() => checkFixture(setup({ pending: 1 })))
  assert.throws(() => checkFixture({ ...setup(), baseline: { references: [{ id: "doc", ref: "changed" }] } }))
  assert.throws(() =>
    checkFixture({ ...setup({ lostContext: true }), baseline: { references: [], annotations: true } }),
  )
})
test("explicit refresh contacts Google only for sync, then checks idempotency and context", () => {
  const args = setup()
  const result = checkFixture({ ...args, refresh: true, annotate: true })
  assert.ok(result.checks.includes("unchanged-sync-is-idempotent"))
  assert.ok(result.checks.includes("context-survives-sync"))
  assert.deepEqual(
    args.calls.filter((call) => !call.offline).map((call) => call.words),
    [["sync"], ["sync"]],
  )
})
test("entry point refuses unknown flags, missing profile and existing report before starting a CLI", () => {
  const workspace = mkdtempSync(join(tmpdir(), "drive-live-launch-"))
  const run = (args) => spawnSync(process.execPath, [runner, ...args], { encoding: "utf8" })
  assert.equal(run(["plan"]).status, 0)
  assert.notEqual(run(["plan", "--unknown"]).status, 0)
  assert.notEqual(run(["init", "--workspace", join(workspace, "missing-profile")]).status, 0)
  assert.ok(!existsSync(join(workspace, "missing-profile")))
  initialize(join(workspace, "state"), "synthetic")
  mkdirSync(join(workspace, "package"))
  writeFileSync(join(workspace, "package/package.json"), JSON.stringify(testPackage))
  writeFileSync(join(workspace, "manifest.json"), JSON.stringify(fixture()))
  const output = join(workspace, "report.json")
  writeFileSync(output, "preserve")
  const result = run([
    "check",
    "--workspace",
    join(workspace, "state"),
    "--profile",
    "synthetic",
    "--drive",
    join(workspace, "package"),
    "--manifest",
    join(workspace, "manifest.json"),
    "--output",
    output,
  ])
  assert.notEqual(result.status, 0)
  assert.ok(!result.stderr.includes("Cannot find module"))
  assert.equal(readFileSync(output, "utf8"), "preserve")
})
test("failed CLI output never leaks through stdout, diagnostics or a private failure report", () => {
  const root = mkdtempSync(join(tmpdir(), "drive-live-redaction-"))
  initialize(join(root, "workspace"), "synthetic")
  const pkg = join(root, "package")
  mkdirSync(join(pkg, "dist/bin"), { recursive: true })
  writeFileSync(join(pkg, "package.json"), JSON.stringify(testPackage))
  writeFileSync(
    join(pkg, "dist/bin/drive.js"),
    'process.stdout.write(JSON.stringify({error:{code:"synthetic_failure",message:"SYNTHETIC_TOKEN_CANARY"}})); process.stderr.write("SYNTHETIC_TOKEN_CANARY"); process.exitCode=1;',
  )
  writeFileSync(join(root, "manifest.json"), JSON.stringify(fixture()))
  const output = join(root, "report.json")
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "check",
      "--workspace",
      join(root, "workspace"),
      "--profile",
      "synthetic",
      "--drive",
      pkg,
      "--manifest",
      join(root, "manifest.json"),
      "--output",
      output,
    ],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 1)
  const report = readFileSync(output, "utf8")
  assert.equal(JSON.parse(report).stage, "folders list")
  assert.equal(statSync(output).mode & 0o777, 0o600)
  assert.ok(!`${result.stdout}${result.stderr}${report}`.includes("SYNTHETIC_TOKEN_CANARY"))
})
