// Runs published Core discovery over a fresh temporary store. Reads only unit fields and question text.
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const punctuation = process.argv.includes("--question-mark-punctuation")
const [output, questionsDir, ...corpusPaths] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
const digitColon = process.argv.includes("--digit-colon-literal")
// The proposed BUG-395 fix, applied to the input: a "?" after a word ends a sentence, it is not a wildcard.
// A colon between digits ("22:00", "1:1") is part of a time or ratio, not a field filter; escaped, it stays a word.
const asked = (text) => {
  const plain = punctuation ? text.replace(/(?<=\p{L})\?(?=\s|$)/gu, "") : text
  return digitColon ? plain.replace(/(?<=\d):(?=\d)/gu, "\\:") : plain
}
if (!output || !questionsDir || !corpusPaths.length)
  throw new Error("usage: node discover.mjs OUTPUT QUESTIONS_DIR CORPUS.json...")
const questionPaths = readdirSync(questionsDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => join(questionsDir, name))
if (existsSync(output)) throw new Error("refuse to overwrite a run")

const coreRoot = join(dirname(fileURLToPath(import.meta.url)), "node_modules/@wirecat/cli-core")
const coreVersion = JSON.parse(readFileSync(join(coreRoot, "package.json"))).version
const { openStore } = await import("@wirecat/cli-core/store")
// searchStore is not a package export; the CLI reaches it through services that need a messenger.
const { searchStore } = await import(pathToFileURL(join(coreRoot, "dist/services/messages-archive-search.js")))

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const account = { provider: "synthetic", account: "1" }
const store = await openStore({ path: join(mkdtempSync(join(process.env.TMPDIR ?? "/var/tmp", "evidence-")), "s.db") })

const locate = new Map()
const unitOf = new Map()
let chatSeq = 100
const started = performance.now()
for (const path of corpusPaths) {
  const corpus = JSON.parse(readFileSync(path))
  const bySource = Map.groupBy(corpus.units, (unit) => unit.source)
  for (const source of corpus.sources) {
    const chatId = String(++chatSeq)
    await store.chats.saveChats(account, [
      { id: chatId, title: source.title, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 5 },
    ])
    const units = bySource.get(source.id) ?? []
    units.forEach((unit, index) => {
      locate.set(unit.id, { chatId, id: String(index + 1) })
      unitOf.set(`${chatId}/${index + 1}`, unit.id)
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
      ...(unit.reply_to ? { replyToId: locate.get(unit.reply_to)?.id } : {}),
    }))
    if (messages.length) await store.messages.saveMessages(account, chatId, messages, { via: "synthetic" })
  }
}
await store.searchIndex.fillSearchIndex({})
await store.searchIndex.fillStems({})
const ingestMs = performance.now() - started

const questions = questionPaths.flatMap((path) => JSON.parse(readFileSync(path)).map(({ id, text }) => ({ id, text })))
const rows = []
for (const question of questions) {
  const times = []
  let found
  for (let repeat = 0; repeat < 3; repeat++) {
    const t = performance.now()
    found = await searchStore(store, account, {
      text: asked(question.text),
      discover: true,
      limit: 300,
      timezone: "UTC",
    })
    times.push(performance.now() - t)
  }
  rows.push({
    id: question.id,
    ranked: found.items.map((m) => unitOf.get(`${m.chatId}/${m.id}`)),
    parents: Object.fromEntries(
      found.items
        .filter((m) => m.discovery?.parent)
        .map((m) => {
          const [, , , chat, id] = m.discovery.parent.split(/[:/]/)
          return [unitOf.get(`${m.chatId}/${m.id}`), unitOf.get(`${chat}/${id}`)]
        }),
    ),
    discovery: found.query?.discovery ?? null,
    elapsed_ms: times,
  })
}
await store.close()
const memory = Object.fromEntries(
  readFileSync("/proc/self/status", "utf8")
    .split("\n")
    .filter((line) => /^(VmRSS|VmHWM):/.test(line))
    .map((line) => [line.split(":")[0], Number(line.split(/\s+/)[1]) * 1024]),
)
writeFileSync(
  output,
  `${JSON.stringify(
    {
      arm: punctuation ? "A0-core-discovery-question-mark-fix" : "A0-core-discovery",
      core_version: coreVersion,
      node: process.version,
      worker_sha256: sha(fileURLToPath(import.meta.url)),
      inputs: Object.fromEntries([...questionPaths, ...corpusPaths].map((path) => [path, sha(path)])),
      units: locate.size,
      ingest_ms: ingestMs,
      memory,
      rows,
    },
    null,
    1,
  )}\n`,
)
process.stdout.write(
  `${JSON.stringify({ units: locate.size, questions: rows.length, ingest_ms: Math.round(ingestMs) })}\n`,
)
