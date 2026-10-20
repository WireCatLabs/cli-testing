import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { annotationFixture } from "./fixture.mjs"

const [sdkEntry, memoEntry, clientPackage, expectedVersion] = process.argv.slice(2)
assert(
  sdkEntry && memoEntry && clientPackage && expectedVersion,
  "pass the installed Core store entry, Memo entry, MCP client package directory and expected Memo version",
)
assert(process.env.HOME && process.env.MESSAGING_STORE && process.env.WIRECAT_STATE_DIR)
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
const sdk = await import(pathToFileURL(resolve(sdkEntry)).href)
const { Client } = await import(pathToFileURL(resolve(clientPackage, "dist/index.mjs")).href)
const { StdioClientTransport } = await import(pathToFileURL(resolve(clientPackage, "dist/stdio.mjs")).href)
const f = await annotationFixture(sdk)
const env = { ...process.env, MESSAGING_STORE: f.source, MEMO_NO_UPDATE_CHECK: "1", AI_AGENT: "", CLAUDECODE: "" }
const invoke = (...args) =>
  execFileSync(process.execPath, [resolve(memoEntry), ...args], { env, encoding: "utf8", timeout: 15000 })
assert.equal(invoke("--version").trim(), expectedVersion)
const run = (...args) => {
  const answer = JSON.parse(invoke(...args, "--json"))
  assert(answer.meta)
  assert(answer.item)
  return answer.item
}
const directory = dirname(f.source),
  snapshotFile = join(directory, "snapshot.json"),
  bindingsFile = join(directory, "bindings.json")
const bindings = {
  [f.project.ref]: f.destination.ref,
  [f.sourceDocument.ref]: f.targetDocument.ref,
  [`bot:${f.sourceFact.author.id}`]: `bot:${f.targetFact.author.id}`,
}
writeFileSync(bindingsFile, JSON.stringify(bindings))
const sourceBefore = readFileSync(f.source),
  targetBefore = readFileSync(f.target)
const exported = run("projects", "annotations", "export", "REX", "--output", snapshotFile)
assert.deepEqual(exported.counts, { aliases: 1, facts: 1, links: 1 })
assert(!readFileSync(snapshotFile, "utf8").includes(f.body))
assert.deepEqual(readFileSync(f.source), sourceBefore)
if (process.platform !== "win32") assert.equal(statSync(snapshotFile).mode & 0o777, 0o600)
const options = ["--target-store", f.target, "--project", f.destination.ref, "--bindings", bindingsFile]
const preview = run("projects", "annotations", "check", snapshotFile, ...options)
assert.equal(preview.ready, true)
assert.deepEqual(readFileSync(f.target), targetBefore)
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(memoEntry), "mcp"],
  env: Object.fromEntries(
    Object.entries({ ...env, AI_AGENT: "synthetic-host-check", MEMO_READ_ONLY: "1" }).filter(
      ([, value]) => value !== undefined,
    ),
  ),
  stderr: "pipe",
})
const client = new Client({ name: "synthetic-annotation-check", version: "1" })
try {
  await client.connect(transport)
  const tools = (await client.listTools()).tools.map((tool) => tool.name)
  assert(tools.includes("project_annotations_snapshot"))
  assert(tools.includes("project_annotations_preview"))
  assert(!tools.includes("project_annotations_restore"))
  const snapshot = await client.callTool({ name: "project_annotations_snapshot", arguments: { project: "REX" } })
  assert(!snapshot.isError)
  assert(snapshot.structuredContent.meta)
  const args = {
    snapshot: snapshot.structuredContent.item.snapshot,
    target_store: f.target,
    project: f.destination.ref,
    bindings,
  }
  const checked = await client.callTool({ name: "project_annotations_preview", arguments: args })
  assert(!checked.isError)
  assert(checked.structuredContent.meta)
  assert.equal(checked.structuredContent.item.ready, true)
  const refused = await client.callTool({
    name: "project_annotations_snapshot",
    arguments: { project: "REX", typo: true },
  })
  assert.equal(refused.isError, true)
  assert.equal(refused.structuredContent.error.code, "validation_error")
  assert.match(refused.structuredContent.error.message, /typo/)
  const invalid = structuredClone(args)
  invalid.snapshot.project.description = "  "
  const semantic = await client.callTool({ name: "project_annotations_preview", arguments: invalid })
  assert.equal(semantic.isError, true)
  assert.match(semantic.structuredContent.error.message, /project.description/)
} finally {
  await client.close()
}
assert.deepEqual(readFileSync(f.target), targetBefore)
const restore = [
  "projects",
  "annotations",
  "restore",
  snapshotFile,
  ...options,
  "--fingerprint",
  preview.fingerprint,
  "--json",
]
const agent = spawnSync(process.execPath, [resolve(memoEntry), ...restore], {
  env: { ...env, AI_AGENT: "synthetic-host-check" },
  encoding: "utf8",
  timeout: 15000,
})
assert.equal(agent.status, 5)
assert.equal(agent.stdout, "")
assert.equal(JSON.parse(agent.stderr).error.code, "permission_error")
assert.deepEqual(readFileSync(f.target), targetBefore)
const receipt = run(...restore.slice(0, -1))
assert.deepEqual(receipt.counts, { aliases: 1, facts: 1, links: 1 })
assert(Array.isArray(receipt.mappings))
const repeated = spawnSync(process.execPath, [resolve(memoEntry), ...restore], {
  env,
  encoding: "utf8",
  timeout: 15000,
})
assert.equal(repeated.status, 2)
assert.equal(repeated.stdout, "")
assert.equal(JSON.parse(repeated.stderr).error.code, "validation_error")
const target = await sdk.openStore({ path: f.target, readOnly: true })
try {
  const facts = await target.facts.list({ project: f.destination.ref })
  assert.equal(facts.length, 1)
  assert.equal(facts[0].status, "proposed")
  assert.equal((await target.facts.list({ project: f.unrelated.ref })).length, 2)
} finally {
  await target.close()
}
assert.equal(existsSync(process.env.MESSAGING_STORE), false)
process.stdout.write(
  `${JSON.stringify({ memo_version: expectedVersion, cli_export_check_restore: true, stdio_snapshot_preview: true, standard_envelopes: true, unknown_field_named: true, semantic_validation_preserved: true, no_restore_tool: true, agent_restore_refused: true, repeat_refused: true, proposed_state_preserved: true, unrelated_facts_preserved: true, implicit_store_created: false, owner_data_used: false })}\n`,
)
