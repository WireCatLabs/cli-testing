import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { arch, platform } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { checkProjectCandidates } from "./checks.mjs"

const [installArg, outputArg, sourceCommit, artifactSha256, artifactStatus = "candidate", ...extra] =
  process.argv.slice(2)
assert.ok(
  installArg && outputArg && /^[a-f0-9]{40}$/.test(sourceCommit ?? "") && /^[a-f0-9]{64}$/.test(artifactSha256 ?? ""),
  "usage: run.mjs INSTALL NEW_OUTPUT SOURCE_COMMIT ARTIFACT_SHA256 [candidate|published]",
)
assert.ok(
  extra.length === 0 && ["candidate", "published"].includes(artifactStatus),
  "artifact status must be candidate or published",
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
const fixture = await openStore({ path, now: () => now })
let reference, project
try {
  const accountId = await fixture.accounts.saveAccount(key, { name: "Alice Example" })
  assert.ok(accountId)
  const sample = sampleMeeting()
  sample.meeting.accountId = accountId
  sample.meeting.externalId = "invented-project-discovery"
  sample.meeting.title = "ПРИ"
  sample.transcripts = sample.transcripts.map((t) => ({
    ...t,
    rows: t.rows.map((row) => ({ ...row, text: "Bureau Example: review the draft." })),
  }))
  const saved = await fixture.meetings.saveMeeting(sample)
  reference = `meeting:${accountId}/${saved.meeting.id}`
  project = await fixture.knowledge.addProject({ name: "Bureau Example", key: "BEX" })
  await fixture.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "ПРИ")
} finally {
  await fixture.close()
}
const checks = await checkProjectCandidates({
  load,
  path,
  key,
  connector: createStoreConnector({ path, now: () => now }),
  reference,
  project,
})
assert.ok(!existsSync(process.env.MEETING_BENCH_DENIED), "external IO attempted")
const result = {
  candidate: artifactStatus === "candidate",
  source_commit: sourceCommit,
  artifact_sha256: artifactSha256,
  node: process.version,
  platform: platform(),
  arch: arch(),
  packages: { zoom: zoom.version, core: core.version, base: base.version },
  checks,

  external_io_attempts: 0,
}
writeFileSync(join(output, "results.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(result)}\n`)
