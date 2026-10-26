import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const pkg = resolve(process.argv[2])
const output = resolve(process.argv[3])
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
assert.equal(metadata.name, "@wirecat/drive-cli")
const root = mkdtempSync("/var/tmp/drive-release-polish-")
const env = {
  PATH: process.env.PATH,
  HOME: root,
  MESSAGING_STORE: join(root, "store"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  NPM_CONFIG_USERCONFIG: "/dev/null",
  NO_COLOR: "1",
}
mkdirSync(env.DRIVE_CONFIG_DIR)
const config = join(env.DRIVE_CONFIG_DIR, "config.json")
const bin = join(pkg, "dist/bin/drive.js")
const guard = fileURLToPath(new URL("../drive-shared-store/guard.mjs", import.meta.url))
const checks = []
const run = (args, ok = true) => {
  const result = spawnSync(process.execPath, ["--import", guard, bin, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15000,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  if (ok) assert.equal(result.status, 0, result.stderr)
  else assert.notEqual(result.status, 0)
  assert.ok(!`${result.stdout}${result.stderr}`.includes("fixture-hidden-value-42"))
  return result
}
const json = (args, ok = true) => {
  const result = run(args, ok)
  return JSON.parse(result.stdout.trim() || result.stderr.trim())
}
const check = (name, fn) => {
  fn()
  checks.push({ name, passed: true })
}
writeFileSync(config, "invalid fixture JSON", { mode: 0o600 })
check("help ignores invalid configuration", () => assert.match(run(["--help"]).stdout, /Google Drive/))
check("version ignores invalid configuration", () => assert.equal(run(["--version"]).stdout.trim(), metadata.version))
check("discovery retains contract and effects without config", () => {
  const registry = json(["commands", "sync", "--json"])
  assert.equal(registry.contract, 3)
  assert.deepEqual(registry.commands[0].effects, { remote: "read", local: "write" })
})
writeFileSync(
  config,
  JSON.stringify({ profiles: { synthetic: { principal: "synthetic-principal", roots: [], storage: "keyring" } } }),
)
check("profile is required even when one profile exists", () =>
  assert.equal(json(["status", "--json"], false).error.reason, "profile.required"),
)
check("cached missing document refuses without network", () =>
  assert.equal(
    json(["synthetic", "--offline", "documents", "show", "missing", "--json"], false).error.code,
    "not_found",
  ),
)
check("unknown arguments are refused", () =>
  assert.equal(json(["synthetic", "status", "--invented", "--json"], false).error.code, "validation_error"),
)
check("legacy config migrates once with permissions retained", () => {
  writeFileSync(
    config,
    JSON.stringify({
      profiles: { synthetic: { principal: "synthetic-principal", roots: [], storage: "keyring", readOnly: true } },
      defaults: { maxTextChars: 2048 },
    }),
  )
  json(["synthetic", "config", "show", "--json"])
  const saved = JSON.parse(readFileSync(config, "utf8"))
  assert.equal(saved.profiles.synthetic.read_only, true)
  assert.equal(saved.defaults.max_text_chars, 2048)
  assert.equal(statSync(config).mode & 0o777, 0o600)
  const before = statSync(config, { bigint: true }).mtimeNs
  json(["synthetic", "config", "show", "--json"])
  assert.equal(statSync(config, { bigint: true }).mtimeNs, before)
})
check("bad config names key without value", () => {
  writeFileSync(config, JSON.stringify({ profiles: {}, defaults: { max_text_chars: "fixture-hidden-value-42" } }))
  const error = json(["synthetic", "config", "show", "--json"], false).error
  assert.equal(error.code, "configuration_error")
  assert.match(error.message, /max_text_chars/)
})
const result = {
  node: process.version,
  package: metadata.name,
  version: metadata.version,
  dependencies: { core: metadata.dependencies["@wirecat/cli-core"], base: metadata.dependencies["@wirecat/cli-base"] },
  bin_sha256: createHash("sha256").update(readFileSync(bin)).digest("hex"),
  checks,
}
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${checks.length} executable checks passed; ${output}\n`)
