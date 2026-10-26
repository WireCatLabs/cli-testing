import "../drive-shared-store/guard.mjs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const pkg = resolve(process.argv[2])
const output = resolve(process.argv[3])
const structure = process.argv[4] === "--structure"
assert.ok(process.argv[4] === undefined || structure)
const require = createRequire(join(pkg, "package.json"))
const { OAuth2Client } = require("google-auth-library")
const { captureStreams } = require("@wirecat/cli-base")
const { createProgram, googleApi } = await import(pathToFileURL(join(pkg, "dist/index.js")).href)
const root = mkdtempSync("/var/tmp/drive-sheets-sdk-")
const env = {
  HOME: root,
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  MESSAGING_STORE: join(root, "store"),
}
mkdirSync(env.DRIVE_CONFIG_DIR)
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({
    profiles: {
      verification: { principal: "synthetic-sheets-principal", roots: [], storage: "file" },
    },
  }),
  { mode: 0o600 },
)
const grid = [
  ["Item", "Amount", "Note"],
  ["Travel", 10, "keep"],
  ["Reserve", 20, "unchanged"],
]
const before = structuredClone(grid)
const requests = []
let failAfterApply = false
const tabs = new Map([
  [0, "Sample Plan"],
  [42, "Other"],
])
const formats = new Map([
  ["0:0:0", { textFormat: { bold: false, italic: true }, numberFormat: { type: "NUMBER", pattern: "0.00" } }],
])
const auth = new OAuth2Client({
  transporterOptions: {
    retryConfig: { retryBackoff: async () => {} },
    fetchImplementation: async (input, options) => {
      const url = new URL(String(input))
      assert.equal(url.origin, "https://sheets.googleapis.com")
      const method = options?.method ?? "GET"
      const body = options?.body ? JSON.parse(String(options.body)) : undefined
      requests.push({ method, params: url.searchParams })
      const prefix = "/v4/spreadsheets/synthetic-sheet"
      if (url.pathname === prefix)
        return Response.json({
          sheets: [...tabs.entries()].map(([id, title]) => ({
            properties: { sheetId: id, title, gridProperties: { rowCount: id === 0 ? grid.length : 1 } },
            ...(url.searchParams.get("includeGridData") === "true" && id === 0
              ? {
                  data: [
                    {
                      rowData: grid.map((row, rowIndex) => ({
                        values: row.map((value, columnIndex) => ({
                          userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value },
                          userEnteredFormat: formats.get(`0:${rowIndex}:${columnIndex}`) ?? {},
                        })),
                      })),
                    },
                  ],
                }
              : {}),
          })),
        })
      if (url.pathname === `${prefix}:batchUpdate`) {
        const replies = []
        for (const request of body.requests) {
          if (request.addSheet) {
            const id = 100 + tabs.size
            tabs.set(id, request.addSheet.properties.title)
            replies.push({ addSheet: { properties: { sheetId: id, title: request.addSheet.properties.title } } })
          } else if (request.updateSheetProperties) {
            assert.equal(request.updateSheetProperties.fields, "title")
            tabs.set(request.updateSheetProperties.properties.sheetId, request.updateSheetProperties.properties.title)
            replies.push({})
          } else if (request.insertDimension) {
            const { range } = request.insertDimension
            assert.equal(range.sheetId, 0)
            assert.equal(range.dimension, "ROWS")
            for (let n = 0; n < range.endIndex - range.startIndex; n++) grid.splice(range.startIndex + n, 0, [])
            replies.push({})
          } else if (request.repeatCell) {
            const { range, fields, cell } = request.repeatCell
            assert.deepEqual(Object.keys(cell), ["userEnteredFormat"])
            for (let row = range.startRowIndex; row < range.endRowIndex; row++)
              for (let col = range.startColumnIndex; col < range.endColumnIndex; col++) {
                const key = `${range.sheetId}:${row}:${col}`
                const target = formats.get(key) ?? {}
                for (const field of fields.split(",")) {
                  assert.ok(field.startsWith("userEnteredFormat."))
                  const parts = field.split(".").slice(1)
                  let source = cell.userEnteredFormat
                  let destination = target
                  for (const part of parts.slice(0, -1)) {
                    source = source[part]
                    destination[part] ??= {}
                    destination = destination[part]
                  }
                  destination[parts.at(-1)] = source[parts.at(-1)]
                }
                formats.set(key, target)
              }
            replies.push({})
          } else throw new Error("unexpected synthetic batch request")
        }
        if (failAfterApply) {
          failAfterApply = false
          return Response.json({ error: { message: "SYNTHETIC-PRIVATE-BODY" } }, { status: 503 })
        }
        return Response.json({ replies })
      }
      const route = decodeURIComponent(url.pathname.split("/values/")[1] ?? "")
      const match = /^'Sample Plan'!([A-C])([1-9]\d*)(?::([A-C])([1-9]\d*))?(?::(append|clear))?$/.exec(route)
      assert.ok(match)
      const start = Number(match[2]) - 1
      const end = Number(match[4] ?? match[2]) - 1
      const left = match[1].charCodeAt(0) - 65
      const right = (match[3] ?? match[1]).charCodeAt(0) - 65
      const range = route.replace(/:(append|clear)$/, "")
      if (method === "GET")
        return Response.json({ range, values: grid.slice(start, end + 1).map((row) => row.slice(left, right + 1)) })
      if (match[5] === "clear") {
        for (let row = start; row <= end; row++) for (let col = left; col <= right; col++) grid[row][col] = ""
        return Response.json({ clearedRange: range })
      }
      assert.equal(body.majorDimension, "ROWS")
      const offset = match[5] === "append" ? grid.length : start
      for (const [index, row] of body.values.entries()) {
        grid[offset + index] ??= []
        for (const [col, value] of row.entries()) if (value !== null) grid[offset + index][left + col] = value
      }
      if (failAfterApply) {
        failAfterApply = false
        return Response.json({ error: { message: "SYNTHETIC-PRIVATE-BODY" } }, { status: 503 })
      }
      const updatedRange = `'Sample Plan'!${match[1]}${offset + 1}:${String.fromCharCode(65 + left + body.values[0].length - 1)}${offset + body.values.length}`
      const result = { updatedRange, updatedData: { values: body.values } }
      return Response.json(match[5] === "append" ? { updates: result } : result)
    },
  },
})
auth.setCredentials({ access_token: "SYNTHETIC-SHEETS-BEARER", expiry_date: Date.now() + 3600000 })
const api = googleApi(auth)
const invoke = async (...args) => {
  const streams = captureStreams()
  await createProgram({ env, streams, api }).parseAsync(["verification", ...args, "--json"], { from: "user" })
  return JSON.parse(streams.stdout.join("")).item
}
const run = (...args) => invoke("sheets", ...args)
const checks = []
const check = async (name, fn) => {
  await fn()
  checks.push({ name, passed: true })
}
await check("SDK update followed by a separate read preserves neighbors", async () => {
  await run("update", "synthetic-sheet", "'Sample Plan'!B2", "--values", "[[25]]")
  assert.equal(requests[0].params.get("valueInputOption"), "RAW")
  const read = await run("show", "synthetic-sheet", "'Sample Plan'!A1:C3", "--render", "unformatted")
  assert.deepEqual(read.values, [before[0], ["Travel", 25, "keep"], before[2]])
})
await check("formula mode is explicit and null skips a cell", async () => {
  await run("update", "synthetic-sheet", "'Sample Plan'!A2:B2", "--values", '[["=SUM(1,2)",null]]')
  assert.equal(requests.at(-1).params.get("valueInputOption"), "RAW")
  assert.deepEqual(grid[1], ["=SUM(1,2)", 25, "keep"])
  await run("update", "synthetic-sheet", "'Sample Plan'!C2", "--input", "user-entered", "--values", '[["=B2*2"]]')
  assert.equal(requests.at(-1).params.get("valueInputOption"), "USER_ENTERED")
  const read = await run("show", "synthetic-sheet", "'Sample Plan'!C2", "--render", "formula")
  assert.deepEqual(read.values, [["=B2*2"]])
  assert.equal(requests.at(-1).params.get("valueRenderOption"), "FORMULA")
})
await check("append reports its actual destination and clear limits its cells", async () => {
  const added = await run("add", "synthetic-sheet", "'Sample Plan'!A1:C3", "--values", '[["New",40,"new note"]]')
  assert.equal(added.updates.updated_range, "'Sample Plan'!A4:C4")
  await run("clear", "synthetic-sheet", "'Sample Plan'!B4:C4")
  assert.deepEqual((await run("show", "synthetic-sheet", "'Sample Plan'!A4:C4")).values, [["New", "", ""]])
})
await check("an applied append with a 503 response is not replayed", async () => {
  failAfterApply = true
  const count = requests.length
  const error = await run("add", "synthetic-sheet", "'Sample Plan'!A1:C3", "--values", '[["Once",50]]').catch(
    (error) => error,
  )
  assert.equal(error.code, "outcome_unknown")
  assert.equal(requests.length - count, 1)
  assert.equal(grid.length, 5)
  assert.deepEqual((await run("show", "synthetic-sheet", "'Sample Plan'!A5:B5")).values, [["Once", 50]])
  assert.equal(JSON.stringify(error).includes("SYNTHETIC-PRIVATE-BODY"), false)
  assert.equal(JSON.stringify(error).includes("SYNTHETIC-SHEETS-BEARER"), false)
})
if (structure) {
  await check("create and rename retain stable tab IDs and neighboring tabs", async () => {
    const created = await run("create", "synthetic-sheet", "Q2")
    assert.equal(created.replies[0].add_sheet.properties.title, "Q2")
    await run("rename", "synthetic-sheet", "0", "Renamed")
    const info = await run("info", "synthetic-sheet")
    assert.equal(info.sheets.find((sheet) => sheet.properties.sheetId === 0).properties.title, "Renamed")
    assert.equal(info.sheets.find((sheet) => sheet.properties.sheetId === 42).properties.title, "Other")
  })
  await check("a leaf format update preserves cell values and other style fields", async () => {
    await run("format", "synthetic-sheet", "0", "A1", "--body", '{"textFormat":{"bold":true}}')
    const result = await invoke(
      "api",
      "sheets-spreadsheets-get",
      "--spreadsheet-id",
      "synthetic-sheet",
      "--include-grid-data",
      "true",
    )
    const cell = result.sheets[0].data[0].row_data[0].values[0]
    assert.equal(cell.user_entered_value.string_value, "Item")
    assert.deepEqual(cell.user_entered_format, {
      text_format: { bold: true, italic: true },
      number_format: { type: "NUMBER", pattern: "0.00" },
    })
  })
  await check("row insertion shifts data and is not repeated after an uncertain response", async () => {
    const rows = grid.length
    const previousSecond = structuredClone(grid[1])
    await run("insert", "synthetic-sheet", "0", "rows", "1", "2")
    assert.deepEqual(grid[3], previousSecond)
    failAfterApply = true
    const count = requests.length
    const error = await run("insert", "synthetic-sheet", "0", "rows", "0", "1").catch((error) => error)
    assert.equal(error.code, "outcome_unknown")
    assert.equal(requests.length - count, 1)
    const info = await run("info", "synthetic-sheet")
    assert.equal(info.sheets[0].properties.gridProperties.rowCount, rows + 3)
  })
  await check("rename policy refuses friendly/raw/generated paths before the SDK", async () => {
    writeFileSync(
      join(env.DRIVE_CONFIG_DIR, "config.json"),
      JSON.stringify({
        profiles: { verification: { principal: "synthetic-sheets-principal", roots: [], storage: "file" } },
        defaults: { permissions: { "sheets.rename": "deny" } },
      }),
    )
    const count = requests.length
    const body = '{"requests":[{"updateSheetProperties":{"properties":{"sheetId":0,"title":"Q2"},"fields":"title"}}]}'
    for (const args of [
      ["sheets", "rename", "synthetic-sheet", "0", "Q2"],
      [
        "api",
        "call",
        "sheets.spreadsheets.batchUpdate",
        "--params",
        '{"spreadsheetId":"synthetic-sheet"}',
        "--body",
        body,
        "--allow-writes",
      ],
      ["api", "sheets-spreadsheets-batch-update", "--spreadsheet-id", "synthetic-sheet", "--body", body],
    ]) {
      const error = await invoke(...args).catch((error) => error)
      assert.equal(error.code, "permission_error")
    }
    assert.equal(requests.length, count)
  })
}
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
writeFileSync(
  output,
  `${JSON.stringify(
    {
      package_version: metadata.version,
      structure,
      artifact_kind: "compiled_public_client_candidate",
      dependencies: {
        sheets: metadata.dependencies["@googleapis/sheets"],
        core: metadata.dependencies["@wirecat/cli-core"],
        base: metadata.dependencies["@wirecat/cli-base"],
      },
      compiled_sha256: [
        "commands/sheets.js",
        "google-api.js",
        "generated/manifest.js",
        ...(structure ? ["commands/sheets-structure.js", "sheets-input.js", "policy.js"] : []),
      ].map((path) => ({
        path,
        sha256: createHash("sha256")
          .update(readFileSync(join(pkg, "dist", path)))
          .digest("hex"),
      })),
      entry_sha256: createHash("sha256")
        .update(readFileSync(join(pkg, "dist/index.js")))
        .digest("hex"),
      checks,
      sdk_requests: requests.length,
      live_google_requests: 0,
      live_google_writes: 0,
      limitations: [
        "In-memory provider fixture; not Google formula calculation, table detection, formatting or live validation",
      ],
    },
    null,
    2,
  )}\n`,
)
process.stdout.write(`${checks.length} public-client roundtrips passed; ${requests.length} in-memory SDK requests\n`)
