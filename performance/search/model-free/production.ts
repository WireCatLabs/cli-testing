import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstatSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { performance } from "node:perf_hooks"
import type { Message } from "../../dist/domain/models.js"
import type { FoundMessage } from "../../dist/services/messages.js"
import { searchStore } from "../../dist/services/messages.js"
import type { QueryMetadata } from "../../dist/services/messages-search.js"
import { openStore } from "../../dist/store/store.js"

const flag = (key: string) => {
  const i = process.argv.indexOf(key)
  return i < 0 ? undefined : process.argv[i + 1]
}
const fixture = flag("--fixture") ?? new URL("./fresh.json", import.meta.url)
const bytes = readFileSync(fixture)
const corpus = JSON.parse(bytes.toString()) as {
  chats: { id: string; title: string }[]
  messages: Pick<Message, "id" | "text" | "timestamp" | "senderId" | "chatId" | "replyToId">[]
  queries: {
    id: string
    text: string
    group: string
    split: string
    language: string
    category: string
    relevant: Record<string, number>
    answerExpected: boolean
  }[]
}
assert.ok(corpus.queries.every((q) => !("retrieval" in q)))
const background = Number(flag("--background") ?? 0)
assert.ok(Number.isInteger(background) && background >= 0 && background <= 1_000_000)
const reuse = flag("--query-store")
const root = reuse ? dirname(reuse) : mkdtempSync(join(tmpdir(), "discovery-production-"))
if (reuse) {
  assert.equal(basename(reuse), "synthetic.db")
  assert.ok(basename(root).startsWith("discovery-production-"))
  assert.ok(realpathSync(root).startsWith(`${realpathSync(tmpdir())}/`))
  assert.ok(!lstatSync(reuse).isSymbolicLink())
  const marker = JSON.parse(readFileSync(join(root, "synthetic-research.json"), "utf8"))
  assert.equal(marker.fixtureSha256, createHash("sha256").update(bytes).digest("hex"))
  assert.equal(marker.background, background)
}
const path = join(root, "synthetic.db")
process.env.MESSAGING_STORE = path
process.env.CLI_COMMON_CACHE_DIR = join(root, "empty-cache")
process.env.TZ = "UTC"
const baselineRss = process.memoryUsage().rss
const started = performance.now()
const store = await openStore({ path })
const account = { provider: "synthetic", account: "500" }
const complete = (m: (typeof corpus.messages)[number]): Message => ({
  ...m,
  senderName: "Synthetic",
  editedAt: null,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})
