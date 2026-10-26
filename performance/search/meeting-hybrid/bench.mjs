// node bench.mjs <cli-core checkout, built> <work directory> [runs=5]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"
import { buildCorpus, OFF_TOPIC } from "./corpus.mjs"

const [checkout, work, runsArg = "5"] = process.argv.slice(2)
if (!checkout || !work) throw new Error("usage: node bench.mjs <cli-core checkout> <work directory> [runs]")
const runs = Number(runsArg)
const load = (path) => import(pathToFileURL(join(checkout, "dist", path)).href)
const { openStore } = await load("store/store.js")
const { sampleMeeting } = await load("meetings/testing/index.js")
const { parseMeetingReference } = await load("meetings/index.js")
const services = await load("services/index.js")
const { meaningFloor } = await load("embeddings/models.js")
const { searchMeetingHits, searchMeetingsCombined, openMeetingEmbedder, applyMeetingEmbedding } = services
const { questionTerms } = await load("search/question-plan.js")

mkdirSync(work, { recursive: true })
const { meetings, queries } = buildCorpus()
const store = await openStore({ path: join(work, `store-${Date.now()}.db`) })
const accountId = await store.accounts.saveAccount(
  { provider: "example", account: "alice-example" },
  { name: "Alice Example" },
)

const ids = {}
for (const [index, meeting] of meetings.entries()) {
  const input = sampleMeeting()
  const startedAt = 1_700_000_000_000 + index * 86_400_000
  Object.assign(input.meeting, {
    accountId,
    externalId: `invented-${meeting.key}`,
    title: meeting.title,
    description: null,
    startedAt,
    endedAt: startedAt + 3_600_000,
    series: null,
  })
  input.transcripts[0].language = meeting.lang
  input.transcripts[0].contentHash = `invented-${meeting.key}`
  input.transcripts[0].rows = meeting.lines.map(({ speaker, text }, position) => ({
    position,
    startMs: position * 5000,
    endMs: position * 5000 + 4000,
    speakerParticipantPosition: null,
    speakerName: speaker,
    text,
    normalizedText: null,
    metadata: null,
  }))
  input.chat = []
  input.summaries = []
  ids[meeting.key] = (await store.meetings.saveMeeting(input)).meeting.id
}
const keyOf = Object.fromEntries(Object.entries(ids).map(([key, id]) => [id, key]))

let built = 0
for (let after; ; ) {
  const page = await store.meetingVectors.rebuild({ accountId, ...(after ? { afterTranscriptId: after } : {}) })
  built += page.chunks
  if (!page.hasMore) break
  after = page.nextTranscriptId
}
let started = performance.now()
const embedder = await openMeetingEmbedder("e5-small")
const modelOpenMs = performance.now() - started
started = performance.now()
let embedded = 0
for (let afterHash; ; ) {
  const page = await applyMeetingEmbedding(store.meetingVectors, accountId, embedder, {
    maxChunks: 100,
    ...(afterHash ? { afterHash } : {}),
  })
  embedded += page.saved ?? 0
  if (!page.hasMore) break
  afterHash = page.nextHash
}
const embedMs = performance.now() - started
const floor = meaningFloor(embedder.key)
const chunkRows = await store.meetingVectors.chunksToEmbed("none:none:1", { accountId, limit: 1000 })
const chunkChars = chunkRows.items.map(({ text }) => text.length)
const tokenizers = await import(
  pathToFileURL(createRequire(join(checkout, "package.json")).resolve("@huggingface/tokenizers")).href
)
const Tokenizer = tokenizers.Tokenizer ?? tokenizers.default.Tokenizer
const { textModelsDirectory } = await load("embeddings/embed.js")
const modelDir = join(textModelsDirectory(), "e5-small")
const tokenizer = new Tokenizer(
  JSON.parse(readFileSync(join(modelDir, "tokenizer.json"), "utf8")),
  JSON.parse(readFileSync(join(modelDir, "tokenizer_config.json"), "utf8")),
)
const chunkTokens = chunkRows.items.map(({ text }) => tokenizer.encode(`passage: ${text}`).ids.length)

started = performance.now()
await searchMeetingHits(store, "проверка", { accountId, limit: 10 })
const indexMs = performance.now() - started

const position = (ref) => {
  try {
    return parseMeetingReference(ref).cuePosition
  } catch {
    return undefined
  }
}
const asHits = {
  words: (page) =>
    page.items.map((hit) => ({ meeting: keyOf[hit.meetingId], first: position(hit.ref), last: position(hit.ref) })),
  meaning: (page) =>
    page.items.map((hit) => ({
      meeting: keyOf[hit.meetingId],
      first: hit.firstPosition,
      last: hit.lastPosition,
      score: hit.score,
    })),
  combined: (page) =>
    page.items.map((hit) => ({
      meeting: keyOf[hit.meetingId],
      first: position(hit.passage?.first ?? hit.ref),
      last: position(hit.passage?.last ?? hit.ref),
      cited: position(hit.ref),
      by: hit.by.join("+"),
      score: hit.score,
    })),
}

const vectorOf = async (text) => (await embedder.embed([text], "query"))[0]
const rankedAll = async (text) =>
  store.meetingVectors.ranked(embedder.key, await vectorOf(text), { accountId, limit: 200 })
