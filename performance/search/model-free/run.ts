import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { formatLocator } from "../../dist/domain/locator.js"
import type { Message } from "../../dist/domain/models.js"
import { parseLucene } from "../../dist/search/lucene/parser.js"
import { searchCombined } from "../../dist/services/messages-combined.js"
import type { StoredHit } from "../../dist/store/store.js"
import { openStore } from "../../dist/store/store.js"
import { buildIndex, search } from "./search.ts"

type Query = {
  id: string
  split: string
  group: string
  language: string
  category: string
  text: string
  scope: string
  relevant: Record<string, number>
  answerExpected: boolean
}
type Seed = {
  chats: { id: string; title: string }[]
  messages: Pick<Message, "id" | "chatId" | "senderId" | "timestamp" | "text" | "replyToId">[]
  queries: Query[]
}
const baselineMemory = process.memoryUsage()
const bytes = readFileSync(new URL("./fixture.json", import.meta.url))
const corpus = JSON.parse(bytes.toString()) as Seed
assert.ok(corpus.queries.every((q) => !("retrieval" in q) && !("intent" in q)))
const root = mkdtempSync(join(tmpdir(), "model-free-search-"))
process.env.MESSAGING_STORE = join(root, "synthetic.db")
process.env.CLI_COMMON_CACHE_DIR = join(root, "empty-cache")
process.env.TZ = "UTC"
const coldStart = performance.now()
const store = await openStore({ path: process.env.MESSAGING_STORE })
const account = { provider: "synthetic", account: "500" }
const modes = ["direct", "question", "context"] as const
try {
  await store.saveChats(
    account,
    corpus.chats.map((c) => ({ ...c, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 100 })),
  )
  for (const chat of corpus.chats)
    await store.saveMessages(
      account,
      chat.id,
      corpus.messages
        .filter((m) => m.chatId === chat.id)
        .map(
          (m): Message => ({
            ...m,
            senderName: "Synthetic",
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
  const probeChat = corpus.chats[0]?.id
  assert.ok(probeChat)
  const probes = [
    { id: "999001", senderId: "700", text: "Larch export time: when does the daily export run?", day: "08" },
    { id: "999002", senderId: "700", text: "Every day at 09:30.", day: "08", replyToId: "999001" },
    { id: "999003", senderId: "702", text: "Every day at 02:00.", day: "08", replyToId: "999001" },
    { id: "999004", senderId: "700", text: "Every day at 01:00.", day: "07", replyToId: "999001" },
  ]
  await store.saveMessages(
    account,
    probeChat,
    probes.map(
      (p): Message => ({
        ...p,
        chatId: probeChat,
        timestamp: `2026-10-${p.day}T12:00:00.000Z`,
        senderName: "Synthetic",
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
  await store.fillSearchIndex({})
  await store.fillStems({})
  const stored: StoredHit[] = []
  for (const chat of corpus.chats) {
    const page = await store.messages(account, chat.id, { limit: 500 })
    assert.ok(!page.hasMore)
    stored.push(
      ...page.items.map((m) => ({
        ...m,
        chatTitle: chat.title,
        locator: formatLocator({ ...account, chat: chat.id, message: m.id }),
      })),
    )
  }
  assert.equal(stored.length, corpus.messages.length + probes.length)
  const index = await buildIndex(account, stored)
  const setupMs = performance.now() - coldStart
  const setupMemory = process.memoryUsage()
  const coldSample = corpus.queries.find((q) => q.group === "question" && q.category === "terse-reply")
  assert.ok(coldSample)
  const coldInput = `${coldSample.text} ${coldSample.scope}`
  const cold = await search(index, store, { text: coldInput, limit: 10, timezone: "UTC" }, "context")
  const coldMemory = process.memoryUsage()
  const repeats = []
  for (let i = 0; i < 10; i++)
    repeats.push((await search(index, store, { text: coldInput, limit: 10, timezone: "UTC" }, "context")).totalMs)
  repeats.sort((a, b) => a - b)
  const coldProbe = {
    input: coldInput,
    firstQueryMs: cold.totalMs,
    warmP50Ms: repeats[5],
    warmP95Ms: repeats[9],
    memoryAfterFirstQuery: coldMemory,
    repeats: 10,
  }
  type Row = {
    id: string
    split: string
    group: string
    language: string
    category: string
    mode: (typeof modes)[number]
    input: string
    plan: Awaited<ReturnType<typeof search>>["plan"]
    strict: boolean
    ids: string[]
    candidateIds: string[]
    answerExpected: boolean
    usefulEvidence: number
    answerSuccessAt1: number | null
    answerSuccessAt3: number | null
    answerSuccessAt10: number | null
    answerMrrAt10: number | null
    answerCandidateSuccess: number | null
    evidenceRecallAt10: number | null
    ndcgAt10: number | null
    falseHits: number
    lookupMs: number
    contextMs: number
    scoringMs: number
    totalMs: number
  }
  const results: Row[] = []
  for (const mode of modes) {
    for (const q of corpus.queries) {
      const input = q.group === "question" ? q.text : `${q.text} ${q.scope}`.trim()
      const found = await search(index, store, { text: input, limit: 10, timezone: "UTC" }, mode)
      const ids = found.items.map((m) => m.id)
      assert.equal(ids.length, new Set(ids).size)
      assert.ok(found.items.every((m) => m.chatId === q.scope.match(/chat:(\d+)/u)?.[1]))
      const actual = Object.entries(q.relevant)
        .filter(([, grade]) => grade === 2)
        .map(([id]) => id)
      const evidence = Object.keys(q.relevant)
      const dcg = (grades: number[]) => grades.reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0)
      results.push({
        id: q.id,
        split: q.split,
        group: q.group,
        language: q.language,
        category: q.category,
        mode,
        input,
        plan: found.plan,
        strict: found.strict,
        ids,
        candidateIds: found.candidateIds,
        answerExpected: q.answerExpected,
        usefulEvidence: evidence.length,
        answerSuccessAt1: actual.length ? Number(actual.includes(ids[0] ?? "")) : null,
        answerSuccessAt3: actual.length ? Number(actual.some((id) => ids.slice(0, 3).includes(id))) : null,
        answerMrrAt10: actual.length
          ? ids.findIndex((id) => actual.includes(id)) < 0
            ? 0
            : 1 / (ids.findIndex((id) => actual.includes(id)) + 1)
          : null,
        answerSuccessAt10: actual.length ? Number(actual.some((id) => ids.includes(id))) : null,
        answerCandidateSuccess: actual.length ? Number(actual.some((id) => found.candidateIds.includes(id))) : null,
        evidenceRecallAt10: evidence.length ? ids.filter((id) => evidence.includes(id)).length / evidence.length : null,
        ndcgAt10: evidence.length
          ? dcg(ids.map((id) => q.relevant[id] ?? 0)) / dcg(Object.values(q.relevant).sort((a, b) => b - a))
          : null,
        falseHits: evidence.length ? 0 : ids.length,
        lookupMs: found.lookupMs,
        contextMs: found.contextMs,
        scoringMs: found.scoringMs,
        totalMs: found.totalMs,
      })
    }
  }
  // Strict syntax and SDK flags remain production-backed controls.
  const sample = corpus.messages[0]
  assert.ok(sample)
  const controls = []
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    search(index, store, { text: "Who is the auditor?", limit: 10, signal: controller.signal }, "context"),
    { name: "AbortError" },
  )
  for (const request of [
    { ast: parseLucene(sample.text.split(":")[0] ?? ""), limit: 10 },
    { text: `"${sample.text.split(":")[0]}"`, limit: 10 },
    { text: `${sample.text.split(":")[0]?.replaceAll(" ", " AND ")}`, limit: 10 },
    { text: sample.text.split(":")[0] ?? "", limit: 10, exact: true },
    { text: sample.text.split(":")[0] ?? "", limit: 10, newest: true },
  ]) {
    const expected = await searchCombined(
      store,
      account,
      request,
      {},
      { candidateDepth: 300, rrfK: 60, rerank: "none", chatCap: 0 },
    )
    const found = await search(index, store, request, "context")
    assert.deepEqual(
      found.items.map((m) => m.id),
      expected.items.map((m) => m.id),
    )
    controls.push({ request, ids: found.items.map((m) => m.id), passed: true })
  }
  await assert.rejects(
    search(index, store, { text: "refund", ast: parseLucene("refund"), limit: 10 }, "context"),
    (error: unknown) => error instanceof Error && error.message.includes("query_conflict"),
  )
  const noPunctuation = await search(index, store, { text: coldSample.text.replace(/\?$/u, ""), limit: 10 }, "context")
  const punctuation = await search(index, store, { text: coldSample.text, limit: 10 }, "context")
  assert.deepEqual(
    noPunctuation.items.map((m) => m.id),
    punctuation.items.map((m) => m.id),
  )
  const scopedRequest = {
    text: `When does Larch export time run? chat:${probeChat} from:700 date:2026-10-08`,
    limit: 10,
    timezone: "UTC",
  }
  const scoped = await search(index, store, scopedRequest, "context")
  assert.ok(scoped.candidateIds.includes("999001") && scoped.candidateIds.includes("999002"))
  assert.ok(!scoped.candidateIds.includes("999003") && !scoped.candidateIds.includes("999004"))
  controls.push({ request: scopedRequest, ids: scoped.items.map((m) => m.id), passed: true })
  const average = (
    rs: typeof results,
    key:
      | "answerSuccessAt1"
      | "answerSuccessAt3"
      | "answerMrrAt10"
      | "answerSuccessAt10"
      | "answerCandidateSuccess"
      | "evidenceRecallAt10"
      | "ndcgAt10",
  ) => {
    const valid = rs.filter((r) => r[key] !== null)
    return valid.length ? valid.reduce((s, r) => s + (r[key] ?? 0), 0) / valid.length : null
  }
  const summaries = modes.map((mode) => {
    const rows = results.filter((r) => r.mode === mode && r.split === "holdout" && r.group === "question")
    const times = rows.map((r) => r.totalMs).sort((a, b) => a - b)
    return {
      mode,
      queries: rows.length,
      answerable: rows.filter((r) => r.answerExpected).length,
      answerSuccessAt1: average(rows, "answerSuccessAt1"),
      answerSuccessAt3: average(rows, "answerSuccessAt3"),
      answerMrrAt10: average(rows, "answerMrrAt10"),
      answerSuccessAt10: average(rows, "answerSuccessAt10"),
      answerCandidateSuccess: average(rows, "answerCandidateSuccess"),
      evidenceRecallAt10: average(rows, "evidenceRecallAt10"),
      ndcgAt10: average(rows, "ndcgAt10"),
      falseHits: rows.reduce((s, r) => s + r.falseHits, 0),
      p50Ms: times[Math.floor(times.length * 0.5)],
      p95Ms: times[Math.floor(times.length * 0.95)],
    }
  })
  const hash = (name: string) =>
    createHash("sha256")
      .update(readFileSync(new URL(name, import.meta.url)))
      .digest("hex")
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, node: process.version, fixtureSha256: hash("./fixture.json"), productionSha256: Object.fromEntries(["services/messages-combined.js", "services/messages.js", "services/messages-search.js", "search/lucene/parser.js", "search/stem.js", "store/normalize.js", "store/sqlite/lucene.js"].map((p) => [p, hash(`../../dist/${p}`)])), sourceSha256: { runner: hash("./run.ts"), planner: hash("./plan.ts"), search: hash("./search.ts") }, messages: stored.length, setupMs, baselineMemory, setupMemory, coldProbe, memory: process.memoryUsage(), peakRssBytes: process.resourceUsage().maxRSS * 1024, storePath: process.env.MESSAGING_STORE, summaries, controls, results }, null, 2)}\n`,
  )
} finally {
  await store.close()
}
