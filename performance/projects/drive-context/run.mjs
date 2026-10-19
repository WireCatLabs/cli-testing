import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { checkMcp } from "./mcp.mjs"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "drive-version": { type: "string" }, "memo-version": { type: "string" } },
})
const [prefix, output, worker, profile = "primary", phase = "initial"] = positionals
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON [--drive-version VERSION --memo-version VERSION]")
const expectedDrive =
  worker === "sync" ? process.env.DRIVE_CONTEXT_DRIVE_VERSION : (values["drive-version"] ?? "0.17.1")
const expectedMemo = worker === "sync" ? process.env.DRIVE_CONTEXT_MEMO_VERSION : (values["memo-version"] ?? "0.75.0")
for (const [field, version] of [
  ["drive-version", expectedDrive],
  ["memo-version", expectedMemo],
])
  assert.match(version ?? "", /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, `${field}: use an exact stable version`)
const packages = join(resolve(prefix), "node_modules/@wirecat")
const drive = join(packages, "drive-cli")
const memo = join(packages, "cli-memo")
const guard = fileURLToPath(new URL("../../documents/drive-shared-store/guard.mjs", import.meta.url))
for (const [name, directory, expected] of [
  ["drive-cli", drive, expectedDrive],
  ["cli-memo", memo, expectedMemo],
]) {
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
  assert.equal(manifest.version, expected, `${name}: this acceptance run pins its measured version`)
}

