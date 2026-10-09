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
import { searchStore } from "../../dist/services/messages.js"
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
  messages: Pick<Message, "id" | "chatId" | "senderId" | "timestamp" | "text" | "replyToId">[]
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const read = (name: string) => readFileSync(new URL(name, import.meta.url))
const fixtureBytes = read("./fixture.json")
const fixture = JSON.parse(fixtureBytes.toString()) as Seed & {
  queries: (Query & { scope: string; answerExpected: boolean })[]
}
const queries = fixture.queries
const root = mkdtempSync(join(tmpdir(), "search-matrix-candidates-"))
process.env.TZ = "UTC"
process.env.MESSAGING_STORE = join(root, "synthetic.db")
process.env.CLI_COMMON_CACHE_DIR = join(root, "empty-cache")
const store = await openStore({ path: process.env.MESSAGING_STORE })
const account = { provider: "synthetic", account: "500" }
const messages = fixture.messages
const known = new Map(messages.map((m) => [m.id, m]))
const stemmer = await createStemmer()
try {
  for (const seed of [fixture]) {
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
    const retrievalMs = performance.now() - start
    const eligible = await searchStore(store, account, {
      text: q.scope,
      language: "lucene",
      limit: 500,
      timezone: "UTC",
    })
    assert.ok(!eligible.hasMore, "complete synthetic scope eligibility")
    const hardEligibleIds = eligible.items.map((m) => m.id)
    assert.ok(found.items.every((m) => hardEligibleIds.includes(m.id)))
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
      retrievalMs,
      hardEligibleIds,
      directQuestionCandidates: direct?.items.length,
    })
  }
  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: 1,
        node: process.version,
        storePath: process.env.MESSAGING_STORE,
        fixtureSha256: digest(fixtureBytes),
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
