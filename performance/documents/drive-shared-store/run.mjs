import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [prefix, output] = process.argv.slice(2)
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON")
const modules = join(resolve(prefix), "node_modules/@wirecat")
const drive = join(modules, "drive-cli")
const require = createRequire(join(drive, "package.json"))
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const { captureStreams } = await import(pathToFileURL(require.resolve("@wirecat/cli-base")))
const { createProgram } = await import(pathToFileURL(join(drive, "dist/index.js")))
const coreRoot = resolve(dirname(require.resolve("@wirecat/cli-core/store")), "../..")
const core = JSON.parse(readFileSync(join(coreRoot, "package.json"), "utf8"))
const root = mkdtempSync(join(tmpdir(), "drive-cross-cli-"))
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NO_COLOR: "1",
  NPM_CONFIG_USERCONFIG: "/dev/null",
  MESSAGING_STORE: join(root, "shared.db"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
}
for (const app of ["DRIVE", "TG", "MAX", "MEMO"]) {
  for (const kind of ["CONFIG", "STATE", "CACHE"])
    env[`${app}_${kind}_DIR`] = join(root, app.toLowerCase(), kind.toLowerCase())
}
for (const app of ["TG", "MAX"]) {
  const path = join(env[`${app}_STATE_DIR`], "accounts")
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, "synthetic.json"), JSON.stringify({ account: app === "TG" ? "500" : "600" }))
}
mkdirSync(env.DRIVE_CONFIG_DIR, { recursive: true })
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({
    profiles: { synthetic: { principal: "synthetic-drive-owner", roots: ["synthetic-root"], storage: "keyring" } },
  }),
)
const id = "synthetic-shared-document"
const url = `https://docs.google.com/document/d/${id}/edit`
const file = (id, mime = "application/vnd.google-apps.document") => ({
  id,
  name: id === "synthetic-root" ? "Synthetic folder" : "Zebra harbor budget",
  parents: id === "synthetic-root" ? [] : ["synthetic-root"],
  mime,
  version: "1",
  modifiedAt: "2026-01-02T03:04:05Z",
  url: id === "synthetic-root" ? `https://drive.google.com/drive/folders/${id}` : url,
  trashed: false,
  canDownload: true,
})
let reads = 0
const source = {
  identity: async () => "synthetic-drive-owner",
  metadata: async (id) => file(id, "application/vnd.google-apps.folder"),
  children: async () => [file(id)],
  startToken: async () => "synthetic-cursor",
  changes: async () => ({ items: [], cursor: "synthetic-next" }),
  content: async () => {
    reads++
    return {
      metadata: file(id),
      text: "zebra harbor budget approved at 120 units",
      markdown: "# Budget\nzebra harbor budget approved at 120 units",
      tabs: [],
    }
  },
  bytes: async () => {
    throw new Error("fixture has no image")
  },
}
const message = (id) => ({
  id,
  chatId: "7",
  senderId: "10",
  senderName: "Synthetic colleague",
  timestamp: "2026-01-01T00:00:00Z",
  editedAt: null,
  text: `Shared budget ${url}`,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})
