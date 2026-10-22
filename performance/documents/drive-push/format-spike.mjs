process.on("uncaughtException", (e) => {
  process.stdout.write(
    `${JSON.stringify({ step: "crash", status: e?.response?.status ?? e?.code, message: String(e?.message ?? "").slice(0, 300) })}\n`,
  )
  process.exit(1)
})

import { createRequire } from "node:module"

// Usage: node format-spike.mjs <drive-cli checkout, built> <profile> [--keep]
const [root, profile, flag] = process.argv.slice(2)
const require = createRequire(`${root}/package.json`)
const { drive: driveApi } = require("@googleapis/drive")
const { docs: docsApi } = require("@googleapis/docs")
const { authorizedClient } = await import(`${root}/dist/tokens.js`)
const auth = authorizedClient(process.env, profile)
const drive = driveApi({ version: "v3", auth })
const docs = docsApi({ version: "v1", auth })
const log = (step, value) => process.stdout.write(`${JSON.stringify({ step, ...value })}\n`)
const tryStep = async (step, run) => {
  try {
    return await run()
  } catch (error) {
    log(step, { failed: true, status: error?.response?.status, message: String(error?.message ?? "").slice(0, 300) })
  }
}

const folder = (
  await drive.files.create({
    requestBody: {
      name: `wirecat-format-spike-${Date.now()} (synthetic, safe to delete)`,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { wirecatSpike: "format-2026-10-21" },
    },
    fields: "id",
  })
).data
const doc = (
  await drive.files.create({
    requestBody: { name: "format-test", mimeType: "application/vnd.google-apps.document", parents: [folder.id] },
    fields: "id",
  })
).data
const id = doc.id
const batch = (requests, writeControl) =>
  docs.documents.batchUpdate({ documentId: id, requestBody: { requests, ...(writeControl ? { writeControl } : {}) } })
const get = async () => (await docs.documents.get({ documentId: id })).data

const lines = [
  ["h1", "Heading one"],
  ["h2", "Heading two"],
  ["p", "Plain bold italic strike code link"],
  ["bullet", "bullet a"],
  ["bullet", "\tbullet nested"],
  ["bullet", "bullet b"],
  ["number", "num 1"],
  ["number", "num 2"],
  ["number", "num 3"],
  ["check", "task open"],
  ["check", "task done"],
  ["code", "const x = 1"],
  ["code", "return x"],
  ["quote", "quoted text"],
  ["rule", ""],
  ["p", "after rule"],
]
const text = lines.map(([, t]) => `${t}\n`).join("")
const ranges = []
let at = 1
for (const [kind, t] of lines) {
  ranges.push({ kind, start: at, end: at + t.length + 1, text: t })
  at += t.length + 1
}
const r = (k) => ranges.filter((x) => x.kind === k)
const span = (k) => ({ startIndex: r(k)[0].start, endIndex: r(k).at(-1).end })
const p = ranges.find((x) => x.text.startsWith("Plain"))
const word = (w) => {
  const s = p.start + p.text.indexOf(w)
  return { startIndex: s, endIndex: s + w.length }
}
const mono = { weightedFontFamily: { fontFamily: "Roboto Mono" } }
const grey = { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } }
const border = {
  color: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } },
  width: { magnitude: 1, unit: "PT" },
  padding: { magnitude: 4, unit: "PT" },
  dashStyle: "SOLID",
}

const requests = [
  { insertText: { location: { index: 1 }, text } },
  {
    updateParagraphStyle: {
      range: { startIndex: r("h1")[0].start, endIndex: r("h1")[0].end },
      paragraphStyle: { namedStyleType: "HEADING_1" },
      fields: "namedStyleType",
    },
  },
  {
    updateParagraphStyle: {
      range: { startIndex: r("h2")[0].start, endIndex: r("h2")[0].end },
      paragraphStyle: { namedStyleType: "HEADING_2" },
      fields: "namedStyleType",
    },
  },
  { updateTextStyle: { range: word("bold"), textStyle: { bold: true }, fields: "bold" } },
  { updateTextStyle: { range: word("italic"), textStyle: { italic: true }, fields: "italic" } },
  { updateTextStyle: { range: word("strike"), textStyle: { strikethrough: true }, fields: "strikethrough" } },
  { updateTextStyle: { range: word("code"), textStyle: mono, fields: "weightedFontFamily" } },
  { updateTextStyle: { range: word("link"), textStyle: { link: { url: "https://example.com" } }, fields: "link" } },
  {
    updateParagraphStyle: {
      range: span("code"),
      paragraphStyle: { shading: { backgroundColor: grey } },
      fields: "shading",
    },
  },
  { updateTextStyle: { range: span("code"), textStyle: mono, fields: "weightedFontFamily" } },
  {
    updateParagraphStyle: {
      range: span("quote"),
      paragraphStyle: { indentStart: { magnitude: 36, unit: "PT" }, borderLeft: border },
      fields: "indentStart,borderLeft",
    },
  },
  { updateParagraphStyle: { range: span("rule"), paragraphStyle: { borderBottom: border }, fields: "borderBottom" } },
  // Bottom-up: removing leading tabs in a lower range does not move the ranges above it.
  { createParagraphBullets: { range: span("check"), bulletPreset: "BULLET_CHECKBOX" } },
  { createParagraphBullets: { range: span("number"), bulletPreset: "NUMBERED_DECIMAL_ALPHA_ROMAN" } },
  { createParagraphBullets: { range: span("bullet"), bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } },
]
await batch(requests)
log("batch-1", { ok: true, requests: requests.length })

