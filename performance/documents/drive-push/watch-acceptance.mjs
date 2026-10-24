// Live acceptance of `drive mirrors watch` on synthetic files in a new marked folder; trashed at the end.
// Usage: node watch-acceptance.mjs <drive-cli checkout, built> <profile> [--hand]
// With --hand it prints the Doc's link and waits up to 15 minutes for an edit made by a person in the editor.
import { execFileSync, spawn } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"

const [root, profile, mode] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const { paths } = await import(`${root}/dist/config.js`)
const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const cli = (...args) =>
  JSON.parse(
    execFileSync("node", [`${root}/dist/bin/drive.js`, profile, ...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  )
const configFile = join(paths(process.env).config, "config.json")
const backup = `${mkdtempSync(join(tmpdir(), "watch-acceptance-"))}/config.json`
copyFileSync(configFile, backup)
const local = mkdtempSync(join(tmpdir(), "watch-local-"))
const write = (name, text) => writeFileSync(join(local, name), text)
const read = (name) => readFileSync(join(local, name), "utf8")
const docText = async (id) =>
  (await docs.documents.get({ documentId: id })).data.body.content
    .flatMap((element) => element.paragraph?.elements ?? [])
    .map((element) => element.textRun?.content ?? "")
    .join("")

// Every cycle the watch prints, with the time it arrived.
const cycles = []
let ended
const waiters = []
const seen = () => {
  for (const waiter of [...waiters])
    if (waiter.test()) {
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.done(true)
    }
}
const until = (test, ms) =>
  new Promise((done) => {
    if (test()) return done(true)
    const waiter = { test, done }
    waiters.push(waiter)
    setTimeout(() => {
      if (waiters.includes(waiter)) {
        waiters.splice(waiters.indexOf(waiter), 1)
        done(false)
      }
    }, ms)
  })
const after = (since, test) => cycles.filter((cycle) => cycle.at >= since && test(cycle))
const summary = (cycle) => ({
  triggers: cycle.data.triggers,
  error: cycle.data.error?.code,
  created: cycle.data.results?.flatMap((r) => r.created).length ?? 0,
  sent: cycle.data.results?.flatMap((r) => r.updated).length ?? 0,
  pulled: cycle.data.results?.flatMap((r) => r.pulled).length ?? 0,
  conflicts: cycle.data.results?.flatMap((r) => r.conflicts).length ?? 0,
})

let folder
let mirrorId
let watcher
try {
  folder = (
    await drive.files.create({
      requestBody: {
        name: `wirecat-watch-acceptance-${Date.now()} (synthetic, safe to delete)`,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { wirecatSpike: "watch-2026-10-24" },
      },
      fields: "id",
    })
  ).data
  write("notes.md", "# Watch check\n\nfirst paragraph\n\nsecond paragraph\n")
  mirrorId = cli("mirrors", "add", local, "--parent", folder.id).item.id

  const started = Date.now()
  watcher = spawn(
    "node",
    [`${root}/dist/bin/drive.js`, profile, "mirrors", "watch", mirrorId, "--every", "10s", "--jsonl"],
    {
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
  createInterface({ input: watcher.stdout }).on("line", (line) => {
    const record = JSON.parse(line)
    if (record.type === "item") cycles.push({ at: Date.now(), data: record.data })
    else ended = record
    seen()
  })
  await until(() => cycles.length >= 1, 120_000)
  log("start", { seconds: (cycles[0].at - started) / 1000, ...summary(cycles[0]) })
  const doc = (
    await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: "files(id,mimeType)" })
  ).data.files.find((file) => file.mimeType.endsWith("document"))

  // A local save reaches the Doc.
  const saved = Date.now()
  write("notes.md", "# Watch check\n\nfirst paragraph, edited on the laptop\n\nsecond paragraph\n")
  const sent = await until(() => after(saved, (c) => c.data.results?.some((r) => r.updated.length)).length > 0, 60_000)
  const sentCycle = after(saved, (c) => c.data.results?.some((r) => r.updated.length))[0]
  log("local-save", {
    sent,
    seconds: sentCycle ? (sentCycle.at - saved) / 1000 : undefined,
    triggers: sentCycle?.data.triggers,
    inDoc: (await docText(doc.id)).includes("edited on the laptop"),
  })

  // A Docs API edit reaches the file: through the change feed, or at worst the 30-minute full run.
  await new Promise((done) => setTimeout(done, 15_000))
  const content = (await docs.documents.get({ documentId: doc.id })).data.body.content
  const second = content.find((element) =>
    element.paragraph?.elements?.some((run) => run.textRun?.content?.startsWith("second paragraph")),
  )
  const edited = Date.now()
  await docs.documents.batchUpdate({
    documentId: doc.id,
    requestBody: { requests: [{ insertText: { location: { index: second.startIndex }, text: "From Google: " } }] },
  })
  const pulled = await until(
    () => after(edited, (c) => c.data.results?.some((r) => r.pulled.length)).length > 0,
    300_000,
  )
  const pullCycle = after(edited, (c) => c.data.results?.some((r) => r.pulled.length))[0]
  log("docs-api-edit", {
    pulled,
    seconds: pullCycle ? (pullCycle.at - edited) / 1000 : undefined,
    triggers: pullCycle?.data.triggers,
    inFile: read("notes.md").includes("From Google: second paragraph"),
  })

  // How many cycles follow one edit: one for the edit, at most one more for our own write's echo in the feed.
  await new Promise((done) => setTimeout(done, 60_000))
  log("cycles-after-edits", {
    afterLocalSave: after(saved, () => true)
      .filter((c) => c.at < edited)
      .map(summary),
    afterGoogleEdit: after(edited, () => true).map(summary),
  })

  if (mode === "--hand") {
    process.stderr.write(`\nEdit the Doc by hand now (add a word anywhere): ${doc.id}\n`)
    log("hand-edit-wait", { doc: `https://docs.google.com/document/d/${doc.id}/edit` })
    const before = read("notes.md")
    const asked = Date.now()
    const handPulled = await until(
      () => after(asked, (c) => c.data.results?.some((r) => r.pulled.length)).length > 0,
      900_000,
    )
    const handCycle = after(asked, (c) => c.data.results?.some((r) => r.pulled.length))[0]
    log("hand-edit", {
      pulled: handPulled,
      triggers: handCycle?.data.triggers,
      secondsFromAsk: handCycle ? (handCycle.at - asked) / 1000 : undefined,
      fileChanged: read("notes.md") !== before,
    })
  }

  watcher.kill("SIGINT")
  const code = await new Promise((done) => watcher.on("exit", done))
  log("stop", { exitCode: code, endRecord: ended?.type, complete: ended?.complete, cycles: cycles.length })
} catch (error) {
  log("crash", { status: error?.response?.status, message: String(error?.message ?? "").slice(0, 300) })
} finally {
  if (watcher && watcher.exitCode === null) watcher.kill("SIGINT")
  if (mirrorId) cli("mirrors", "remove", mirrorId)
  copyFileSync(backup, configFile)
  if (mirrorId)
    rmSync(join(paths(process.env).state, "profiles", profile, "mirrors", `${mirrorId}.json`), { force: true })
  if (folder) await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id" })
  rmSync(local, { recursive: true, force: true })
  log("cleanup", { trashed: Boolean(folder), configRestored: true })
}