const addMessages = async (number) => {
  const store = await openStore({ path: env.MESSAGING_STORE, env, command: "drive" })
  try {
    for (const [provider, account] of [
      ["telegram", "500"],
      ["max", "600"],
    ]) {
      await store.saveChats({ provider, account }, [
        {
          id: "7",
          title: "Synthetic planning",
          kind: "group",
          unreadCount: 0,
          lastMessageAt: null,
          participantsCount: null,
        },
      ])
      await store.saveMessages({ provider, account }, "7", [message(String(number))], { via: "history" })
    }
  } finally {
    await store.close()
  }
}
const sync = async () => {
  const streams = captureStreams()
  const program = createProgram({ env, streams, source: async () => source })
  await program.parseAsync(["synthetic", "sync", "--json"], { from: "user" })
  const result = JSON.parse(streams.stdout.join(""))
  assert.equal(result.item.pending, 0)
}
const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url))
const checks = []
const versions = {}
const artifacts = {}
const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
const run = async (app, args) => {
  const name = app === "tg" ? "tg-cli" : app === "max" ? "max-cli" : app === "memo" ? "cli-memo" : "drive-cli"
  const pkg = join(modules, name)
  versions[app] = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version
  const installed = lock.packages[`node_modules/@wirecat/${name}`]
  artifacts[app] = {
    type: installed.resolved?.startsWith("https://registry.npmjs.org/") ? "registry" : "packed consumer candidate",
    integrity: installed.integrity,
    bin_sha256: createHash("sha256")
      .update(readFileSync(join(pkg, `dist/bin/${app}.js`)))
      .digest("hex"),
  }
  const readerCore = createRequire(join(pkg, "package.json")).resolve("@wirecat/cli-core/store")
  assert.equal(readerCore, require.resolve("@wirecat/cli-core/store"), "one physical released Core")
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", guard, join(pkg, `dist/bin/${app}.js`), ...args, "--json"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = "",
      stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("cross-CLI deadline"))
    }, 30000)
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(timer)
      assert.equal(code, 0, `${app} ${args.join(" ")}: ${stderr.slice(0, 500)}`)
      const data = JSON.parse(stdout)
      assert.equal(data.meta?.complete, true, `${app} ${args.join(" ")}: ${JSON.stringify(data.meta)}`)
      checks.push({ app, args, exit: code })
      resolve(data)
    })
  })
}
await addMessages(1)
await sync()
assert.equal(reads, 1)
for (const app of ["tg", "max"]) {
  const found = await run(app, [
    "synthetic",
    "--offline",
    "search",
    "all",
    "zebra",
    "--only",
    "notes",
    "--source",
    "drive:synthetic",
    "--exact",
  ])
  assert.equal(found.items.length, 1)
  assert.equal(found.items[0].kind, "document")
  assert.equal(found.items[0].url, url)
  assert.equal(found.items[0].timestamp, "2026-01-02T03:04:05Z")
  assert.equal(found.items[0].account, "synthetic")
  const chat = await run(app, ["synthetic", "--offline", "chats", "documents", "list", "7"])
  assert.equal(chat.items.length, 1)
  assert.equal(chat.items[0].in_store, true)
  assert.equal(chat.items[0].title, "Zebra harbor budget")
}
const mixed = await run("tg", [
  "synthetic",
  "--offline",
  "search",
  "all",
  "budget",
  "--only",
  "messages,notes",
  "--exact",
])
assert.ok(mixed.items.some((item) => item.kind === "document" && item.url === url))
assert.ok(mixed.items.some((item) => item.kind === "message"))
const memo = await run("memo", ["search", "all", "zebra", "--only", "notes", "--exact"])
assert.ok(memo.items.some((item) => item.kind === "document" && item.url === url))
await run("drive", ["synthetic", "--offline", "tags", "add", id, "shared-proof"])
for (const app of ["tg", "max"]) {
  const found = await run(app, [
    "synthetic",
    "--offline",
    "search",
    "notes",
    "tag:shared-proof",
    "--source",
    "drive:synthetic",
    "--exact",
  ])
  assert.equal(found.items.length, 1)
  assert.equal(found.items[0].url, url)
}
await addMessages(2)
await sync()
await sync()
assert.equal(reads, 1, "unchanged sources are not downloaded for new messages")
for (const app of ["tg", "max"]) {
  const chat = await run(app, ["synthetic", "--offline", "chats", "documents", "list", "7"])
  assert.equal(chat.items.length, 2)
  assert.ok(chat.items.every((item) => item.in_store && item.title === "Zebra harbor budget"))
}
await run("drive", ["synthetic", "--offline", "documents", "show", id])
writeFileSync(
  resolve(output),
  `${JSON.stringify({ status: "passed", date: new Date().toISOString(), runtime: process.version, core: core.version, versions, artifacts, synthetic_source_syncs: 3, source_content_reads: reads, checks }, null, 2)}\n`,
)
process.stdout.write(`${checks.length} executable checks passed across Drive, Telegram, MAX and Memo\n`)