let d = await get()
const endIndex = d.body.content.at(-1).endIndex
await tryStep("table", async () => {
  await batch([{ insertTable: { rows: 2, columns: 2, location: { index: endIndex - 1 } } }])
  d = await get()
  const table = d.body.content.find((e) => e.table)
  const cells = table.table.tableRows.flatMap((row) => row.tableCells)
  const values = ["head a", "head b", "1", "2"]
  const fills = cells
    .map((c, i) => ({ insertText: { location: { index: c.content[0].startIndex }, text: values[i] } }))
    .reverse()
  await batch(fills)
  log("table", { ok: true })
})
d = await get()
await tryStep("image", async () => {
  await batch([
    {
      insertInlineImage: {
        location: { index: d.body.content.at(-1).endIndex - 1 },
        uri: "https://www.gstatic.com/images/branding/product/2x/docs_48dp.png",
      },
    },
  ])
  log("image", { ok: true })
})

d = await get()
const revision = d.revisionId
await batch(
  [{ insertText: { location: { index: ranges.find((x) => x.text === "num 2").start }, text: "num 1.5\n" } }],
  { requiredRevisionId: revision },
)
log("required-revision-fresh", { ok: true })
await tryStep("required-revision-stale", async () => {
  await batch([{ insertText: { location: { index: 1 }, text: "stale " } }], { requiredRevisionId: revision })
  log("required-revision-stale", { refused: false })
})

d = await get()
const styleKeys = (o) => Object.keys(o ?? {}).filter((k) => o[k] !== undefined)
const out = []
for (const el of d.body.content) {
  if (el.paragraph) {
    const para = el.paragraph
    const ps = para.paragraphStyle ?? {}
    out.push({
      type: "paragraph",
      style: ps.namedStyleType,
      bullet: para.bullet
        ? {
            listId: para.bullet.listId,
            nesting: para.bullet.nestingLevel ?? 0,
            textStyle: styleKeys(para.bullet.textStyle),
          }
        : undefined,
      shading: !!ps.shading?.backgroundColor?.color,
      indentStart: ps.indentStart?.magnitude,
      borderLeft: !!ps.borderLeft?.width?.magnitude,
      borderBottom: !!ps.borderBottom?.width?.magnitude,
      runs: para.elements.map((e) =>
        e.textRun
          ? { text: e.textRun.content, style: e.textRun.textStyle }
          : { other: Object.keys(e).filter((k) => !["startIndex", "endIndex"].includes(k)) },
      ),
      suggestions: Object.keys(para).filter((k) => k.startsWith("suggested")),
    })
  } else if (el.table) {
    out.push({
      type: "table",
      rows: el.table.rows,
      columns: el.table.columns,
      cells: el.table.tableRows.map((row) =>
        row.tableCells.map((c) =>
          c.content.map((x) => x.paragraph?.elements.map((e) => e.textRun?.content).join("")).join(""),
        ),
      ),
    })
  } else out.push({ type: Object.keys(el).filter((k) => !["startIndex", "endIndex"].includes(k)) })
}
log("read-back", { content: out })
log("lists", {
  lists: Object.fromEntries(
    Object.entries(d.lists ?? {}).map(([k, v]) => [
      k,
      v.listProperties.nestingLevels.slice(0, 2).map((n) => ({
        glyphType: n.glyphType,
        glyphSymbol: n.glyphSymbol,
        glyphFormat: n.glyphFormat,
        startNumber: n.startNumber,
      })),
    ]),
  ),
})
log("doc-fields", { keys: Object.keys(d) })

if (flag === "--keep") log("kept", { url: `https://docs.google.com/document/d/${id}/edit` })
else {
  await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id" })
  log("trashed", { ok: true })
}
