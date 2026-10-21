// Live acceptance of `drive mirrors` on synthetic files in a new marked folder; trashed at the end.
// Usage: node mirror-acceptance.mjs <drive-cli checkout, built> <profile>
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const [root, profile] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { sheets: sheetsApi } = require("@googleapis/sheets")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const { paths } = await import(`${root}/dist/config.js`)
const { readDoc, representable } = await import(`${root}/dist/mirror-docs.js`)
const { markdownBlocks, blockKey } = await import(`${root}/node_modules/@wirecat/cli-core/dist/documents.js`)
const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const sheets = sheetsApi({ version: "v4", auth })
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const cli = (...args) => {
  try {
    return {
      ok: true,
      out: JSON.parse(
        execFileSync("node", [`${root}/dist/bin/drive.js`, profile, ...args, "--json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      ),
    }
  } catch (error) {
    const text = String(error.stdout ?? "")
    return { ok: false, out: text ? JSON.parse(text) : undefined }
  }
}
const configFile = join(paths(process.env).config, "config.json")
const backup = `${mkdtempSync("/var/tmp/claude/mirror-acceptance-")}/config.json`
copyFileSync(configFile, backup)
const local = mkdtempSync("/var/tmp/claude/mirror-local-")
const write = (name, text) => writeFileSync(join(local, name), text)
const md1 = `# Weekly plan

Intro with **bold**, *italic*, ~~gone~~, \`code\` and a [link](https://example.com).

- one
  - nested
- two

1. first
2. second

- [ ] call the bank
- [x] send invoice

\`\`\`
const x = 1
return x
\`\`\`

> a quote

| name | qty |
|---|---|
| apple | 3 |

---

closing line
`
let folder
let mirrorId
const blocksOf = async (id) => {
  const document = (await docs.documents.get({ documentId: id })).data
  const exported = (await drive.files.export({ fileId: id, mimeType: "text/markdown" }, { responseType: "text" })).data
  const ticks = (await markdownBlocks(exported)).flatMap((b) =>
    b.kind === "item" && b.list === "check" ? [Boolean(b.checked)] : [],
  )
  return { document, read: readDoc(document, ticks) }
}
const same = (a, b) =>
  Array.isArray(a)
    ? a.length === b.length && a.every((x, i) => blockKey(x) === blockKey(b[i]))
    : blockKey(a) === blockKey(b)
try {
  folder = (
    await drive.files.create({
      requestBody: {
        name: `wirecat-mirror-acceptance-${Date.now()} (synthetic, safe to delete)`,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { wirecatSpike: "mirror-2026-10-22" },
      },
      fields: "id",
    })
  ).data
  write("plan.md", md1)
  write("budget.csv", "item,amount\nrent,950.5\nfood,120\n")
  const added = cli("mirrors", "add", local, "--to", folder.id)
  mirrorId = added.out?.item?.id
  log("add", { ok: added.ok, id: Boolean(mirrorId) })
  const first = cli("mirrors", "push", mirrorId)
  log("push-1", { ok: first.ok, created: first.out?.items?.[0]?.created, errors: first.out?.items?.[0]?.errors })

  const files = (
    await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: "files(id,name,mimeType)" })
  ).data.files
  const doc = files.find((f) => f.mimeType.endsWith("document"))
  const sheet = files.find((f) => f.mimeType.endsWith("spreadsheet"))
  const expected = representable(await markdownBlocks(md1))
  const afterCreate = await blocksOf(doc.id)
  const got = afterCreate.read.placed.map((p) => p.block)
  log("doc-kinds", {
    got: got.map(
      (b) => b.kind + (b.kind === "item" ? `:${b.list}:${b.depth}` : "") + ":" + JSON.stringify(b).slice(0, 80),
    ),
    want: expected.map((b) => b.kind + (b.kind === "item" ? `:${b.list}:${b.depth}` : "")),
  })
  log("doc-roundtrip", {
    equal: same(got, expected),
    got: got.length,
    expected: expected.length,
    diff: got
      .map((b, i) => (expected[i] && same(b, expected[i]) ? null : { got: b, want: expected[i] }))
      .filter(Boolean),
  })

  const again = cli("mirrors", "push", mirrorId)
  log("push-unchanged", {
    ok: again.ok,
    updated: again.out?.items?.[0]?.updated,
    unchanged: again.out?.items?.[0]?.unchanged,
  })

  write("plan.md", md1.replace("closing line", "closing line, edited locally"))
  const revBefore = afterCreate.document.revisionId
  const edited = cli("mirrors", "push", mirrorId)
  const afterEdit = await blocksOf(doc.id)
  log("push-edit", {
    ok: edited.ok,
    updated: edited.out?.items?.[0]?.updated,
    equal: same(
      afterEdit.read.placed.map((p) => p.block),
      representable(await markdownBlocks(md1.replace("closing line", "closing line, edited locally"))),
    ),
    revisionChanged: afterEdit.document.revisionId !== revBefore,
  })

  // A tick made in Google: the API cannot tick, so strike the item the way the writer marks done items.
  const callItem = afterEdit.read.placed.find(
    (p) => p.block.kind === "item" && p.block.inlines[0]?.text === "call the bank",
  )
  await docs.documents.batchUpdate({
    documentId: doc.id,
    requestBody: {
      requests: [
        {
          updateTextStyle: {
            range: { startIndex: callItem.start, endIndex: callItem.end - 1 },
            textStyle: { strikethrough: true },
            fields: "strikethrough",
          },
        },
      ],
    },
  })
  write("plan.md", md1.replace("closing line", "closing line, edited twice"))
  const kept = cli("mirrors", "push", mirrorId)
  const afterTick = await blocksOf(doc.id)
  const tickBlock = afterTick.read.placed.find(
    (p) => p.block.kind === "item" && p.block.inlines[0]?.text === "call the bank",
  )?.block
  log("tick-kept", { ok: kept.ok, conflicts: kept.out?.items?.[0]?.conflicts, checked: tickBlock?.checked })
  write("plan.md", md1.replace("closing line", "closing line, edited three times"))
  const keptAgain = cli("mirrors", "push", mirrorId)
  const afterSecond = await blocksOf(doc.id)
  const tickAgain = afterSecond.read.placed.find(
    (p) => p.block.kind === "item" && p.block.inlines[0]?.text === "call the bank",
  )?.block
  log("tick-kept-second-push", { ok: keptAgain.ok, checked: tickAgain?.checked })

  const intro = afterSecond.read.placed.find((p) => p.block.kind === "paragraph")
  await docs.documents.batchUpdate({
    documentId: doc.id,
    requestBody: { requests: [{ insertText: { location: { index: intro.start }, text: "Edited in Google. " } }] },
  })
  write("plan.md", md1.replace("closing line", "closing line, edited four times"))
  const conflict = cli("mirrors", "push", mirrorId)
  const afterConflict = await blocksOf(doc.id)
  log("google-edit-conflict", {
    ok: conflict.ok,
    conflicts: conflict.out?.items?.[0]?.conflicts?.map((c) => c.reason),
    googleEditKept: JSON.stringify(afterConflict.read.placed).includes("Edited in Google."),
  })

  const tabs = (await sheets.spreadsheets.get({ spreadsheetId: sheet.id, fields: "sheets(properties(sheetId,title))" }))
    .data.sheets
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheet.id,
    requestBody: { requests: [{ addSheet: { properties: { title: "Notes" } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheet.id,
    range: `'${tabs[0].properties.title}'!D1`,
    valueInputOption: "RAW",
    requestBody: { values: [["added in Google"]] },
  })
  write("budget.csv", "item,amount\nrent,1000\n")
  const sheetPush = cli("mirrors", "push", mirrorId)
  const values = (
    await sheets.spreadsheets.values.get({
      spreadsheetId: sheet.id,
      range: `'${tabs[0].properties.title}'!A1:D4`,
      valueRenderOption: "UNFORMATTED_VALUE",
    })
  ).data.values
  const after = (
    await sheets.spreadsheets.get({ spreadsheetId: sheet.id, fields: "sheets(properties(title))" })
  ).data.sheets.map((s) => s.properties.title)
  log("sheet-update", {
    ok: sheetPush.ok,
    updated: sheetPush.out?.items?.[0]?.updated,
    conflicts: sheetPush.out?.items?.[0]?.conflicts,
    values,
    tabs: after,
  })
} catch (error) {
  log("crash", { status: error?.response?.status, message: String(error?.message ?? "").slice(0, 300) })
} finally {
  if (mirrorId) cli("mirrors", "remove", mirrorId)
  copyFileSync(backup, configFile)
  if (mirrorId)
    rmSync(join(paths(process.env).state, "profiles", profile, "mirrors", `${mirrorId}.json`), { force: true })
  if (folder) await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id" })
  log("cleanup", { trashed: Boolean(folder), configRestored: true })
}
