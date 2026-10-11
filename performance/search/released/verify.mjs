import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [runtime, tool, version, output] = process.argv.slice(2)
assert.ok(
  runtime && output && /^(tg|max)$/.test(tool) && /^\d+\.\d+\.\d+$/.test(version),
  "Usage: node verify.mjs RUNTIME tg|max EXACT_VERSION REPORT.json",
)
const sandbox = mkdtempSync(join(tmpdir(), "published-search-discovery-"))
const inheritedPath = process.env.PATH
for (const name of Object.keys(process.env)) delete process.env[name]
process.env.PATH = inheritedPath
process.env.TMPDIR = sandbox
const prefix = tool.toUpperCase()
for (const kind of ["CONFIG", "STATE", "CACHE"]) process.env[`${prefix}_${kind}_DIR`] = join(sandbox, kind)
for (const kind of ["CONFIG", "DATA", "CACHE"]) process.env[`XDG_${kind}_HOME`] = join(sandbox, `xdg-${kind}`)
process.env.MESSAGING_STORE = join(sandbox, "synthetic.db")
process.env.NODE_ENV = "test"
process.env.CI = "true"
const directory = realpathSync(resolve(runtime, "node_modules/@wirecat", `${tool}-cli`))
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
assert.equal(manifest.version, version)
const require = createRequire(join(directory, "package.json"))
const load = (name) => import(pathToFileURL(require.resolve(name)).href)
const { rememberAccount } = await load("@wirecat/cli-messaging/cli")
const { openStore } = await load("@wirecat/cli-messaging/store")
const app = await import(pathToFileURL(join(directory, "dist/app.js")).href)
const description = app[tool === "tg" ? "TG" : "MAX_APP"]
const account = { provider: tool === "tg" ? "telegram" : "max", account: "500" }
rememberAccount(description, "default", account.account, process.env)
const store = await openStore({ path: process.env.MESSAGING_STORE })
await store.saveChats(account, [
  { id: "990", title: "Synthetic discovery", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 3 },
])
await store.saveMessages(
  account,
  "990",
  [
    { id: "9901", text: "Helix export: what time should the daily export run?", senderId: "700" },
    { id: "9902", text: "Every day at 06:45 UTC.", senderId: "700", replyToId: "9901" },
    { id: "9903", text: "Every day at 02:00 UTC.", senderId: "701", replyToId: "9901" },
  ].map((m) => ({
    ...m,
    chatId: "990",
    senderName: "Synthetic",
    timestamp: "2026-10-08T12:00:00.000Z",
    editedAt: null,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  })),
  { via: "synthetic" },
)
await store.fillSearchIndex({})
await store.fillStems({})
await store.close()
const query = "What time does Helix export run? chat:990 from:700 date:2026-10-08"
const invoke = (extra, text = query) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        fileURLToPath(new URL("./offline.mjs", import.meta.url)),
        join(directory, `dist/bin/${tool}.js`),
        "search",
        "messages",
        text,
        ...extra,
        "--timezone",
        "UTC",
        "--json",
        "--offline",
        "--no-record",
      ],
      { env: process.env, encoding: "utf8", timeout: 15000 },
    ),
  )
const discovery = invoke(["--discover"])
const strict = invoke([])
assert.equal(discovery.query.discovery.method, "lexical-partial")
assert.ok(discovery.items.some((m) => m.id === "9902" && m.discovery.parent === `msg:${account.provider}/500/990/9901`))
assert.ok(!discovery.items.some((m) => m.id === "9903"))
assert.deepEqual(strict.items, [])
const permissionQuestions = process.argv.includes("--permission-questions")
if (permissionQuestions) {
  for (const text of ["Can operators run Helix export?", "Могут операторы выполнить Helix export?"]) {
    const scoped = `${text} chat:990 from:700 date:2026-10-08`
    const found = invoke(["--discover"], scoped)
    assert.equal(found.query.discovery.method, "lexical-partial")
    assert.ok(found.items.some((m) => m.id === "9902" && m.discovery.parent === `msg:${account.provider}/500/990/9901`))
    assert.ok(!found.items.some((m) => m.id === "9903"))
    assert.deepEqual(invoke([], scoped).items, [])
  }
}
const evidence = {
  tool,
  version,
  messaging: manifest.dependencies["@wirecat/cli-messaging"],
  discoveryItems: discovery.items.length,
  strictItems: strict.items.length,
  replyRetrieved: true,
  otherSenderExcluded: true,
  parentVerified: true,
  publishedBinaryVerified: true,
  permissionQuestionsVerified: permissionQuestions,
  syntheticOnly: true,
  node: process.version,
  verifierSha256: createHash("sha256")
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest("hex"),
  offlineGuardSha256: createHash("sha256")
    .update(readFileSync(new URL("./offline.mjs", import.meta.url)))
    .digest("hex"),
}
writeFileSync(resolve(output), `${JSON.stringify(evidence, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(evidence)}\n`)