let closed = false
try {
  if (!reuse) {
    await store.saveChats(
      account,
      corpus.chats
        .concat([{ id: "899", title: "Synthetic background" }])
        .map((c) => ({ ...c, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 10 })),
    )
    for (const chat of corpus.chats)
      await store.saveMessages(account, chat.id, corpus.messages.filter((m) => m.chatId === chat.id).map(complete), {
        via: "synthetic",
      })
    for (let offset = 0; offset < background; offset += 1000) {
      const batch = Array.from({ length: Math.min(1000, background - offset) }, (_, i) =>
        complete({
          id: String(1_000_000 + offset + i),
          chatId: "899",
          senderId: "702",
          timestamp: "2026-10-07T12:00:00.000Z",
          text:
            (offset + i) % 10 === 0
              ? `Helix log metrics weekly chart ${offset + i}.`
              : `Inventory shipping receipt ${offset + i}: synthetic office supplies delivered.`,
        }),
      )
      await store.saveMessages(account, "899", batch, { via: "synthetic" })
    }
    await store.fillSearchIndex({})
    await store.fillStems({})
    const ingestion = { setupMs: performance.now() - started, peakRss: process.resourceUsage().maxRSS * 1024 }
    writeFileSync(
      join(root, "synthetic-research.json"),
      JSON.stringify({ fixtureSha256: createHash("sha256").update(bytes).digest("hex"), background }),
    )
    await store.close()
    closed = true
    const worker = spawnSync(
      process.execPath,
      [
        import.meta.filename,
        "--fixture",
        String(fixture instanceof URL ? new URL(fixture).pathname : fixture),
        "--background",
        String(background),
        "--query-store",
        path,
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: process.env },
    )
    if (worker.status !== 0) throw new Error(worker.stderr || `query worker exited ${worker.status}`)
    process.stdout.write(`${JSON.stringify({ ...JSON.parse(worker.stdout), ingestion }, null, 2)}\n`)
  } else {
    const setupMs = performance.now() - started
    const setupRss = process.memoryUsage().rss
    const rows: {
      id: string
      language: string
      category: string
      mode: "strict" | "discover"
      input: string
      ids: string[]
      elapsedMs: number
      answerAt1: number | null
      answerAt3: number | null
      answerAt10: number | null
      mrrAt10: number | null
      evidenceRecallAt10: number | null
      ndcgAt10: number | null
      falseHits: number
      discovery?: QueryMetadata["discovery"]
      matches: { id: string; locator: string; discovery?: FoundMessage["discovery"] }[]
    }[] = []
    const question = corpus.queries.find((q) => q.group === "question" && q.category === "terse-reply")
    assert.ok(question)
    const firstStarted = performance.now()
    await searchStore(store, account, {
      text: question.text,
      discover: true,
      language: "lucene",
      timezone: "UTC",
      limit: 10,
    })
    const firstMs = performance.now() - firstStarted
    const firstRss = process.memoryUsage().rss
    const repeatMs = []
    for (let n = 0; n < 10; n++) {
      const t = performance.now()
      await searchStore(store, account, {
        text: question.text,
        discover: true,
        language: "lucene",
        timezone: "UTC",
        limit: 10,
      })
      repeatMs.push(performance.now() - t)
    }
    for (const mode of ["strict", "discover"] as const) {
      for (const q of corpus.queries.filter((q) => q.group === "question" && q.split === "holdout")) {
        const t = performance.now()
        const found = await searchStore(store, account, {
          text: q.text,
          discover: mode === "discover",
          language: "lucene",
          timezone: "UTC",
          limit: 10,
        })
        const elapsedMs = performance.now() - t
        const ids = found.items.map((m) => m.id)
        const answers = Object.entries(q.relevant)
          .filter(([, g]) => g === 2)
          .map(([id]) => id)
        const evidence = Object.keys(q.relevant)
        const position = ids.findIndex((id) => answers.includes(id))
        const dcg = (grades: number[]) => grades.reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0)
        rows.push({
          id: q.id,
          language: q.language,
          category: q.category,
          mode,
          input: q.text,
          ids,
          elapsedMs,
          answerAt1: answers.length ? Number(position === 0) : null,
          answerAt3: answers.length ? Number(position >= 0 && position < 3) : null,
          answerAt10: answers.length ? Number(position >= 0) : null,
          mrrAt10: answers.length ? (position < 0 ? 0 : 1 / (position + 1)) : null,
          evidenceRecallAt10: evidence.length
            ? ids.filter((id) => evidence.includes(id)).length / evidence.length
            : null,
          ndcgAt10: evidence.length
            ? dcg(ids.map((id) => q.relevant[id] ?? 0)) / dcg(Object.values(q.relevant).sort((a, b) => b - a))
            : null,
          falseHits: evidence.length ? 0 : ids.length,
          discovery: found.query?.discovery,
          matches: found.items.map((m) => ({ id: m.id, locator: m.locator, discovery: m.discovery })),
        })
      }
    }
    const p = (xs: number[], n: number) =>
      [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * n))]
    const summary = ["strict", "discover"].map((mode) => {
      const rs = rows.filter((r) => r.mode === mode)
      const average = (
        key: "answerAt1" | "answerAt3" | "answerAt10" | "mrrAt10" | "evidenceRecallAt10" | "ndcgAt10",
      ) => {
        const xs = rs.flatMap((r) => (r[key] === null ? [] : [r[key]]))
        return xs.reduce((s, x) => s + x, 0) / xs.length
      }
      return {
        mode,
        queries: rs.length,
        answerable: rs.filter((r) => r.answerAt10 !== null).length,
        answerAt1: average("answerAt1"),
        answerAt3: average("answerAt3"),
        answerAt10: average("answerAt10"),
        mrrAt10: average("mrrAt10"),
        evidenceRecallAt10: average("evidenceRecallAt10"),
        ndcgAt10: average("ndcgAt10"),
        falseHits: rs.reduce((s, r) => s + r.falseHits, 0),
        p50Ms: p(
          rs.map((r) => r.elapsedMs),
          0.5,
        ),
        p95Ms: p(
          rs.map((r) => r.elapsedMs),
          0.95,
        ),
      }
    })
    const hash = (file: string | URL) => createHash("sha256").update(readFileSync(file)).digest("hex")
    process.stdout.write(
      `${JSON.stringify({ node: process.version, messages: corpus.messages.length + background, background, fixtureSha256: createHash("sha256").update(bytes).digest("hex"), runnerSha256: hash(new URL("./production.ts", import.meta.url)), productionSha256: Object.fromEntries(["services/messages-discovery.js", "services/messages-combined.js", "search/question-plan.js", "store/sqlite/search.js", "store/sqlite/lucene.js"].map((file) => [file, hash(new URL(`../../dist/${file}`, import.meta.url))])), setupMs, baselineRss, setupRss, firstMs, firstRss, warmP50Ms: p(repeatMs, 0.5), warmP95Ms: p(repeatMs, 0.95), peakRss: process.resourceUsage().maxRSS * 1024, databaseBytes: statSync(path).size, storePath: path, summary, rows }, null, 2)}\n`,
    )
  }
} finally {
  if (!closed) await store.close()
}
