process.on("uncaughtException", (e) => {
  process.stdout.write(
    `${JSON.stringify({
      step: "crash",
      status: e?.response?.status ?? e?.code,
      reason: e?.errors?.[0]?.reason,
      message: String(e?.message ?? "").slice(0, 200),
    })}\n`,
  )
  process.exit(1)
})

import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { Readable } from "node:stream"

// Usage: node spike.mjs <drive-cli checkout, built> <profile> [--keep | --trash <earlier folder id>]
// Creates a marked synthetic folder in the profile's Drive, writes test files into it, then trashes it.
const [root, profile, flag, earlier] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { sheets: sheetsApi } = require("@googleapis/sheets")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)

const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const sheets = sheetsApi({ version: "v4", auth })
const DOC = "application/vnd.google-apps.document"
const SHEET = "application/vnd.google-apps.spreadsheet"
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const F = "id,name,mimeType,version,modifiedTime,webViewLink"
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const media = (mimeType, body) => ({ mimeType, body: Buffer.isBuffer(body) ? Readable.from(body) : body })
const safe = async (step, run) => {
  try {
    return await run()
  } catch (error) {
    log(step, { failed: true, status: error?.response?.status ?? error?.code, reason: error?.errors?.[0]?.reason })
  }
}
const meta = async (id) => (await drive.files.get({ fileId: id, fields: F })).data
const contentHash = async (m) =>
  createHash("sha256")
    .update(await exportText(m.id, m.mimeType === DOC ? "text/markdown" : "text/csv"))
    .digest("hex")
    .slice(0, 12)
