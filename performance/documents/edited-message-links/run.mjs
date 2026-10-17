import "../annotation-transfer/guard.mjs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [prefix, previousPrefix, output, mode, legacyPrefix] = process.argv.slice(2)
assert.ok(mode === undefined || mode === "--expect-missing" || mode === "--upgrade-from")
const upgrade = mode === "--upgrade-from"
assert.ok(!upgrade || legacyPrefix, "--upgrade-from requires a previous Drive installation")
const baseline = mode === "--expect-missing"
assert.ok(prefix && previousPrefix && output, "run.mjs DRIVE_PREFIX PREVIOUS_CORE_PREFIX OUTPUT_JSON")
const drive = join(resolve(prefix), "node_modules/@wirecat/drive-cli")
const current = createRequire(join(drive, "package.json"))
const previous = createRequire(join(resolve(previousPrefix), "package.json"))
const { openStore: openPrevious } = await import(pathToFileURL(previous.resolve("@wirecat/cli-core/store")))
const { openStore } = await import(pathToFileURL(current.resolve("@wirecat/cli-core/store")))
const { captureStreams, memoryKeyring } = await import(pathToFileURL(current.resolve("@wirecat/cli-base")))
const { createProgram } = await import(pathToFileURL(join(drive, "dist/index.js")))
const legacyRoot = upgrade ? join(resolve(legacyPrefix), "node_modules/@wirecat/drive-cli") : undefined
const legacyClient = legacyRoot ? createRequire(join(legacyRoot, "package.json")) : undefined
const legacy = legacyRoot
  ? {
      ...(await import(pathToFileURL(join(legacyRoot, "dist/index.js")))),
      ...(await import(pathToFileURL(legacyClient.resolve("@wirecat/cli-base")))),
    }
  : undefined
const sdk = createRequire(current.resolve("@wirecat/cli-core/store"))
for (const dependency of ["@wirecat/cli-base", "commander"])
  assert.equal(sdk.resolve(dependency), current.resolve(dependency), `one physical ${dependency}`)
const root = mkdtempSync(join(tmpdir(), "document-message-edits-"))
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NO_COLOR: "1",
  MESSAGING_STORE: join(root, "shared.db"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  NPM_CONFIG_USERCONFIG: "/dev/null",
}
const principal = "synthetic-drive-owner"
mkdirSync(env.DRIVE_CONFIG_DIR)
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({ profiles: { synthetic: { principal, roots: ["synthetic-root"], storage: "keyring" } } }),
)
const id = "SyntheticEditedDocument_123"
const url = `https://docs.google.com/document/d/${id}/edit`
const accounts = [
  { provider: "telegram", account: "synthetic" },
  { provider: "max", account: "synthetic" },
]
const message = (text) => ({
  id: "1",
  chatId: "7",
  senderId: "9",
  senderName: "Synthetic editor",
  timestamp: "2025-01-01T00:00:00Z",
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})
const file = (key = id) => ({
  id: key,
  name: "Synthetic evidence",
  parents: key === id ? ["synthetic-root"] : [],
  mime: key === id ? "application/vnd.google-apps.document" : "application/vnd.google-apps.folder",
  version: "1",
  modifiedAt: "2026-01-01T00:00:00Z",
  url,
  trashed: false,
  canDownload: true,
})
let contentReads = 0
const source = {
  identity: async () => principal,
  metadata: async (key) => file(key),
  children: async () => [file()],
  startToken: async () => "synthetic-cursor",
  changes: async () => ({ items: [], cursor: "synthetic-next" }),
  content: async () => {
    contentReads++
    return { metadata: file(), text: "Synthetic source content", markdown: "Synthetic source content", tabs: [] }
  },
  bytes: async () => {
    throw new Error("synthetic fixture has no images")
  },
}
let clock = Date.now() - 60_000
const old = await openPrevious({ path: env.MESSAGING_STORE, env, now: () => clock })
for (const account of accounts)
  await old.messages.saveMessages(account, "7", [message("before the link")], { via: "history" })