const words = async (text) => {
  try {
    return asHits.words(await searchMeetingHits(store, text, { accountId, limit: 10 }))
  } catch (error) {
    return { error: error.code ?? error.message }
  }
}
const modes = {
  words: (query) => words(query.text),
  "words (question words)": (query) => {
    const terms = questionTerms(query.text)
    return words(terms === null ? query.text : terms.join(" "))
  },
  meaning: async (query) => asHits.meaning({ items: (await rankedAll(query.text)).items.slice(0, 10) }),
  "meaning above floor": async (query) =>
    asHits.meaning({ items: (await rankedAll(query.text)).items.filter(({ score }) => score > floor).slice(0, 10) }),
  combined: async (query) => {
    try {
      return asHits.combined(await searchMeetingsCombined(store, embedder, query.text, { accountId, limit: 10 }))
    } catch (error) {
      return { error: error.code ?? error.message }
    }
  },
}

const judge = (query, hits) => {
  if (!Array.isArray(hits)) return { error: hits.error, meetingRank: null, lineRank: null, count: 0 }
  const target = query.relevant[0]
  const meetingRank = hits.findIndex((hit) => hit.meeting === target.meeting) + 1 || null
  const lineRank =
    hits.findIndex(
      (hit) =>
        hit.meeting === target.meeting &&
        hit.first !== undefined &&
        hit.first <= target.line &&
        target.line <= hit.last,
    ) + 1 || null
  return { meetingRank, lineRank, count: hits.length }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

const rows = []
const latency = {}
for (const query of queries) {
  const row = { ...query, terms: questionTerms(query.text), results: {} }
  for (const [mode, run] of Object.entries(modes)) {
    const hits = await run(query)
    row.results[mode] = { ...judge(query, hits), top: Array.isArray(hits) ? hits.slice(0, 3) : [] }
    if (mode === "meaning above floor") continue
    latency[mode] ??= []
    for (let i = 0; i < runs; i++) {
      const at = performance.now()
      await run(query)
      latency[mode].push(performance.now() - at)
    }
  }
  const all = await rankedAll(query.text)
  const target = query.relevant[0]
  const passage = all.items.find(
    (hit) =>
      keyOf[hit.meetingId] === target.meeting && hit.firstPosition <= target.line && target.line <= hit.lastPosition,
  )
  row.factPassage = passage
    ? { score: passage.score, rank: all.items.indexOf(passage) + 1 }
    : { score: null, rank: null }
  row.aboveFloor = all.items.filter(({ score }) => score > floor).length
  row.topScore = all.items[0]?.score ?? null
  rows.push(row)
  process.stderr.write(".")
}
process.stderr.write("\n")

const offTopic = []
for (const text of OFF_TOPIC) {
  const all = await rankedAll(text)
  const combined = await modes.combined({ text })
  offTopic.push({
    text,
    topScore: all.items[0]?.score ?? null,
    aboveFloor: all.items.filter(({ score }) => score > floor).length,
    combined: Array.isArray(combined) ? combined.length : combined.error,
  })
}

const classes = ["literal", "paraphrase", "question"]
const summary = {}
for (const mode of Object.keys(modes)) {
  summary[mode] = {}
  for (const kind of [...classes, "all"]) {
    const subset = rows.filter((row) => kind === "all" || row.kind === kind)
    const results = subset.map((row) => row.results[mode])
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
    summary[mode][kind] = {
      queries: subset.length,
      recallAt10: mean(results.map((r) => (r.meetingRank ? 1 : 0))),
      mrr: mean(results.map((r) => (r.meetingRank ? 1 / r.meetingRank : 0))),
      lineRecallAt10: mean(results.map((r) => (r.lineRank ? 1 : 0))),
      lineMrr: mean(results.map((r) => (r.lineRank ? 1 / r.lineRank : 0))),
      empty: results.filter((r) => r.count === 0).length,
      errors: results.filter((r) => r.error).length,
    }
  }
}
const timing = Object.fromEntries(
  Object.entries(latency).map(([mode, values]) => [
    mode,
    { p50: percentile(values, 50), p95: percentile(values, 95), samples: values.length },
  ]),
)

const report = {
  corpus: {
    meetings: meetings.length,
    lines: meetings.reduce((sum, meeting) => sum + meeting.lines.length, 0),
    russian: meetings.filter((meeting) => meeting.lang === "ru").length,
    queries: queries.length,
    passages: built,
    embedded,
    passageChars: { max: Math.max(...chunkChars), median: percentile(chunkChars, 50) },
    passageTokens: {
      max: Math.max(...chunkTokens),
      median: percentile(chunkTokens, 50),
      over512: chunkTokens.filter((n) => n > 512).length,
    },
  },
  model: { key: embedder.key, floor, openMs: modelOpenMs, embedMs },
  firstWordSearchMs: indexMs,
  summary,
  timing,
  offTopic,
  rows,
}
await embedder.close()
await store.close()
writeFileSync(join(work, "results.json"), `${JSON.stringify(report, null, 2)}\n`)
const say = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)
const pct = (value) => `${Math.round(value * 100)}`
say(JSON.stringify(report.corpus), JSON.stringify(report.model), `first word search ${indexMs.toFixed(0)} ms`)
for (const [mode, byKind] of Object.entries(summary))
  say(
    mode.padEnd(24),
    Object.entries(byKind)
      .map(
        ([kind, s]) =>
          `${kind} R@10 ${pct(s.recallAt10)} MRR ${s.mrr.toFixed(2)} line ${pct(s.lineRecallAt10)}/${s.lineMrr.toFixed(2)} empty ${s.empty} err ${s.errors}`,
      )
      .join(" | "),
  )
say(JSON.stringify(timing))
say(JSON.stringify(offTopic))
