import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import type { Message } from "../../dist/domain/models.js"
import { textModel } from "../../dist/embeddings/models.js"
import { parseLucene } from "../../dist/search/lucene/parser.js"
import { walkQuery } from "../../dist/search/lucene/types.js"
import { createStemmer } from "../../dist/search/stem.js"
import { searchCombined } from "../../dist/services/messages-combined.js"
import { openStore } from "../../dist/store/store.js"

type Query = {
  id: string
  split: string
  group: string
  topic: string
  language: string
  category: string
  retrieval: string
  text: string
  relevant: Record<string, number>
}
type Seed = {
  chats: { id: string; title: string }[]
  messages: Pick<Message, "id" | "chatId" | "senderId" | "timestamp" | "text">[]
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const read = (name: string) => readFileSync(new URL(name, import.meta.url))
const originalBytes = read("../message-search-quality/corpus.json")
const questionBytes = read("../message-search-quality/questions.json")
const freshBytes = read("./fresh.json")
const original = JSON.parse(originalBytes.toString()) as Seed & {
  queries: { id: string; split: string; category: string; lucene: string; relevant: Record<string, number> }[]
}
const supplement = JSON.parse(questionBytes.toString()) as Seed & {
  queries: {
    id: string
    split: string
    category: string
    retrieval: string
    text: string
    relevant: Record<string, number>
  }[]
}
const fresh = JSON.parse(freshBytes.toString()) as Seed & { queries: Query[] }
const language = (s: string) => (/[а-яё]/iu.test(s) ? "ru" : "en")
const queries: Query[] = [
  ...original.queries
    .filter((q) => q.split === "dev")
    .map((q) => ({
      id: q.id,
      split: q.split,
      category: q.category,
      relevant: q.relevant,
      group: "keyword",
      topic: q.id.split("-")[0] ?? q.id,
      language: language(q.lucene),
      retrieval: q.lucene,
      text: q.lucene,
    })),
  ...supplement.queries
    .filter((q) => q.split === "dev")
    .map((q) => ({
      ...q,
      group: "question-diagnostic",
      topic: q.retrieval.split(" ")[0]?.toLowerCase() ?? q.id,
      language: language(q.text),
    })),
  ...fresh.queries,
]
const root = mkdtempSync(join(tmpdir(), "search-matrix-candidates-"))
process.env.TZ = "UTC"
process.env.MESSAGING_STORE = join(root, "synthetic.db")
process.env.CLI_COMMON_CACHE_DIR = join(root, "empty-cache")
const store = await openStore({ path: process.env.MESSAGING_STORE })
const account = { provider: "synthetic", account: "500" }
const messages = [...original.messages, ...fresh.messages]
const known = new Map(messages.map((m) => [m.id, m]))
const stemmer = await createStemmer()
try {
  for (const seed of [original, fresh]) {
    await store.saveChats(
      account,
      seed.chats.map((c) => ({ ...c, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 100 })),
    )
    for (const chat of seed.chats)
      await store.saveMessages(
        account,
        chat.id,
        seed.messages
          .filter((m) => m.chatId === chat.id)
          .map(
            (m): Message => ({
              ...m,
              senderName: `Synthetic ${m.senderId}`,
              editedAt: null,
              outgoing: false,
              attachments: [],
              replyTo: null,
              forwardedFrom: null,
              reactions: null,
            }),
          ),
        { via: "synthetic" },
      )
  }
  await store.fillSearchIndex({})
  await store.fillStems({})
  const rows = []
  for (const q of queries) {
    const start = performance.now()
    const found = await searchCombined(
      store,
      account,
      { text: q.retrieval, limit: 300, timezone: "UTC" },
      {},
      {
        candidateDepth: 300,
        rrfK: 60,
        rerank: "none",
        chatCap: 0,
      },
    )
    assert.equal(new Set(found.items.map((m) => m.id)).size, found.items.length)
    assert.ok(found.items.every((m) => known.has(m.id)))
    for (const id of Object.keys(q.relevant)) assert.ok(known.has(id), `known gold ${id}`)
    const terms = walkQuery(parseLucene(q.retrieval).root)
      .filter((p) => ["text", "exact"].includes(p.field))
      .flatMap((p) => p.value.match(/[\p{L}\p{N}]+/gu) ?? [])
    const direct =
      q.group === "question-diagnostic"
        ? await searchCombined(store, account, { text: q.text, limit: 300, timezone: "UTC" })
        : undefined
    rows.push({
      ...q,
      terms,
      stemTerms: terms.map((t) => stemmer.stemToken(t)),
      rerankable: found.query.combined.expanded,
      corrections: found.corrections,
      candidates: found.items.map((m) => ({ id: m.id, score: m.score, match: m.match })),
      retrievalMs: performance.now() - start,
      directQuestionCandidates: direct?.items.length,
    })
  }
  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: 1,
        node: process.version,
        storePath: process.env.MESSAGING_STORE,
        corpusSha256: digest(originalBytes),
        questionsSha256: digest(questionBytes),
        freshSha256: digest(freshBytes),
        exporterSha256: digest(read("./export.ts")),
        productionSha256: Object.fromEntries(
          ["services/messages-combined.js", "search/lucene/parser.js", "search/stem.js", "store/sqlite/lucene.js"].map(
            (p) => [p, digest(read(`../../dist/${p}`))],
          ),
        ),
        embeddingModel: textModel("e5-small"),
        messages: messages.map((m) => ({ ...m, stems: stemmer.stemTokens(m.text) })),
        rows,
      },
      null,
      2,
    ) + "\n",
  )
} finally {
  await store.close()
}
