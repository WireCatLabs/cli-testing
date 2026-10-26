import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { env, pipeline } from "@huggingface/transformers"

env.cacheDir = "../models/hf"
const db = new DatabaseSync(`${process.env.HOME}/.local/share/WireCat/wirecat.db`, { readOnly: true })
const list = JSON.parse(fs.readFileSync("../tg_list.json"))
const targets = JSON.parse(fs.readFileSync("../targets.json"))
let s = performance.now()
const p = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", { dtype: "q8" })
const load = performance.now() - s
const emb = async (texts) => {
  const o = await p(texts, { pooling: "mean", normalize: true })
  return texts.map((_, i) => Array.from(o.data.slice(i * 384, (i + 1) * 384)))
}
const msg = db.prepare("select id, chat_id, text, sender_name, sent_at from messages where chat_id=? and external_id=?")
const chat = db.prepare("select title from chats where id=?")
const near = db.prepare(
  `select id, text, sent_at from messages where chat_id=? and deleted_at is null and id<>? and text<>'' and sent_at between ? and ? order by sent_at`,
)
const L0 = [],
  L1 = []
const meta = { withCaption: 0, ctxMsgs: [], l1Chars: [] }
for (const e of list) {
  const m = msg.get(e.chatDb, e.msg)
  const cap = (m.text || "").trim()
  if (cap) meta.withCaption++
  const all = near.all(m.chat_id, m.id, m.sent_at - 600000, m.sent_at + 600000)
  const before = all.filter((x) => x.sent_at <= m.sent_at).slice(-3),
    after = all.filter((x) => x.sent_at > m.sent_at).slice(0, 3)
  const ctx = [...before, ...after].map((x) => x.text.trim())
  meta.ctxMsgs.push(ctx.length)
  const title = chat.get(m.chat_id)?.title || ""
  const l1 = [title, m.sender_name || "", cap, ...ctx].filter(Boolean).join("\n")
  meta.l1Chars.push(l1.length)
  L0.push(cap)
  L1.push(l1)
}
const ts = {}
s = performance.now()
const e0 = await emb(L0.map((t) => `passage: ${t}`))
ts.L0_ms = performance.now() - s
s = performance.now()
const e1 = []
for (let i = 0; i < L1.length; i += 10) e1.push(...(await emb(L1.slice(i, i + 10).map((t) => `passage: ${t}`))))
ts.L1_ms = performance.now() - s
s = performance.now()
const q = await emb(targets.map((t) => `query: ${t[1]}`))
ts.q_ms = (performance.now() - s) / targets.length
fs.writeFileSync("../text_vecs.json", JSON.stringify({ e0, e1, q, hasCap: L0.map(Boolean), ctxN: meta.ctxMsgs }))
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
process.stdout.write(
  `${JSON.stringify({
    load,
    ...ts,
    withCaption: meta.withCaption,
    withCtx: meta.ctxMsgs.filter(Boolean).length,
    medianCtxMsgs: med(meta.ctxMsgs),
    medianL1Chars: med(meta.l1Chars),
  })}\n`,
)
