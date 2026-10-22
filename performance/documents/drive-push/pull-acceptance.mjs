// Live acceptance of two-way `drive mirrors sync` on synthetic files in a new marked folder; trashed at the end.
// Usage: node pull-acceptance.mjs <drive-cli checkout, built> <profile>
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [root, profile] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { sheets: sheetsApi } = require("@googleapis/sheets")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const { paths } = await import(`${root}/dist/config.js`)
const { readDoc } = await import(`${root}/dist/mirror-docs.js`)
const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const sheets = sheetsApi({ version: "v4", auth })
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const cli = (...args) => {
  try {
    const text = execFileSync("node", [`${root}/dist/bin/drive.js`, profile, ...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return { ok: true, out: JSON.parse(text) }
  } catch (error) {
    const text = String(error.stdout ?? "")
    return { ok: false, out: text ? JSON.parse(text) : undefined }
  }
}
const item = (run) => run.out?.items?.[0] ?? {}
const configFile = join(paths(process.env).config, "config.json")
const backup = `${mkdtempSync(join(tmpdir(), "pull-acceptance-"))}/config.json`
copyFileSync(configFile, backup)
const local = mkdtempSync(join(tmpdir(), "pull-local-"))
const write = (name, text) => writeFileSync(join(local, name), text)
const read = (name) => readFileSync(join(local, name), "utf8")
/** Lines that differ between two texts, by position: how much of the file a pull touched. */
const changedLines = (a, b) => {
  const x = a.split("\n")
  const y = b.split("\n")
  return Array.from({ length: Math.max(x.length, y.length) }, (_, i) => i).filter((i) => x[i] !== y[i]).length
}
const md = `# Weekly plan

Intro with **bold**, *italic* and a [link](https://example.com).

* one
* two

* [ ] call the bank
* [x] send invoice

\`\`\`js
const x = 1
\`\`\`

closing line
`
const blocksOf = async (id) => {
  const document = (await docs.documents.get({ documentId: id })).data
  return { document, read: readDoc(document) }
}
const textOf = (placed) => placed.block.inlines?.map((inline) => inline.text).join("") ?? ""
const find = (doc, text) => doc.read.placed.find((placed) => textOf(placed).startsWith(text))

let folder
let mirrorId
try {
  folder = (
    await drive.files.create({
      requestBody: {
        name: `wirecat-pull-acceptance-${Date.now()} (synthetic, safe to delete)`,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { wirecatSpike: "pull-2026-10-22" },
      },
      fields: "id",
    })
  ).data
  write("plan.md", md)
  write("budget.csv", "item,amount\nrent,950.50\nfood,120\n")
  mirrorId = cli("mirrors", "add", local, "--parent", folder.id).out?.item?.id
  const first = cli("mirrors", "sync", mirrorId)
  log("create", { ok: first.ok, created: item(first).created, errors: item(first).errors })
  const files = (
    await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: "files(id,name,mimeType)" })
  ).data.files
  const doc = files.find((f) => f.mimeType.endsWith("document"))
  const sheet = files.find((f) => f.mimeType.endsWith("spreadsheet"))

  // Google side: an edit to the intro and a tick, which the API can only make as a full strike.
  const feedStart = (await drive.changes.getStartPageToken({})).data.startPageToken
  let current = await blocksOf(doc.id)
  const intro = find(current, "Intro")
  const call = find(current, "call the bank")
  await docs.documents.batchUpdate({
    documentId: doc.id,
    requestBody: {
      requests: [
        {
          updateTextStyle: {
            range: { startIndex: call.start, endIndex: call.end - 1 },
            textStyle: { strikethrough: true },
            fields: "strikethrough",
          },
        },
        { insertText: { location: { index: intro.start }, text: "Edited in Google. " } },
      ],
    },
  })
  const feed = (await drive.changes.list({ pageToken: feedStart, fields: "changes(fileId,time)", spaces: "drive" }))
    .data.changes
  log("change-feed-after-docs-api-edit", { docListed: feed.some((change) => change.fileId === doc.id) })

  const pulled = cli("mirrors", "sync", mirrorId)
  const afterPull = read("plan.md")
  log("pull", {
    ok: pulled.ok,
    pulled: item(pulled).pulled,
    updated: item(pulled).updated,
    introPulled: afterPull.includes("Edited in Google. Intro"),
    tickPulled: afterPull.includes("* [x] call the bank"),
    linesChanged: changedLines(md, afterPull),
    starBulletsKept: afterPull.includes("* one\n* two"),
    codeLanguageKept: afterPull.includes("```js"),
  })
  const quiet = cli("mirrors", "sync", mirrorId)
  log("after-pull", { ok: quiet.ok, pulled: item(quiet).pulled, updated: item(quiet).updated })

  // Both sides change the closing line differently; the local heading changes too.
  current = await blocksOf(doc.id)
  const closing = find(current, "closing line")
  await docs.documents.batchUpdate({
    documentId: doc.id,
    requestBody: { requests: [{ insertText: { location: { index: closing.end - 1 }, text: " from Google" } }] },
  })
  const beforeConflict = afterPull.replace("closing line", "closing line from the laptop")
  write("plan.md", beforeConflict)
  const conflict = cli("mirrors", "sync", mirrorId)
  const reported = item(conflict).conflicts?.[0]
  log("conflict", {
    ok: conflict.ok,
    reason: reported?.reason,
    parts: reported?.parts,
    localChangedAt: Boolean(reported?.local_changed_at),
    googleChangedAt: reported?.google_changed_at,
    googleChangedBy: Boolean(reported?.google_changed_by),
    localUntouched: read("plan.md") === beforeConflict,
  })
  const both = cli("mirrors", "sync", mirrorId, "--keep", "both")
  const afterBoth = await blocksOf(doc.id)
  log("keep-both", {
    ok: both.ok,
    local: read("plan.md").includes("closing line from the laptop\n\nclosing line from Google"),
    google: Boolean(find(afterBoth, "closing line from the laptop") && find(afterBoth, "closing line from Google")),
  })

  // Sheets: Google edits a cell and adds a row; the file is unchanged.
  const tab = (await sheets.spreadsheets.get({ spreadsheetId: sheet.id, fields: "sheets(properties(title))" })).data
    .sheets[0].properties.title
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheet.id,
    range: `'${tab}'!A3:B4`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["food", 130],
        ["water", 15],
      ],
    },
  })
  const sheetPull = cli("mirrors", "sync", mirrorId)
  log("sheet-pull", { ok: sheetPull.ok, pulled: item(sheetPull).pulled, csv: read("budget.csv") })
} catch (error) {
  log("crash", { status: error?.response?.status, message: String(error?.message ?? "").slice(0, 300) })
} finally {
  if (mirrorId) cli("mirrors", "remove", mirrorId)
  copyFileSync(backup, configFile)
  if (mirrorId)
    rmSync(join(paths(process.env).state, "profiles", profile, "mirrors", `${mirrorId}.json`), { force: true })
  if (folder) await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id" })
  rmSync(local, { recursive: true, force: true })
  log("cleanup", { trashed: Boolean(folder), configRestored: true })
}
