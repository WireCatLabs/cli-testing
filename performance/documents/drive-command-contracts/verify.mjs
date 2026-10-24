import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const entry = resolve(process.argv[2] ?? "")
assert.ok(process.argv[2], "pass an explicitly built Drive binary")
const root = mkdtempSync(join(tmpdir(), "drive-contract-probe-"))
const env = {
  PATH: process.env.PATH,
  HOME: root,
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_DATA_HOME: join(root, "data"),
  XDG_CACHE_HOME: join(root, "cache"),
  XDG_STATE_HOME: join(root, "state"),
  DRIVE_CONFIG_DIR: join(root, "drive-config"),
  DRIVE_STATE_DIR: join(root, "drive-state"),
  DRIVE_CACHE_DIR: join(root, "drive-cache"),
  WIRECAT_STATE_DIR: join(root, "wirecat-state"),
  MESSAGING_STORE: join(root, "wirecat.db"),
  CI: "1",
}
const config = join(env.DRIVE_CONFIG_DIR, "config.json")
mkdirSync(dirname(config), { recursive: true })
writeFileSync(
  config,
  JSON.stringify({ profiles: { synthetic: { principal: "synthetic-principal", roots: [], storage: "file" } } }),
)
const run = (args, status = 0) => {
  const result = spawnSync(process.execPath, [entry, ...args], { env, encoding: "utf8", timeout: 30000 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, status, result.stderr)
  return JSON.parse((status ? result.stderr : result.stdout).trim())
}
let checks = 0
for (const [command, tail] of [
  ["download", []],
  ["export", ["--format", "pdf"]],
]) {
  const args = ["files", command, "synthetic-file", "--out", join(root, "output.bin"), ...tail, "--json"]
  assert.equal(run(["synthetic", "--dry-run", ...args]).item.dry_run, true)
  checks++
  assert.equal(run(["synthetic", "--read-only", ...args], 5).error.code, "permission_error")
  checks++
}
const state = join(env.DRIVE_STATE_DIR, "profiles", "synthetic", "state.json")
mkdirSync(dirname(state), { recursive: true })
writeFileSync(
  state,
  JSON.stringify({
    version: 1,
    principal: "synthetic-principal",
    scope: "",
    folders: {},
    documents: {},
    skipped: [
      {
        id: "synthetic-file",
        reason: "unsupported",
        file: {
          id: "synthetic-file",
          name: "SECRET-NAME",
          mime: "application/x-synthetic",
          parents: [],
          url: "https://example.invalid/synthetic-file",
          trashed: false,
          canDownload: true,
        },
      },
    ],
  }),
)
const status = run(["synthetic", "status", "--json"])
assert.equal(JSON.stringify(status).includes("SECRET-NAME"), false)
assert.deepEqual(status.item.skipped, [{ id: "synthetic-file", reason: "unsupported" }])
checks++
const registry = run(["commands", "--json"])
assert.equal(registry.contract, 4)
checks++
const tools = run(["synthetic", "mcp", "--tools", "--json"]).items
for (const name of [
  "session list",
  "config show",
  "skill show",
  "guide",
  "files download",
  "files export",
  "documents export",
]) {
  assert.ok(
    tools.some((item) => item.command === name),
    name,
  )
  checks++
}
const setter = tools.find((item) => item.command === "config set")
if (process.argv.includes("--availability")) {
  assert.ok(setter)
  assert.equal(setter.availability.available, false)
  assert.equal(setter.availability.permission, "mcp.authority")
  assert.ok(setter.availability.reason)
} else assert.equal(setter, undefined)
checks++
if (process.argv.includes("--availability")) {
  const mcp = registry.commands.find((command) => command.path.join(" ") === "mcp")
  assert.ok(mcp)
  for (const flag of ["--http", "--port", "--public-url", "--revoke"])
    assert.ok(
      mcp.options.some((option) => option.flags.split(" ")[0] === flag),
      flag,
    )
  checks++
}
for (const tool of tools)
  for (const key of Object.keys(tool.input_schema.properties)) assert.equal(key.includes("-"), false)
checks++
process.stdout.write(`${JSON.stringify({ checks, passed: true, live_requests: 0 })}\n`)