await old.close()
const checks = []
let syncInvocations = 0
const sync = async (older = false) => {
  syncInvocations++
  const client = older ? legacy : { createProgram, captureStreams, memoryKeyring }
  const streams = client.captureStreams()
  const program = client.createProgram({ env, streams, keyring: client.memoryKeyring(), source: async () => source })
  await program.parseAsync(["synthetic", "sync", "--json"], { from: "user" })
  const result = JSON.parse(streams.stdout.join(""))
  assert.equal(result.item.pending, 0)
  assert.equal(result.meta.complete, true)
}
const checkpoint = () => JSON.parse(readFileSync(join(env.DRIVE_STATE_DIR, "profiles/synthetic/state.json"), "utf8"))
await sync(upgrade)
checks.push("initial import before either message has a URL")
clock = Date.parse(checkpoint().linkedThrough) + 1
const writer = await openPrevious({ path: env.MESSAGING_STORE, env, now: () => clock })
try {
  for (const account of accounts) await writer.messages.saveMessages(account, "7", [message(url)], { via: "history" })
  await sync(upgrade)
  const store = await openStore({ path: env.MESSAGING_STORE, env })
  try {
    const reference = checkpoint().documents[id].reference
    let links = await store.notes.links({ to: reference })
    if (upgrade) {
      assert.deepEqual(links, [])
      assert.ok(Date.parse(checkpoint().linkedThrough) >= clock)
      await sync()
      assert.equal(checkpoint().linksVersion, 1)
      links = await store.notes.links({ to: reference })
      checks.push("first upgraded sync repairs URLs missed before the old checkpoint without a rescan")
    }
    if (baseline) {
      assert.deepEqual(links, [])
      checks.push("reproduced missing links after both saved messages gain document URLs")
    } else {
      assert.deepEqual(links.map((link) => link.from).sort(), ["msg:max/synthetic/7/1", "msg:telegram/synthetic/7/1"])
      for (const account of accounts)
        assert.equal((await store.documentLinkMessages(account, "7"))[0].documents[0].fileId, id)
      checks.push("older SDK text edits link both same-ID messages in separate provider accounts")
      await sync()
      assert.equal((await store.notes.links({ to: reference })).length, 2)
      checks.push("unchanged sync retains exactly one link per message")
      clock = Date.parse(checkpoint().linkedThrough) + 1
      await writer.messages.saveMessages(accounts[0], "7", [message(`opaque id ${id}`)], { via: "events" })
      await writer.messages.markDeleted(accounts[1], ["1"], { chatId: "7" })
      await sync()
      for (const account of accounts) assert.equal((await store.documentLinkMessages(account, "7")).length, 0)
      checks.push("current chat readers omit removed URLs and deleted messages")
      clock = Date.parse(checkpoint().linkedThrough) + 1
      await writer.messages.saveMessages(accounts[0], "7", [message(url)], { via: "events" })
      await sync()
      assert.equal((await store.documentLinkMessages(accounts[0], "7"))[0].documents[0].fileId, id)
      assert.equal((await store.notes.links({ to: reference })).length, 2)
      assert.equal(contentReads, 1)
      checks.push("re-added URL remains readable without duplicate links or content downloads")
    }
  } finally {
    await store.close()
  }
} finally {
  await writer.close()
}
const pkg = JSON.parse(readFileSync(join(drive, "package.json"), "utf8"))
const core = JSON.parse(
  readFileSync(join(resolve(dirname(current.resolve("@wirecat/cli-core/store")), "../.."), "package.json"), "utf8"),
)
const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
writeFileSync(
  output,
  `${JSON.stringify(
    {
      status: baseline ? "defect reproduced" : "passed",
      date: new Date().toISOString(),
      runtime: process.version,
      drive: pkg.version,
      core: core.version,
      previous_core: JSON.parse(
        readFileSync(
          join(resolve(dirname(previous.resolve("@wirecat/cli-core/store")), "../.."), "package.json"),
          "utf8",
        ),
      ).version,
      integrity: lock.packages["node_modules/@wirecat/drive-cli"].integrity,
      bin_sha256: createHash("sha256")
        .update(readFileSync(join(drive, "dist/bin/drive.js")))
        .digest("hex"),
      one_physical_base: true,
      one_physical_commander: true,
      sync_invocations: syncInvocations,
      ...(upgrade ? { upgrade_from: JSON.parse(readFileSync(join(legacyRoot, "package.json"), "utf8")).version } : {}),
      content_reads: contentReads,
      checks,
      limits: [
        "Synthetic source and saved messages; no Google/messenger/OAuth/model contact",
        "Auto-link rows are retained as historical context; current readers use current text",
        "No hidden formatted links or remote edit event delivery is established",
      ],
    },
    null,
    2,
  )}\n`,
)
process.stdout.write(`${checks.length} edited-message groups: ${baseline ? "defect reproduced" : "passed"}\n`)
