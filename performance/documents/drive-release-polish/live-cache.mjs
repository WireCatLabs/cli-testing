import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const [packagePath, workspacePath, profile, reportPath] = process.argv.slice(2)
assert.ok(
  packagePath && workspacePath && profile && reportPath,
  "supply package, isolated workspace, explicit profile and new report path",
)
const workspace = realpathSync(workspacePath)
assert.ok(
  workspace.startsWith("/var/tmp/") || workspace.startsWith("/tmp/"),
  "use a fresh temporary acceptance workspace",
)
assert.ok(!existsSync(reportPath), "report already exists")
const pkg = resolve(packagePath)
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
assert.equal(metadata.name, "@wirecat/drive-cli")
const env = {
  PATH: process.env.PATH,
  HOME: workspace,
  MESSAGING_STORE: join(workspace, "store"),
  WIRECAT_STATE_DIR: join(workspace, "state"),
  DRIVE_CONFIG_DIR: join(workspace, "config"),
  DRIVE_STATE_DIR: join(workspace, "drive-state"),
  DRIVE_CACHE_DIR: join(workspace, "cache"),
  NPM_CONFIG_USERCONFIG: "/dev/null",
  NO_COLOR: "1",
}
const guard = fileURLToPath(new URL("../drive-shared-store/guard.mjs", import.meta.url))
let invocations = 0
const run = (args) => {
  const result = spawnSync(
    process.execPath,
    ["--import", guard, join(pkg, "dist/bin/drive.js"), profile, "--offline", ...args, "--json"],
    {
      env,
      cwd: workspace,
      encoding: "utf8",
      timeout: 30000,
    },
  )
  // A process error can quote its arguments, which here contain private source IDs or a query.
  assert.ok(
    !result.error && result.signal === null && result.status === 0,
    "cached command failed; private output withheld",
  )
  const answer = JSON.parse(result.stdout)
  assert.equal(answer.meta?.complete, true, "cached invocation was incomplete")
  invocations += 1
  return answer
}
const status = run(["status"]).item
const roots = run(["folders", "list"]).items
assert.equal(roots.length, 1, "acceptance uses one explicitly selected root")
const listed = run(["documents", "list", "--limit", "5"]).items
assert.ok(listed.length > 0, "import a bounded batch before cached acceptance")
let inspected = 0
let matched = 0
for (const source of listed) {
  const shown = run(["documents", "show", source.id]).item
  assert.equal(shown.metadata.id, source.id)
  assert.ok(shown.metadata.url.startsWith("https://"))
  assert.ok(Array.isArray(shown.tabs))
  inspected += 1
  const word = shown.text?.match(/[\p{L}]{8,}/u)?.[0]
  if (!word) continue
  const search = run(["search", word, "--exact", "--limit", "100"]).item
  assert.ok(
    search.hits.some((hit) => hit.ref === source.reference && hit.source_url === shown.metadata.url),
    "exact search did not return its cached source",
  )
  matched += 1
}
assert.ok(matched > 0, "no source supplied a searchable word")
const report = {
  drive: metadata.version,
  core: metadata.dependencies["@wirecat/cli-core"],
  data: "owner-selected sources; aggregate-only report",
  invocations,
  selected_roots: roots.length,
  cached_sources_inspected: inspected,
  sources_found_by_exact_search: matched,
  pending_source_operations: status.pending,
  full_scope_import_completed: status.pending === 0,
  network_browser_keyring_denied: true,
  remote_writes: false,
}
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 })
process.stdout.write(JSON.stringify(report) + "\n")
