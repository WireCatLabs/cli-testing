import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { arch, platform } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { checkPreparationCommunications } from "./checks.mjs"

const [installArg, outputArg, sourceCommit, artifactSha256] = process.argv.slice(2)
assert.ok(
  installArg && outputArg && /^[a-f0-9]{40}$/.test(sourceCommit ?? "") && /^[a-f0-9]{64}$/.test(artifactSha256 ?? ""),
  "usage: run.mjs INSTALL NEW_OUTPUT SOURCE_COMMIT ARTIFACT_SHA256",
)
assert.equal(readFileSync(process.env.MEETING_BENCH_LOADED, "utf8"), "loaded")
const install = resolve(installArg),
  output = resolve(outputArg)
assert.ok(!existsSync(output), "output must be new")
mkdirSync(output, { recursive: true })
const require = createRequire(join(install, "node_modules/@wirecat/zoom-cli/package.json"))
const load = (name) => import(pathToFileURL(require.resolve(name)).href)
const metadata = (name) => {
  let directory = dirname(require.resolve(name))
  for (;;) {
    const file = join(directory, "package.json")
    if (existsSync(file)) {
      const item = JSON.parse(readFileSync(file, "utf8"))
      if (item.name === name) return item
    }
    const next = dirname(directory)
    assert.notEqual(next, directory, `missing package metadata: ${name}`)
    directory = next
  }
}
const zoom = metadata("@wirecat/zoom-cli"),
  core = metadata("@wirecat/cli-core"),
  base = metadata("@wirecat/cli-base")
const coreRequire = createRequire(require.resolve("@wirecat/cli-core"))
assert.equal(require.resolve("@wirecat/cli-base"), coreRequire.resolve("@wirecat/cli-base"))
assert.equal(zoom.dependencies["@wirecat/cli-core"], core.version)
assert.equal(zoom.dependencies["@wirecat/cli-base"], base.version)
const { createStoreConnector, profileAccountKey } = await load("@wirecat/zoom-cli")
const { openStore } = await load("@wirecat/cli-core/store")
const { sampleMeeting } = await load("@wirecat/cli-core/meetings/testing")
const now = Date.parse("2026-10-14T12:00:00Z"),
  path = join(output, "synthetic.db")
const key = { provider: "zoom", account: profileAccountKey("AliceExample") }
const store = await openStore({ path, now: () => now })
try {
  const accountId = await store.accounts.saveAccount(key, { name: "Alice Example" })
  const sample = sampleMeeting()
  sample.meeting.accountId = accountId
  sample.meeting.startedAt = now - 86400000
  sample.meeting.endedAt = sample.meeting.startedAt + 1000
  sample.meeting.series.externalId = "123"
  await store.meetings.saveMeeting(sample)
} finally {
  await store.close()
}
let requests = 0
const readOptions = {
  credentials: () => ({
    withSignal: () => ({
      tokens: async () => ({
        accessToken: "invented-access",
        refreshToken: "invented-refresh",
        expiresAt: now + 3600000,
        scopes: ["meeting:read:meeting"],
      }),
    }),
  }),
  fetch: async (url) => {
    assert.equal(String(url), "https://api.zoom.us/v2/meetings/123")
    requests++
    return new Response(JSON.stringify({ id: 123, type: 2, start_time: "2026-10-15T10:00:00Z", duration: 30 }))
  },
}
const checks = await checkPreparationCommunications({
  load,
  path,
  now,
  key,
  connector: createStoreConnector({ path, now: () => now }),
  readOptions,
})
assert.equal(requests, 2)
assert.ok(!existsSync(process.env.MEETING_BENCH_DENIED), "external IO attempted")
const result = {
  candidate: true,
  source_commit: sourceCommit,
  artifact_sha256: artifactSha256,
  node: process.version,
  platform: platform(),
  arch: arch(),
  packages: { zoom: zoom.version, core: core.version, base: base.version },
  checks,
  requests,
  external_io_attempts: 0,
}
writeFileSync(join(output, "results.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(result)}\n`)
