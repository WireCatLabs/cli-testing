import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const [input, destination, mode] = process.argv.slice(2)
assert.ok(mode === undefined || mode === "--save-only")
assert.ok(input && destination, "run.mjs PACKAGE_DIRECTORY OUTPUT_JSON")
assert.ok(process.env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY must be provided through the environment")
const pkg = resolve(input)
const require = createRequire(join(pkg, "package.json"))
const { openStore } = await import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
const coreRoot = resolve(dirname(require.resolve("@wirecat/cli-core/store")), "../..")
const core = JSON.parse(readFileSync(join(coreRoot, "package.json"), "utf8"))
const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"))
const root = mkdtempSync(join(tmpdir(), "drive-quality-"))
const env = {
  HOME: root,
  PATH: process.env.PATH,
  NPM_CONFIG_USERCONFIG: "/dev/null",
  NO_COLOR: "1",
  DRIVE_CONFIG_DIR: join(root, "config"),
  DRIVE_STATE_DIR: join(root, "state"),
  DRIVE_CACHE_DIR: join(root, "cache"),
  WIRECAT_STATE_DIR: join(root, "wirecat"),
  MESSAGING_STORE: join(root, "shared.db"),
  DRIVE_MODELS_MEMORIES_PROVIDER: "openai",
  DRIVE_MODELS_MEMORIES_MODEL: "deepseek-flash",
  DRIVE_MODELS_MEMORIES_BASE_URL: "https://api.deepseek.com",
  DRIVE_OPENAI_API_KEY: process.env.DEEPSEEK_API_KEY,
}
mkdirSync(env.DRIVE_CONFIG_DIR, { recursive: true })
writeFileSync(
  join(env.DRIVE_CONFIG_DIR, "config.json"),
  JSON.stringify({ profiles: { synthetic: { principal: "synthetic-quality-owner", roots: [], storage: "keyring" } } }),
  { mode: 0o600 },
)
const state = {
  version: 1,
  principal: "synthetic-quality-owner",
  store: env.MESSAGING_STORE,
  scope: "",
  folders: {},
  documents: {},
  skipped: [],
}
const directory = join(env.DRIVE_STATE_DIR, "profiles/synthetic")
mkdirSync(join(directory, "documents"), { recursive: true })
const store = await openStore({ path: env.MESSAGING_STORE, env, command: "drive" })
try {
  const folder = await store.notes.addFolder({ name: "google-drive:synthetic-quality-owner" })
  for (const fixture of cases) {
    const id = `synthetic-${fixture.id}`
    const hash = createHash("sha256").update(fixture.text).digest("hex")
    const file = {
      id,
      name: fixture.id,
      parents: [],
      mime: "application/vnd.google-apps.document",
      url: `https://docs.google.com/document/d/${id}/edit`,
      trashed: false,
      canDownload: true,
    }
    const { note } = await store.notes.saveFileNote({
      folderId: folder.id,
      path: `${id}.md`,
      title: fixture.id,
      text: fixture.text,
      contentHash: hash,
      frontMatter: { source: "google-drive", sourceUrl: file.url, fileId: id },
    })
    state.documents[id] = { metadata: file, hash, reference: note.ref, tabs: 0 }
    writeFileSync(
      join(directory, "documents", `${id}.json`),
      JSON.stringify({ metadata: file, text: fixture.text, markdown: fixture.text, tabs: [] }),
      { mode: 0o600 },
    )
  }
} finally {
  await store.close()
}
writeFileSync(join(directory, "state.json"), JSON.stringify(state), { mode: 0o600 })
const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url))
const results = []
const allRuns = cases.flatMap((fixture, index) =>
  index === 0 ? [fixture, { ...fixture, source_id: fixture.id, id: `${fixture.id}-save`, save: true }] : [fixture],
)
const runs = mode === "--save-only" ? allRuns.filter((fixture) => fixture.save) : allRuns
for (const fixture of runs) {
  const started = Date.now()
  const answer = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        guard,
        join(pkg, "dist/bin/drive.js"),
        "synthetic",
        "memories",
        "extract",
        `synthetic-${fixture.source_id ?? fixture.id}`,
        ...(fixture.save ? ["--yes"] : []),
        "--scope",
        "work",
        "--json",
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    )
    let stdout = "",
      stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("quality CLI deadline"))
    }, 145000)
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(timer)
      for (const key of [process.env.DEEPSEEK_API_KEY, process.env.OPENAI_API_KEY].filter(Boolean))
        assert.ok(!`${stdout}${stderr}`.includes(key), "credential leaked")
      let data
      try {
        data = JSON.parse(stdout.trim() || stderr.trim())
      } catch {
        data = { error: { code: "invalid_json" } }
      }
      resolve({ code, data })
    })
  })
  const item = answer.data.item
  if (item) {
    assert.ok(item.items.every((one) => fixture.text.includes(one.quote)))
    assert.ok(fixture.save ? item.saved.length === item.items.length : item.saved.length === 0)
    assert.ok(
      item.saved.every((one) => one.status === "proposed"),
      "model saves remain proposed",
    )
  }
  const result = {
    id: fixture.id,
    mode: fixture.save ? "save" : "preview",
    duration_ms: Date.now() - started,
    exit: answer.code,
    ...(item
      ? {
          proposals: item.items,
          model: item.model,
          provider: item.provider,
          tokens: item.tokens,
          exact_quotes: item.items.every((one) => fixture.text.includes(one.quote)),
          saved: item.saved.length,
          saved_statuses: item.saved.map((one) => one.status),
        }
      : { error: answer.data.error?.code, reason: answer.data.error?.reason }),
  }
  results.push(result)
  writeFileSync(
    resolve(destination),
    `${JSON.stringify({ date: new Date().toISOString(), runtime: process.version, drive: metadata.version, core: core.version, model: env.DRIVE_MODELS_MEMORIES_MODEL, endpoint: env.DRIVE_MODELS_MEMORIES_BASE_URL, source: "synthetic fixtures only", results }, null, 2)}\n`,
  )
  process.stdout.write(`${fixture.id}: ${answer.code === 0 ? `${item.items.length} proposals` : result.error}\n`)
}
