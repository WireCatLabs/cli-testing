import "../drive-shared-store/guard.mjs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const pkg = resolve(process.argv[2])
const output = resolve(process.argv[3])
const source = process.argv[4]
assert.match(source, /^[a-f0-9]{40}$/)
const require = createRequire(join(pkg, "package.json"))
const { OAuth2Client } = require("google-auth-library")
const { captureStreams } = require("@wirecat/cli-base")
const { createProgram, googleApi } = await import(pathToFileURL(join(pkg, "dist/index.js")).href)
const root = mkdtempSync("/var/tmp/drive-api-setup-")
const env = {
  HOME: root,
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  MESSAGING_STORE: join(root, "store"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
}
mkdirSync(env.DRIVE_CONFIG_DIR)
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({ profiles: { verification: { principal: "synthetic", roots: [], storage: "file" } } }),
  { mode: 0o600 },
)
const info = {
  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
  domain: "googleapis.com",
  reason: "SERVICE_DISABLED",
  metadata: { activationUrl: "https://example.invalid/DO_NOT_LOG" },
}
const cases = [
  [
    "legacy disabled API",
    { errors: [{ reason: "accessNotConfigured" }] },
    "configuration_error",
    "google-api.disabled",
  ],
  ["structured disabled API", { details: [info] }, "configuration_error", "google-api.disabled"],
  ["unrelated access denial", { errors: [{ reason: "insufficientPermissions" }] }, "permission_error", undefined],
  [
    "unrelated ErrorInfo domain",
    { details: [{ ...info, domain: "unrelated.invalid" }] },
    "permission_error",
    undefined,
  ],
  ["malformed details", { details: "DO_NOT_LOG" }, "permission_error", undefined],
]
let requests = 0
const checks = []
for (const [name, payload, code, reason] of cases) {
  const auth = new OAuth2Client({
    transporterOptions: {
      fetchImplementation: async (input) => {
        assert.equal(new URL(String(input)).origin, "https://sheets.googleapis.com")
        requests++
        return Response.json({ error: { code: 403, message: "DO_NOT_LOG", ...payload } }, { status: 403 })
      },
    },
  })
  auth.setCredentials({ access_token: "DO_NOT_LOG" })
  const streams = captureStreams()
  const before = requests
  let failure
  try {
    await createProgram({ env, streams, api: googleApi(auth) }).parseAsync(
      ["verification", "sheets", "info", "synthetic-sheet", "--json"],
      { from: "user" },
    )
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.code, code, name)
  assert.equal(failure?.details?.reason, reason, name)
  assert.equal(requests - before, 1, "the refused read was not retried")
  assert.equal(
    JSON.stringify({
      message: failure.message,
      details: failure.details,
      stdout: streams.stdout,
      stderr: streams.stderr,
    }).includes("DO_NOT_LOG"),
    false,
  )
  checks.push({ name, passed: true })
}
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
writeFileSync(
  output,
  `${JSON.stringify(
    {
      artifact_kind: "compiled_public_client_candidate",
      source_commit: source,
      package_version: metadata.version,
      node: process.version,
      dependencies: {
        base: metadata.dependencies["@wirecat/cli-base"],
        core: metadata.dependencies["@wirecat/cli-core"],
      },
      compiled_sha256: ["errors.js", "failure.js", "google-api.js"].map((path) => ({
        path,
        sha256: createHash("sha256")
          .update(readFileSync(join(pkg, "dist", path)))
          .digest("hex"),
      })),
      checks,
      sdk_requests: requests,
      live_google_requests: 0,
      limits: [
        "Synthetic compiled command/SDK failures; does not render the CLI/MCP error envelope or enable a Google API",
      ],
    },
    null,
    2,
  )}\n`,
)
process.stdout.write(`${checks.length} API setup checks passed; ${requests} in-memory SDK requests\n`)
