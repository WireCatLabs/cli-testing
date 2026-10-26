import { createRequire } from "node:module"

const [root, profile] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const DOC = "application/vnd.google-apps.document"
const md = async (id) =>
  (await drive.files.export({ fileId: id, mimeType: "text/markdown" }, { responseType: "text" })).data
try {
  const folder = (
    await drive.files.create({
      requestBody: {
        name: `wirecat-tick-spike-${Date.now()} (synthetic, safe to delete)`,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { wirecatSpike: "tick-2026-10-21" },
      },
      fields: "id",
    })
  ).data
  const imported = (
    await drive.files.create({
      requestBody: { name: "tick-import", mimeType: DOC, parents: [folder.id] },
      media: { mimeType: "text/markdown", body: "- [ ] open item\n- [x] done item\n" },
      fields: "id",
    })
  ).data
  log("import-export", { markdown: await md(imported.id) })
  const d = (await docs.documents.get({ documentId: imported.id })).data
  log("import-lists", {
    glyphs: Object.values(d.lists ?? {}).map(
      (l) => l.listProperties.nestingLevels[0].glyphType ?? l.listProperties.nestingLevels[0].glyphSymbol,
    ),
  })
  const html = (await drive.files.export({ fileId: imported.id, mimeType: "text/html" }, { responseType: "text" })).data
  log("import-html-strike", { lineThrough: (html.match(/line-through/g) ?? []).length })

  const built = (
    await drive.files.create({ requestBody: { name: "tick-api", mimeType: DOC, parents: [folder.id] }, fields: "id" })
  ).data
  const text = "open item\nstruck item\n"
  await docs.documents.batchUpdate({
    documentId: built.id,
    requestBody: {
      requests: [
        { insertText: { location: { index: 1 }, text } },
        {
          createParagraphBullets: {
            range: { startIndex: 1, endIndex: 1 + text.length },
            bulletPreset: "BULLET_CHECKBOX",
          },
        },
        {
          updateTextStyle: {
            range: { startIndex: 11, endIndex: 22 },
            textStyle: { strikethrough: true },
            fields: "strikethrough",
          },
        },
      ],
    },
  })
  log("api-strike-export", { markdown: await md(built.id) })
  log("folder", { id: folder.id })
} catch (e) {
  log("crash", { status: e?.response?.status, message: String(e?.message ?? "").slice(0, 300) })
}
