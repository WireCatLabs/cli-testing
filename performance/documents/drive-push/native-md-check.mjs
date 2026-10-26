// Live check of Google Docs' native Markdown editing and of the Drive change feed after hand edits, on synthetic
// files in a new marked folder. Three phases, with a person editing in the browser between setup and check:
//   node native-md-check.mjs <drive-cli checkout, built> <profile> setup <state.json>
//   node native-md-check.mjs <drive-cli checkout, built> <profile> check <state.json>
//   node native-md-check.mjs <drive-cli checkout, built> <profile> inspect <state.json>
//   node native-md-check.mjs <drive-cli checkout, built> <profile> cleanup <state.json>
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { Readable } from "node:stream"

const [root, profile, phase, statePath] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)

const markdown = `# Native editing check

Plain paragraph with **bold** and a [link](https://example.com).

- [ ] open item
- [x] done item

| a | b |
|---|---|
| 1 | 2 |

closing line
`
const download = async (id) => (await drive.files.get({ fileId: id, alt: "media" }, { responseType: "text" })).data

if (phase === "setup") {
  const folder = (
    await drive.files.create({
      requestBody: {
        name: `wirecat-native-md-check-${Date.now()} (synthetic, safe to delete)`,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { wirecatSpike: "native-md-2026-10-23" },
      },
      fields: "id",
    })
  ).data
  const md = (
    await drive.files.create({
      requestBody: { name: "notes.md", parents: [folder.id], mimeType: "text/markdown" },
      media: { mimeType: "text/markdown", body: Readable.from([markdown]) },
      fields: "id,mimeType,webViewLink",
    })
  ).data
  const doc = (
    await drive.files.create({
      requestBody: { name: "feed check", parents: [folder.id], mimeType: "application/vnd.google-apps.document" },
      fields: "id,webViewLink",
    })
  ).data
  await docs.documents.batchUpdate({
    documentId: doc.id,
    requestBody: { requests: [{ insertText: { location: { index: 1 }, text: "type a word after this line\n" } }] },
  })
  const token = (await drive.changes.getStartPageToken({})).data.startPageToken
  writeFileSync(
    statePath,
    JSON.stringify({ folder: folder.id, md: md.id, doc: doc.id, token, at: new Date().toISOString() }),
  )
  log("setup", { mdMime: md.mimeType, mdLink: md.webViewLink, docLink: doc.webViewLink })
} else if (phase === "check") {
  const state = JSON.parse(readFileSync(statePath, "utf8"))
  const changes = []
  for (let pageToken = state.token; pageToken; ) {
    const page = (
      await drive.changes.list({
        pageToken,
        fields: "nextPageToken,newStartPageToken,changes(fileId,time,file(mimeType))",
        spaces: "drive",
      })
    ).data
    changes.push(...(page.changes ?? []))
    pageToken = page.nextPageToken
  }
  const listed = (id) => changes.filter((change) => change.fileId === id).map((change) => change.time)
  log("change-feed", { docListed: listed(state.doc), mdListed: listed(state.md), since: state.at })

  const meta = (
    await drive.files.get({ fileId: state.md, fields: "mimeType,modifiedTime,version,headRevisionId,size" })
  ).data
  const text = await download(state.md)
  log("md-after-hand-edit", {
    mimeType: meta.mimeType,
    stillMarkdown: meta.mimeType === "text/markdown",
    changedFromUpload: text !== markdown,
    tickLine: text.split("\n").find((line) => line.includes("open item")),
    tableKept: text.includes("| a | b |"),
    boldKept: text.includes("**bold**"),
    bytes: text.length,
  })
  const comments = (
    await drive.comments.list({ fileId: state.md, fields: "comments(id,anchor,quotedFileContent,deleted)" })
  ).data.comments
  log("md-comments", { count: comments?.length ?? 0, anchored: comments?.filter((c) => c.anchor).length ?? 0 })
  const docText = (await docs.documents.get({ documentId: state.doc })).data.body.content
    .flatMap((element) => element.paragraph?.elements ?? [])
    .map((element) => element.textRun?.content ?? "")
    .join("")
  log("doc-after-hand-edit", { handEditSeen: docText.trim() !== "type a word after this line" })

  // An outside edit, as a local sync would make: does a comment survive a media upload of new content?
  await drive.files.update({
    fileId: state.md,
    media: { mimeType: "text/markdown", body: Readable.from([`${text.trimEnd()}\n\nline added from outside\n`]) },
    fields: "id",
  })
  const after = (await drive.comments.list({ fileId: state.md, fields: "comments(id,deleted)" })).data.comments
  log("md-comments-after-outside-edit", {
    count: after?.length ?? 0,
    stillThere: (after ?? []).filter((c) => !c.deleted).length,
  })
} else if (phase === "inspect") {
  // Docs keeps comments on a native .md inside the file, not in the Drive comments list; count them without
  // printing the file, which carries the commenter's name.
  const state = JSON.parse(readFileSync(statePath, "utf8"))
  const text = await download(state.md)
  const listed = (await drive.comments.list({ fileId: state.md, includeDeleted: true, fields: "comments(id)" })).data
    .comments
  const revisions = (await drive.revisions.list({ fileId: state.md, fields: "revisions(mimeType)" })).data.revisions
  log("md-inline-comments", {
    markers: text.match(/<!-- gdoc_comment_begin: /g)?.length ?? 0,
    trailer: /^gdoc_comments:$/m.test(text),
    trailerHasAuthor: /^\s+author: /m.test(text),
    trailerHasBody: /^\s+body: /m.test(text),
    trailerHasToken: /^\s+token: /m.test(text),
    commentsApiCount: listed?.length ?? 0,
    tableSeparator: text.split("\n").find((line) => line.startsWith("| :-") || line.startsWith("|---")),
    revisions: revisions.length,
    revisionMimes: [...new Set(revisions.map((revision) => revision.mimeType))],
  })
} else if (phase === "cleanup") {
  const state = JSON.parse(readFileSync(statePath, "utf8"))
  await drive.files.update({ fileId: state.folder, requestBody: { trashed: true }, fields: "id" })
  log("cleanup", { trashed: true })
}
