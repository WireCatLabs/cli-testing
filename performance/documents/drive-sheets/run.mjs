import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const pkg = resolve(process.argv[2])
const output = resolve(process.argv[3])
const sourceCommit = process.argv[4] ?? null
assert.ok(sourceCommit === null || /^[a-f0-9]{40}$/.test(sourceCommit))
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
assert.equal(metadata.name, "@wirecat/drive-cli")
const root = mkdtempSync("/var/tmp/drive-sheets-acceptance-")
const bin = join(pkg, "dist/bin/drive.js")
const guard = fileURLToPath(new URL("../drive-shared-store/guard.mjs", import.meta.url))
const env = {
  PATH: process.env.PATH,
  HOME: root,
  MESSAGING_STORE: join(root, "store"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  NO_COLOR: "1",
}
const checks = []
let invocations = 0
const run = (args, error) => {
  const result = spawnSync(process.execPath, ["--import", guard, bin, ...args, "--json"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  })
  invocations++
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  const answer = JSON.parse(result.stdout.trim() || result.stderr.trim())
  assert.equal(result.status === 0, error === undefined, `${args.join(" ")}: ${result.stderr}`)
  if (error) assert.equal(answer.error.code, error)
  assert.equal(JSON.stringify(answer).includes("DO_NOT_LOG"), false)
  return answer
}
const check = (name, action) => {
  action()
  checks.push({ name, passed: true })
}
const preview = (args) => run(["verification", "--dry-run", ...args]).item
check("configuration-free Sheets discovery and generated method effects", () => {
  const tree = run(["commands", "sheets"])
  assert.deepEqual(tree.commands[0].commands.map((one) => one.name).sort(), ["add", "clear", "info", "show", "update"])
  const methods = run(["api", "list", "service:sheets"]).items
  assert.equal(methods.length, 17)
  assert.equal(methods.find((one) => one.name.endsWith(".getByDataFilter")).mutates, false)
})
check("every account action requires an explicit profile", () =>
  run(["sheets", "info", "synthetic-sheet"], "validation_error"),
)
check("native live reads preview their IDs and exact ranges", () => {
  assert.equal(preview(["sheets", "info", "synthetic-sheet"]).method, "sheets.spreadsheets.get")
  const read = preview(["sheets", "show", "synthetic-sheet", "'Quarter 1'!A1:B4", "--render", "formula"])
  assert.equal(read.parameters.range, "'Quarter 1'!A1:B4")
  assert.equal(read.parameters.value_render_option, "FORMULA")
})
check("updates, row insertion and clear preview as writes", () => {
  for (const action of ["update", "add"])
    assert.equal(
      preview(["sheets", action, "synthetic-sheet", "Budget!A1:B2", "--values", '[["=A2",1]]']).mutates,
      true,
    )
  assert.equal(preview(["sheets", "clear", "synthetic-sheet", "Budget!A1:B2"]).mutates, true)
})
check("invalid ranges, overflow, unsafe numbers and nested cells are refused", () => {
  for (const [range, values] of [
    ["Budget!A:B", "[[1]]"],
    ["Budget!A1", "[[1,2]]"],
    ["Budget!A1", "[[1e999]]"],
    ["Budget!A1", '[[{"body":"DO_NOT_LOG"}]]'],
  ])
    run(
      ["verification", "--dry-run", "sheets", "update", "synthetic-sheet", range, "--values", values],
      "validation_error",
    )
})
check("offline, read-only and unknown arguments stop execution", () => {
  run(["verification", "--offline", "sheets", "show", "synthetic-sheet", "Budget!A1"], "permission_error")
  run(["verification", "--read-only", "sheets", "clear", "synthetic-sheet", "Budget!A1"], "permission_error")
  run(["verification", "sheets", "show", "synthetic-sheet", "Budget!A1", "--unknown"], "validation_error")
})
check("raw writes need explicit acknowledgment and generated bodies retain validation", () => {
  run(
    [
      "verification",
      "--dry-run",
      "api",
      "call",
      "sheets.spreadsheets.values.clear",
      "--params",
      '{"spreadsheetId":"synthetic-sheet","range":"Budget!A1"}',
      "--body",
      "{}",
    ],
    "permission_error",
  )
  run(
    [
      "verification",
      "--dry-run",
      "api",
      "sheets-spreadsheets-values-update",
      "--spreadsheet-id",
      "synthetic-sheet",
      "--range",
      "Budget!A1",
      "--body",
      '{"values":"DO_NOT_LOG"}',
    ],
    "validation_error",
  )
})
writeFileSync(
  output,
  `${JSON.stringify(
    {
      package_version: metadata.version,
      artifact_kind: "compiled_candidate",
      source_commit: sourceCommit,
      compiled_sha256: ["commands/sheets.js", "google-api.js", "generated/manifest.js"].map((path) => ({
        path,
        sha256: createHash("sha256")
          .update(readFileSync(join(pkg, "dist", path)))
          .digest("hex"),
      })),
      node: process.version,
      bin_sha256: createHash("sha256").update(readFileSync(bin)).digest("hex"),
      invocations,
      checks,
      live_google_requests: 0,
      live_google_writes: 0,
      limits: ["Synthetic CLI previews/refusals only; no live Google or cell readback"],
    },
    null,
    2,
  )}\n`,
)
process.stdout.write(`${checks.length} checks passed in ${invocations} guarded CLI invocations\n`)
