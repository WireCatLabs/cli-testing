import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const [candidate, profile, configHome, destination, consent] = process.argv.slice(2)
assert.equal(consent, "--allow-live-writes", "Explicit --allow-live-writes is required")
assert.ok(
  candidate && profile && configHome && destination,
  "Pass candidate, profile, config home and private output directory",
)
const pkg = resolve(candidate)
const root = resolve(destination)
mkdirSync(root, { mode: 0o700 })
const env = {
  ...process.env,
  HOME: root,
  XDG_CONFIG_HOME: resolve(configHome),
  XDG_STATE_HOME: join(root, "xdg-state"),
  XDG_CACHE_HOME: join(root, "xdg-cache"),
  MESSAGING_STORE: join(root, "store"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  NODE_OPTIONS: "",
  NO_COLOR: "1",
}
for (const key of ["DRIVE_CONFIG_DIR", "DRIVE_STATE_DIR", "DRIVE_CACHE_DIR"]) delete env[key]
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
const marker = `wirecat-sheets-${randomUUID()}`
const checks = []
let invocations = 0
let fixture
const save = () =>
  writeFileSync(
    join(root, "results.json"),
    `${JSON.stringify(
      {
        package_version: metadata.version,
        node: process.version,
        bin_sha256: createHash("sha256")
          .update(readFileSync(join(pkg, "dist/bin/drive.js")))
          .digest("hex"),
        dependencies: {
          base: metadata.dependencies["@wirecat/cli-base"],
          core: metadata.dependencies["@wirecat/cli-core"],
        },
        invocations,
        checks,
        fixture,
        fixture_retained: Boolean(fixture),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
const run = (...args) => {
  const result = spawnSync(
    process.execPath,
    [join(pkg, "dist/bin/drive.js"), profile, "--timeout", "30s", ...args, "--json"],
    {
      env,
      cwd: root,
      encoding: "utf8",
      timeout: 45000,
      maxBuffer: 4 * 1024 * 1024,
    },
  )
  invocations++
  writeFileSync(
    join(root, `command-${invocations}.json`),
    JSON.stringify({ args, status: result.status, stdout: result.stdout, stderr: result.stderr }),
    { mode: 0o600 },
  )
  save()
  assert.ifError(result.error)
  assert.equal(result.status, 0, `CLI invocation ${invocations} failed; inspect private output before continuing`)
  return JSON.parse(result.stdout).item
}
const call = (method, params, body) =>
  run(
    "api",
    "call",
    method,
    "--params",
    JSON.stringify(params),
    ...(body ? ["--body", JSON.stringify(body), "--allow-writes"] : []),
  )
const check = (name, action) => {
  action()
  checks.push({ name, passed: true })
  save()
}
try {
  const file = call(
    "drive.files.create",
    { fields: "id,mimeType" },
    {
      name: "WireCat Sheets acceptance",
      mimeType: "application/vnd.google-apps.spreadsheet",
      appProperties: { wirecatAcceptance: marker },
    },
  )
  assert.match(file.id, /^[A-Za-z0-9_-]+$/)
  fixture = { id: file.id, marker, url: `https://docs.google.com/spreadsheets/d/${file.id}/edit` }
  save()
  const id = fixture.id
  const sheet = (...args) => run("sheets", args[0], id, ...args.slice(1))
  const read = (range, render = "unformatted") => sheet("show", range, "--render", render).values ?? []
  check("only a newly created marked synthetic spreadsheet is selected", () => {
    const verified = call("drive.files.get", { fileId: id, fields: "id,mimeType,appProperties" })
    assert.equal(verified.id, id)
    assert.equal(verified.mime_type, "application/vnd.google-apps.spreadsheet")
    assert.equal(verified.app_properties.wirecatAcceptance, marker)
  })
  let tab
  check("inspect and rename the initial tab with stable identity", () => {
    const original = sheet("info")
    assert.equal(original.sheets.length, 1)
    tab = String(original.sheets[0].properties.sheetId)
    sheet("rename", tab, "Acceptance")
    const current = sheet("info")
    assert.equal(String(current.sheets[0].properties.sheetId), tab)
    assert.equal(current.sheets[0].properties.title, "Acceptance")
  })
  check("literal updates have independent readback and preserve neighbors", () => {
    const values = [
      ["Item", "Amount", "Note"],
      ["Travel", 10, "keep"],
      ["Reserve", 20, "unchanged"],
    ]
    sheet("update", "Acceptance!A1:C3", "--values", JSON.stringify(values))
    assert.deepEqual(read("Acceptance!A1:C3"), values)
  })
  check("Google calculates explicit formulas while raw strings remain literal", () => {
    sheet("update", "Acceptance!C2", "--input", "user-entered", "--values", '[["=B2*2"]]')
    sheet("update", "Acceptance!C3", "--values", '[["=keep-literal"]]')
    assert.deepEqual(read("Acceptance!C2:C3"), [[20], ["=keep-literal"]])
    assert.deepEqual(read("Acceptance!C2:C3", "formula"), [["=B2*2"], ["=keep-literal"]])
  })
  check("append reports the observed destination and clear preserves neighbors", () => {
    const added = sheet("add", "Acceptance!A1:C10", "--values", '[["Added",30,"clear-me"]]')
    assert.equal(added.updates.updated_range.replaceAll("'", ""), "Acceptance!A4:C4")
    assert.deepEqual(read("Acceptance!A4:C4"), [["Added", 30, "clear-me"]])
    sheet("clear", "Acceptance!A4:C4")
    assert.deepEqual(read("Acceptance!A4:C4"), [])
    assert.deepEqual(read("Acceptance!A2:C3"), [
      ["Travel", 10, 20],
      ["Reserve", 20, "=keep-literal"],
    ])
  })
  check("formatting a leaf preserves values, italic style and number format", () => {
    sheet(
      "format",
      tab,
      "B2",
      "--body",
      '{"textFormat":{"italic":true},"numberFormat":{"type":"NUMBER","pattern":"0.00"}}',
    )
    sheet("format", tab, "B2", "--body", '{"textFormat":{"bold":true}}')
    const result = call("sheets.spreadsheets.get", {
      spreadsheetId: id,
      ranges: ["Acceptance!B2"],
      includeGridData: true,
      fields: "sheets(data(rowData(values(userEnteredValue,userEnteredFormat))))",
    })
    const cell = result.sheets[0].data[0].row_data[0].values[0]
    assert.equal(cell.user_entered_value.number_value, 10)
    assert.equal(cell.user_entered_format.text_format.bold, true)
    assert.equal(cell.user_entered_format.text_format.italic, true)
    assert.equal(cell.user_entered_format.number_format.pattern, "0.00")
  })
  check("row and column insertion shift cells and Google adjusts formula references", () => {
    sheet("insert", tab, "rows", "1", "2")
    assert.deepEqual(read("Acceptance!A4:C5"), [
      ["Travel", 10, 20],
      ["Reserve", 20, "=keep-literal"],
    ])
    sheet("insert", tab, "columns", "0", "1")
    assert.deepEqual(read("Acceptance!B4:D5"), [
      ["Travel", 10, 20],
      ["Reserve", 20, "=keep-literal"],
    ])
    assert.deepEqual(read("Acceptance!D4", "formula"), [["=C4*2"]])
  })
  check("create and rename a second tab while retaining the first", () => {
    sheet("create", "Quarter 2")
    const before = sheet("info")
    const created = before.sheets.find((entry) => entry.properties.title === "Quarter 2")
    assert.ok(created)
    sheet("rename", String(created.properties.sheetId), "Archive")
    const after = sheet("info")
    assert.equal(after.sheets.length, 2)
    assert.equal(after.sheets.find((entry) => String(entry.properties.sheetId) === tab).properties.title, "Acceptance")
    assert.equal(
      after.sheets.find((entry) => entry.properties.sheetId === created.properties.sheetId).properties.title,
      "Archive",
    )
    assert.deepEqual(read("Acceptance!B4:D5"), [
      ["Travel", 10, 20],
      ["Reserve", 20, "=keep-literal"],
    ])
  })
  process.stdout.write(
    `${checks.length} live checks passed in ${invocations} CLI invocations; fixture retained in private results\n`,
  )
} catch {
  save()
  process.stderr.write(
    "Live acceptance stopped. Inspect private results before any retry; writes are never automatically replayed.\n",
  )
  process.exitCode = 1
}
