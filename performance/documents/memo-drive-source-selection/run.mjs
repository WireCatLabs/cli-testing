import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [prefix, output] = process.argv.slice(2)
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON")
const modules = join(resolve(prefix), "node_modules/@wirecat")
const drive = join(modules, "drive-cli")
const memo = join(modules, "cli-memo")
const require = createRequire(join(drive, "package.json"))
const coreStore = require.resolve("@wirecat/cli-core/store")
assert.equal(
  createRequire(join(memo, "package.json")).resolve("@wirecat/cli-core/store"),
  coreStore,
  "one physical Core",
)
const { openStore } = await import(pathToFileURL(coreStore))
const { captureStreams } = await import(pathToFileURL(require.resolve("@wirecat/cli-base")))
const { createProgram } = await import(pathToFileURL(join(drive, "dist/index.js")))
const versionOf = (path) => JSON.parse(readFileSync(join(path, "package.json"), "utf8")).version
const versions = {
  drive: versionOf(drive),
  memo: versionOf(memo),
  core: versionOf(resolve(dirname(coreStore), "../..")),
}

const root = mkdtempSync(join(tmpdir(), "memo-drive-source-"))
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NO_COLOR: "1",
  NPM_CONFIG_USERCONFIG: "/dev/null",
  MESSAGING_STORE: join(root, "shared.db"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
}
for (const app of ["DRIVE", "MEMO"])
  for (const kind of ["CONFIG", "STATE", "CACHE"])
    env[`${app}_${kind}_DIR`] = join(root, app.toLowerCase(), kind.toLowerCase())
mkdirSync(env.DRIVE_CONFIG_DIR, { recursive: true })
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({
    profiles: { synthetic: { principal: "synthetic-drive-owner", roots: ["synthetic-root"], storage: "keyring" } },
  }),
)

const WORDS = "zebra harbor"
const docId = "synthetic-drive-document"
const docUrl = `https://docs.google.com/document/d/${docId}/edit`
const modifiedAt = "2026-01-02T03:04:05Z"
const file = (id, mime = "application/vnd.google-apps.document") => ({
  id,
  name: id === "synthetic-root" ? "Synthetic folder" : "Zebra harbor budget",
  parents: id === "synthetic-root" ? [] : ["synthetic-root"],
  mime,
  version: "1",
  modifiedAt,
  url: id === "synthetic-root" ? `https://drive.google.com/drive/folders/${id}` : docUrl,
  trashed: false,
  canDownload: true,
})
const source = {
  identity: async () => "synthetic-drive-owner",
  metadata: async (id) => file(id, "application/vnd.google-apps.folder"),
  children: async () => [file(docId)],
  startToken: async () => "synthetic-cursor",
  changes: async () => ({ items: [], cursor: "synthetic-next" }),
  content: async () => ({
    metadata: file(docId),
    text: `${WORDS} budget from the drive document`,
    markdown: `# Budget\n${WORDS} budget from the drive document`,
    tabs: [],
  }),
  bytes: async () => {
    throw new Error("fixture has no image")
  },
}

const streams = captureStreams()
await createProgram({ env, streams, source: async () => source }).parseAsync(["synthetic", "sync", "--json"], {
  from: "user",
})
assert.equal(JSON.parse(streams.stdout.join("")).item.pending, 0)

const store = await openStore({ path: env.MESSAGING_STORE, env, command: "memo" })
let diskFolder
try {
  await store.notes.addNote({ text: `${WORDS} budget from an internal memo note`, title: "Internal note" })
  diskFolder = await store.notes.addFolder({ name: "synthetic-vault" })
  await store.notes.saveFileNote({
    folderId: diskFolder.id,
    path: "vault-note.md",
    title: "Vault note",
    text: `${WORDS} budget from a disk folder note`,
  })
  const key = { provider: "email", account: "owner@example.com" }
  const accountId = await store.accounts.saveAccount(key, { name: "owner@example.com" })
  const sentAt = Date.parse("2026-01-03T00:00:00Z")
  await store.mail.saveThread({
    accountId,
    externalId: "synthetic-thread",
    now: sentAt,
    emails: [
      {
        externalId: "synthetic-email",
        subject: "Zebra harbor budget",
        from: { address: "colleague@example.com", name: "Synthetic colleague" },
        sentAt,
        bodyText: `${WORDS} budget from an email`,
      },
    ],
  })
} finally {
  await store.close()
}

const guard = fileURLToPath(new URL("../drive-shared-store/guard.mjs", import.meta.url))
const memoBin = join(memo, "dist/bin/memo.js")
const run = (args) =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, ["--import", guard, memoBin, ...args, "--json"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      fail(new Error(`deadline: memo ${args.join(" ")}`))
    }, 30000)
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", fail)
    child.on("close", (code) => {
      clearTimeout(timer)
      const body = code === 0 ? stdout : stderr
      let data
      try {
        data = JSON.parse(body)
      } catch {
        data = { unparsed: body.slice(0, 400) }
      }
      done({ args, code, data })
    })
  })

const origins = (items) =>
  (items ?? []).map((hit) => {
    const text = `${hit.title ?? ""} ${hit.excerpt ?? ""} ${hit.path ?? ""}`
    const origin =
      /drive document|Zebra harbor budget/.test(text) && hit.kind !== "mail"
        ? "drive"
        : /internal memo note|Internal note/.test(text)
          ? "internal"
          : /disk folder note|Vault note/.test(text)
            ? "disk"
            : /email/.test(text) || hit.kind === "mail"
              ? "mail"
              : "other"
    return {
      origin,
      kind: hit.kind,
      provider: hit.provider,
      account: hit.account,
      ref: hit.ref,
      url: hit.url ?? null,
      timestamp: hit.timestamp ?? hit.updated_at ?? null,
      source: hit.source ?? null,
    }
  })

const cases = [
  ["search", "all", WORDS, "--exact"],
  ["search", "all", WORDS, "--exact", "--only", "notes"],
  ["search", "notes", WORDS, "--exact"],
  ["search", "notes", WORDS, "--exact", "--source", "drive"],
  ["search", "notes", WORDS, "--exact", "--source", "documents"],
  ["search", "notes", WORDS, "--exact", "--source", "drive:synthetic"],
  ["search", "notes", `${WORDS} source:file`, "--exact"],
  ["search", "notes", WORDS, "--exact", "--source", "notes:internal"],
]
const results = []
for (const args of cases) {
  const { code, data } = await run(args)
  results.push({
    args,
    exit: code,
    error: code === 0 ? null : (data.error ?? data),
    hits: code === 0 ? origins(data.items) : [],
  })
}
const folders = await run(["folders", "list"])
const driveFolder = (folders.data.items ?? []).find((one) => String(one.name ?? "").startsWith("google-drive:"))
if (driveFolder) {
  const args = ["search", "notes", WORDS, "--exact", "--source", `notes:${driveFolder.id}`]
  const { code, data } = await run(args)
  results.push({
    args: [...args.slice(0, -1), "notes:<drive folder id>"],
    exit: code,
    error: code === 0 ? null : (data.error ?? data),
    hits: code === 0 ? origins(data.items) : [],
  })
}
writeFileSync(output, `${JSON.stringify({ versions, results }, null, 2)}\n`)
