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
const strip = (o) =>
  JSON.parse(JSON.stringify(o, (k, v) => (k === "startIndex" || k === "endIndex" || k === "content" ? undefined : v)))
let d = (await docs.documents.get({ documentId: id })).data
const para = (t) =>
  d.body.content.find((e) => e.paragraph?.elements.map((x) => x.textRun?.content ?? "").join("") === t)
log("task-open", { json: strip(para("task open\n").paragraph) })
log("task-done", { json: strip(para("task done\n").paragraph) })
const target = para("after rule\n")
await docs.documents.batchUpdate({
  documentId: id,
  requestBody: {
    requests: [
      { deleteContentRange: { range: { startIndex: target.startIndex, endIndex: target.endIndex - 1 } } },
      { insertText: { location: { index: target.startIndex }, text: "after rule, edited by push" } },
    ],
    writeControl: { requiredRevisionId: d.revisionId },
  },
})
const c = await drive.comments.list({ fileId: id, fields: "comments(anchor,quotedFileContent,deleted)" })
log("comments-after-other-block-edit", { comments: c.data.comments })
d = (await docs.documents.get({ documentId: id })).data
log("quoted-still-there", { ok: !!para("quoted text\n") })
