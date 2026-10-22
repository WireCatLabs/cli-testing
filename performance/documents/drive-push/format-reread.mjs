import { createRequire } from "node:module"

const [root, profile, id] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const auth = authorizedClient(process.env, profile)
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const docs = docsApi({ version: "v1", auth })
const drive = driveApi({ version: "v3", auth })
for (const mode of ["DEFAULT_FOR_CURRENT_ACCESS", "PREVIEW_WITHOUT_SUGGESTIONS"]) {
  const d = (await docs.documents.get({ documentId: id, suggestionsViewMode: mode })).data
  for (const el of d.body.content) {
    const p = el.paragraph
    if (!p) continue
    const text = p.elements.map((e) => e.textRun?.content ?? "").join("")
    const suggested = JSON.stringify(p).match(/"suggested[A-Za-z]+"/g)
    if (/task|quoted|bullet b/.test(text) || suggested)
      log(`para:${mode}`, {
        text,
        bullet: p.bullet,
        runs: p.elements.map((e) => ({
          t: e.textRun?.content,
          s: e.textRun?.textStyle,
          sug: Object.keys(e.textRun ?? {}).filter((k) => k.startsWith("suggested")),
        })),
        suggested: [...new Set(suggested ?? [])],
      })
  }
}
const c = await drive.comments.list({ fileId: id, fields: "comments(anchor,quotedFileContent,deleted)" })
log("comments", { comments: c.data.comments })
