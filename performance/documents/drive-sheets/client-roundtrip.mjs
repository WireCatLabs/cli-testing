import "../drive-shared-store/guard.mjs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const pkg = resolve(process.argv[2])
const output = resolve(process.argv[3])
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
const auth = new OAuth2Client({
  transporterOptions: {
    retryConfig: { retryBackoff: async () => {} },
    fetchImplementation: async (input, options) => {
      const url = new URL(String(input))
      assert.equal(url.origin, "https://sheets.googleapis.com")
      const method = options?.method ?? "GET"
      const body = options?.body ? JSON.parse(String(options.body)) : undefined
      requests.push({ method, params: url.searchParams })
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
const run = async (...args) => {
  const streams = captureStreams()
  await createProgram({ env, streams, api }).parseAsync(["verification", "sheets", ...args, "--json"], { from: "user" })
  return JSON.parse(streams.stdout.join("")).item
}
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
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
writeFileSync(
  output,
  `${JSON.stringify(
    {
      package_version: metadata.version,
      artifact_kind: "compiled_public_client_candidate",
      dependencies: {
        sheets: metadata.dependencies["@googleapis/sheets"],
        core: metadata.dependencies["@wirecat/cli-core"],
        base: metadata.dependencies["@wirecat/cli-base"],
      },
      compiled_sha256: ["commands/sheets.js", "google-api.js", "generated/manifest.js"].map((path) => ({
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
