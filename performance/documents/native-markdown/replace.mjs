// Replaces a Drive file's bytes in place (uploadType=media), with drive-cli's saved sign-in; the token is never printed.
import { readFileSync } from "node:fs"

const [repo, profile, fileId, path] = process.argv.slice(2)
const { authorizedClient } = await import(`${repo}/dist/tokens.js`)
const response = await authorizedClient(process.env, profile).request({
  url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,mimeType`,
  method: "PATCH",
  headers: { "content-type": "text/markdown" },
  body: readFileSync(path),
})
process.stdout.write(`${JSON.stringify(response.data)}\n`)