const lastRevision = async (id) => {
  const r = (await drive.revisions.list({ fileId: id, fields: "revisions(id,modifiedTime)" })).data.revisions
  return { revisions: r.length, lastRevision: r.at(-1)?.id }
}
const stamp = async (step, id) => {
  const m = await meta(id)
  log(step, {
    version: m.version,
    modifiedTime: m.modifiedTime,
    ...(await lastRevision(id)),
    hash: await contentHash(m),
  })
  return m
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const exportText = async (id, mimeType) =>
  (await drive.files.export({ fileId: id, mimeType }, { responseType: "text" })).data
const exportBytes = async (id, mimeType) =>
  Buffer.from((await drive.files.export({ fileId: id, mimeType }, { responseType: "arraybuffer" })).data)

if (flag === "--trash" && earlier) {
  await drive.files.update({ fileId: earlier, requestBody: { trashed: true }, fields: "id" })
  log("trashed-previous", { folder: earlier })
}
const about = await drive.about.get({ fields: "importFormats" })
const formats = about.data.importFormats
log("import-formats", Object.fromEntries(["text/markdown", "text/csv", DOCX, XLSX].map((m) => [m, formats[m] ?? null])))

const folder = (
  await drive.files.create({
    requestBody: {
      name: `wirecat-push-spike-${Date.now()} (synthetic, safe to delete)`,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { wirecatSpike: "push-2026-10-21" },
    },
    fields: "id,webViewLink",
  })
).data
log("folder", { id: folder.id, url: folder.webViewLink })

const md1 = `# Synthetic push test

Some **bold**, *italic* and a [link](https://example.com).

- one
- two
  - nested

| col a | col b |
|---|---|
| 1 | 2 |

\`\`\`js
const x = 1
\`\`\`

![local image](./missing.png)

![web image](https://www.gstatic.com/images/branding/product/2x/docs_48dp.png)
`
const doc = (
  await drive.files.create({
    requestBody: {
      name: "push-test.md",
      mimeType: DOC,
      parents: [folder.id],
      appProperties: { wirecatOrigin: "spike-md" },
    },
    media: media("text/markdown", md1),
    fields: F,
  })
).data
log("md-create", { mimeType: doc.mimeType, version: doc.version, name: doc.name })
log("md-export-after-create", {
  markdown: (await exportText(doc.id, "text/markdown")).replace(/data:[^>]+/g, "data:…"),
})
const found = await drive.files.list({
  q: `appProperties has { key='wirecatOrigin' and value='spike-md' } and trashed=false`,
  fields: "files(id)",
})
log("find-by-origin", { matches: found.data.files.length, same: found.data.files[0]?.id === doc.id })

await stamp("doc-before-comment", doc.id)
await drive.comments.create({ fileId: doc.id, fields: "id", requestBody: { content: "synthetic comment" } })
await stamp("doc-after-comment", doc.id)
const perm = await safe("share", () =>
  drive.permissions.create({
    fileId: doc.id,
    fields: "id",
    requestBody: { type: "anyone", role: "reader", allowFileDiscovery: false },
  }),
)
await stamp("doc-after-share", doc.id)
if (perm) await drive.permissions.delete({ fileId: doc.id, permissionId: perm.data.id })
await stamp("doc-after-unshare", doc.id)
await docs.documents.batchUpdate({
  documentId: doc.id,
  requestBody: { requests: [{ insertText: { location: { index: 1 }, text: "Edited in Google. " } }] },
})
for (const seconds of [0, 10, 30, 60]) {
  await wait(seconds === 0 ? 0 : 10000 * (seconds === 10 ? 1 : seconds === 30 ? 2 : 3))
  await stamp(`doc-after-google-edit+${seconds}s`, doc.id)
}
const beforeReplace = await meta(doc.id)
const revBefore = (await drive.revisions.list({ fileId: doc.id, fields: "revisions(id)" })).data.revisions.length

const md2 = md1.replace("Synthetic push test", "Synthetic push test v2").replace("- two", "- two (changed)")
const replaced = await safe(
  "md-replace-media-only",
  async () => (await drive.files.update({ fileId: doc.id, media: media("text/markdown", md2), fields: F })).data,
)
if (replaced) {
  log("md-replace-media-only", {
    sameId: replaced.id === doc.id,
    mimeType: replaced.mimeType,
    version: replaced.version,
    modifiedTime: replaced.modifiedTime,
    versionChanged: replaced.version !== beforeReplace.version,
  })
  log("md-export-after-replace", {
    markdown: (await exportText(doc.id, "text/markdown")).replace(/data:[^>]+/g, "data:…"),
  })
}
const comments = await drive.comments.list({ fileId: doc.id, fields: "comments(id,deleted,anchor)" })
log("comments-after-replace", { comments: comments.data.comments })
const revAfter = (await drive.revisions.list({ fileId: doc.id, fields: "revisions(id)" })).data.revisions.length
log("revisions", { before: revBefore, after: revAfter })
await stamp("doc-final", doc.id)

const docxBytes = await exportBytes(doc.id, DOCX)
const fromDocx = await safe(
  "docx-create",
  async () =>
    (
      await drive.files.create({
        requestBody: { name: "push-test.docx", mimeType: DOC, parents: [folder.id] },
        media: media(DOCX, docxBytes),
        fields: F,
      })
    ).data,
)
if (fromDocx) log("docx-create", { mimeType: fromDocx.mimeType, docxBytes: docxBytes.length })

const csv1 = "name,qty,price\napple,3,1.5\npear,2,2.25\n"
const sheet = (
  await drive.files.create({
    requestBody: { name: "push-test.csv", mimeType: SHEET, parents: [folder.id] },
    media: media("text/csv", csv1),
    fields: F,
  })
).data
log("csv-create", { mimeType: sheet.mimeType, version: sheet.version })
const firstTab = (await sheets.spreadsheets.get({ spreadsheetId: sheet.id, fields: "sheets(properties(sheetId))" }))
  .data.sheets[0].properties.sheetId
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: sheet.id,
  requestBody: {
    requests: [
      { addSheet: { properties: { title: "Notes" } } },
      {
        repeatCell: {
          range: { sheetId: firstTab, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold",
        },
      },
    ],
  },
})
await sheets.spreadsheets.values.update({
  spreadsheetId: sheet.id,
  range: "Notes!A1",
  valueInputOption: "USER_ENTERED",
  requestBody: { values: [["note added in Google"]] },
})
await wait(15000)
const sheetBefore = await stamp("sheet-after-google-edit+15s", sheet.id)
const csv2 = "name,qty,price\napple,4,1.5\npear,2,2.25\nplum,7,0.5\n"
const sheetReplaced = await safe(
  "csv-replace-media-only",
  async () => (await drive.files.update({ fileId: sheet.id, media: media("text/csv", csv2), fields: F })).data,
)
if (sheetReplaced) {
  const info = (await sheets.spreadsheets.get({ spreadsheetId: sheet.id, fields: "sheets(properties(sheetId,title))" }))
    .data
  const values = (await sheets.spreadsheets.values.get({ spreadsheetId: sheet.id, range: "A1:C5" })).data.values
  const bold = (
    await sheets.spreadsheets.get({
      spreadsheetId: sheet.id,
      ranges: ["A1"],
      fields: "sheets(data(rowData(values(effectiveFormat(textFormat(bold))))))",
    })
  ).data.sheets[0].data[0].rowData?.[0]?.values?.[0]?.effectiveFormat?.textFormat?.bold
  log("csv-replace-media-only", {
    sameId: sheetReplaced.id === sheet.id,
    mimeType: sheetReplaced.mimeType,
    versionChanged: sheetReplaced.version !== sheetBefore.version,
    tabs: info.sheets.map((s) => s.properties.title),
    values,
    headerStillBold: bold ?? false,
  })
}

const xlsxBytes = await exportBytes(sheet.id, XLSX)
const fromXlsx = await safe(
  "xlsx-create",
  async () =>
    (
      await drive.files.create({
        requestBody: { name: "push-test.xlsx", mimeType: SHEET, parents: [folder.id] },
        media: media(XLSX, xlsxBytes),
        fields: F,
      })
    ).data,
)
if (fromXlsx) {
  const tabs = (await sheets.spreadsheets.get({ spreadsheetId: fromXlsx.id, fields: "sheets(properties(title))" })).data
  log("xlsx-create", { mimeType: fromXlsx.mimeType, tabs: tabs.sheets.map((s) => s.properties.title) })
  const xlsxReplaced = await safe(
    "xlsx-replace",
    async () => (await drive.files.update({ fileId: fromXlsx.id, media: media(XLSX, xlsxBytes), fields: F })).data,
  )
  if (xlsxReplaced) log("xlsx-replace", { sameId: xlsxReplaced.id === fromXlsx.id, mimeType: xlsxReplaced.mimeType })
}

if (flag === "--keep") log("kept", { folder: folder.webViewLink })
else {
  await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id" })
  log("trashed", { folder: folder.id })
}