if (worker === "sync") {
  const { createProgram } = await import(pathToFileURL(join(drive, "dist/index.js")))
  const now = Number(process.env.FIXTURE_NOW)
  const ago = (days) => new Date(now - days * 86400000).toISOString()
  let reads = 0
  let result = ""
  const file = (id, folder = false) => ({
    id,
    name: folder ? "Synthetic selected folder" : `Cobalt Orchard ${id}`,
    mime: folder ? "application/vnd.google-apps.folder" : "application/vnd.google-apps.document",
    parents: folder ? [] : ["fixture-root"],
    version: phase === "updated" && id === "recent" ? "2" : "1",
    modifiedAt: ago(id === "old" ? 200 : 2),
    url: `https://docs.google.com/document/d/synthetic-${profile}-${id}/edit`,
    trashed: false,
    canDownload: true,
  })
  const ids = profile === "primary" ? ["recent", "old"] : ["other"]
  const source = {
    identity: async () => `synthetic-${profile}`,
    metadata: async (id) => file(id, id === "fixture-root"),
    children: async () => ids.map((id) => file(id)),
    startToken: async () => "fixture-start",
    changes: async () => ({
      items:
        phase === "updated"
          ? [{ id: "recent", removed: false, file: file("recent") }]
          : phase === "removed"
            ? [{ id: "recent", removed: true }]
            : [],
      cursor: `fixture-${phase}`,
    }),
    content: async (id) => {
      reads++
      const text = `Cobalt Orchard ${id} ${phase === "updated" ? "revised" : "original"} evidence`
      return { metadata: file(id), text, markdown: text, tabs: [{ id: "tab-a", title: "Plan", text }] }
    },
    bytes: async () => {
      throw new Error("no synthetic assets")
    },
  }
  const program = createProgram({
    env: process.env,
    source: async () => source,
    streams: {
      data: (text) => {
        result += text
      },
      diagnostic: () => {},
    },
  })
  await program.parseAsync([profile, "sync", "--json"], { from: "user" })
  const answer = JSON.parse(result)
  assert.equal(answer.item.pending, 0)
  assert.deepEqual(answer.item.errors, [])
  process.stdout.write(JSON.stringify({ reads, saved: answer.item.saved, removed: answer.item.removed }))
} else {
  const root = mkdtempSync(join(tmpdir(), "drive-context-"))
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "xdg-state"),
    MESSAGING_STORE: join(root, "shared.db"),
    WIRECAT_STATE_DIR: join(root, "state"),
    TMPDIR: root,
    DRIVE_CONFIG_DIR: join(root, "drive-config"),
    DRIVE_STATE_DIR: join(root, "drive-state"),
    DRIVE_CACHE_DIR: join(root, "drive-cache"),
    MEMO_CONFIG_DIR: join(root, "memo-config"),
    FIXTURE_NOW: String(Date.now()),
    DRIVE_CONTEXT_DRIVE_VERSION: expectedDrive,
    DRIVE_CONTEXT_MEMO_VERSION: expectedMemo,
    NO_COLOR: "1",
  }
  mkdirSync(env.DRIVE_CONFIG_DIR, { recursive: true })
  writeFileSync(
    join(env.DRIVE_CONFIG_DIR, "config.json"),
    JSON.stringify({
      profiles: Object.fromEntries(
        ["primary", "secondary"].map((name) => [
          name,
          {
            principal: `synthetic-${name}`,
            roots: ["fixture-root"],
            storage: "keyring",
          },
        ]),
      ),
    }),
    { mode: 0o600 },
  )
  const invoke = (entry, args) =>
    JSON.parse(
      execFileSync(process.execPath, ["--import", guard, entry, ...args], {
        env,
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      }),
    )
  const sync = (name, state) => invoke(fileURLToPath(import.meta.url), [prefix, output, "sync", name, state])
  const command = (...args) => invoke(join(memo, "dist/bin/memo.js"), [...args, "--json"])
  const gather = (source = "drive:primary", extra = []) =>
    command("projects", "evidence", "COB", "--source", source, ...extra).item
  const checks = []
  const check = (name, body) => {
    body()
    checks.push(name)
  }
  command("projects", "add", "Cobalt Orchard", "--key", "COB")
  const firstSync = sync("primary", "initial")
  sync("secondary", "initial")
  const first = gather()
  check("Drive public sync adapter feeds Memo project gathering", () => assert.equal(first.items.length, 1))
  const ref = first.items[0].ref
  check("stable canonical document reference", () => assert.match(ref, /^document:[1-9]\d*$/))
  check("Google provenance and real source time", () => {
    assert.equal(first.items[0].url, "https://docs.google.com/document/d/synthetic-primary-recent/edit")
    assert.equal(first.items[0].time_kind, "source-modified")
    assert.equal(first.items[0].at, Number(env.FIXTURE_NOW) - 2 * 86400000)
  })
  check("explicit profile excludes another principal", () => {
    assert.equal(gather("drive:secondary").items.length, 1)
    assert.notEqual(gather("drive:secondary").items[0].ref, ref)
  })
  check("old source imported today remains outside default window", () => {
    assert.equal(gather("drive:primary", ["--since-time", "365d"]).items.length, 2)
  })
  const retry = sync("primary", "unchanged")
  check("unchanged sync reads no source bodies and keeps identity", () => {
    assert.equal(retry.reads, 0)
    assert.deepEqual(
      gather().items.map((item) => item.ref),
      [ref],
    )
  })
  await checkMcp(join(memo, "dist/bin/memo.js"), guard, env, ref)
  checks.push(
    "real stdio MCP returns the same cited document and complete envelope",
    "MCP refuses unknown arguments naming the field",
  )
  const updated = sync("primary", "updated")
  check("changed source retains reference and refreshes body", () => {
    assert.equal(updated.reads, 1)
    const item = gather().items[0]
    assert.equal(item.ref, ref)
    assert.match(item.text, /revised/)
  })
  sync("primary", "removed")
  check("removed source stops matching; other principal remains", () => {
    assert.equal(gather().items.length, 0)
    assert.equal(gather("drive:secondary").items.length, 1)
  })
  const version = (directory) => JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version
  const coreVersion = (directory) => {
    const require = createRequire(join(directory, "package.json"))
    const path = require.resolve("@wirecat/cli-core/store")
    return version(resolve(path, "../../.."))
  }
  const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
  const report = {
    node: process.version,
    artifacts: Object.fromEntries(
      [
        ["drive-cli", drive],
        ["cli-memo", memo],
      ].map(([name, directory]) => [
        name,
        {
          version: version(directory),
          core: coreVersion(directory),
          integrity: lock.packages[`node_modules/@wirecat/${name}`]?.integrity ?? null,
          entry_sha256: createHash("sha256")
            .update(readFileSync(join(directory, `dist/bin/${name === "cli-memo" ? "memo" : "drive"}.js`)))
            .digest("hex"),
        },
      ]),
    ),
    checks,
    source_reads_initial: firstSync.reads,
    source_reads_unchanged: retry.reads,
    coverage:
      "synthetic Drive source injection, real ingestion/index and Memo CLI/stdio MCP; no OAuth, live conversion, AI or project proposals",
  }
  for (const artifact of Object.values(report.artifacts)) assert.ok(artifact.integrity, "record registry integrity")
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${checks.length} checks passed; ${resolve(output)}\n`)
}
