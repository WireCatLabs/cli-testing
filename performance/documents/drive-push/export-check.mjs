import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const [root, profile, id, out] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const drive = driveApi({ version: "v3", auth: authorizedClient(process.env, profile) })
for (const [ext, mimeType] of [
  ["md", "text/markdown"],
  ["html", "text/html"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["odt", "application/vnd.oasis.opendocument.text"],
  ["txt", "text/plain"],
]) {
  const r = await drive.files.export({ fileId: id, mimeType }, { responseType: "arraybuffer" })
  writeFileSync(`${out}/test.${ext}`, Buffer.from(r.data))
  process.stdout.write(`${ext} ${Buffer.from(r.data).length}\n`)
}
