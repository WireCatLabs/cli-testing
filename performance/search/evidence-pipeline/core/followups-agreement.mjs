// Core's follow-up lookup over a synthetic split, per unit: the later units laterSharingRare returns, kept to the
// unit's project and cut to 2, as pipeline.py's followups(uid, 2, 3) does. Usage: CLI_CORE_DIST OUTPUT SPLIT_DIR
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [dist, output, splitDir] = process.argv.slice(2)
if (!dist || !output || !splitDir) throw new Error("usage: node followups-agreement.mjs CLI_CORE_DIST OUTPUT SPLIT_DIR")
if (existsSync(output)) throw new Error("refuse to overwrite a run")
const { openStore } = await import(`${dist}/store/store.js`)
const account = { provider: "synthetic", account: "1" }
const store = await openStore({ path: join(mkdtempSync(join(process.env.TMPDIR ?? "/var/tmp", "followups-")), "s.db") })

const unitOf = new Map()
const keyOf = new Map()
const projectOf = new Map()
let chatSeq = 100
for (const name of readdirSync(splitDir)
  .filter((one) => one.endsWith(".json"))
  .sort()) {
  const corpus = JSON.parse(readFileSync(join(splitDir, name)))
  const bySource = Map.groupBy(corpus.units, (unit) => unit.source)
  for (const source of corpus.sources) {
    const chatId = String(++chatSeq)
    await store.chats.saveChats(account, [
      { id: chatId, title: source.title, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 5 },
    ])
    const units = bySource.get(source.id) ?? []
    units.forEach((unit, index) => {
      keyOf.set(unit.id, { account, chatId, id: String(index + 1) })
      unitOf.set(`msg:synthetic/1/${chatId}/${index + 1}`, unit.id)
      projectOf.set(unit.id, corpus.project.id)
    })
    const messages = units.map((unit, index) => ({
      id: String(index + 1),
      text: unit.section ? `${unit.section.join(" › ")}\n${unit.text}` : unit.text,
      chatId,
      senderId: createHash("sha1").update(unit.author).digest("hex").slice(0, 8),
      senderName: unit.author,
      timestamp: unit.at,
      editedAt: null,
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }))
    if (messages.length) await store.messages.saveMessages(account, chatId, messages, { via: "synthetic" })
  }
}
await store.searchIndex.fillSearchIndex({})
await store.searchIndex.fillStems({})

const ids = [...keyOf.keys()]
const followups = {}
const started = performance.now()
for (let at = 0; at < ids.length; at += 50) {
  const chunk = ids.slice(at, at + 50)
  const later = await store.messages.laterSharingRare(
    chunk.map((uid) => keyOf.get(uid)),
    { rareAt: 3, limit: 100 },
  )
  chunk.forEach((uid, i) => {
    followups[uid] = later[i]
      .map((hit) => unitOf.get(hit.locator))
      .filter((other) => projectOf.get(other) === projectOf.get(uid))
      .slice(0, 2)
  })
}
const lookupMs = performance.now() - started
await store.close()
writeFileSync(output, `${JSON.stringify({ units: ids.length, lookupMs, followups }, null, 1)}\n`)
process.stdout.write(`${JSON.stringify({ units: ids.length, lookupMs: Math.round(lookupMs) })}\n`)
