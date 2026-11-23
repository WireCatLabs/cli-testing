// node bench.mjs <cli-core package dir> <work dir> <model id> <items> [variant] [rounds=30]
// variant: as-is, prefixed (comments saved with their issue's key and title in front), or prefixed-noshort (the same,
// without the short comments, which stands in for not embedding them)
// Builds a synthetic tracker store, scores the 60 queries words only and then words + meaning, times both, and writes
// results/<model>-<items>-<variant>.json beside this file. See README.md for the environment it must run in.

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath, pathToFileURL } from "node:url"
import { buildCorpus, prefixed, SHORT_COMMENTS } from "./corpus.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const [coreArg, workArg, modelId, itemsArg, variant = "as-is", roundsArg = "30"] = process.argv.slice(2)
if (!coreArg || !workArg || !modelId || !itemsArg || !["as-is", "prefixed", "prefixed-noshort"].includes(variant)) {
  process.stderr.write(
    "usage: node bench.mjs <cli-core dir> <work dir> <model id> <items> [as-is|prefixed|prefixed-noshort] [rounds]\n",
  )
  process.exit(2)
}
const owner = join(homedir(), ".local/share/WireCat")
const state = process.env.WIRECAT_STATE_DIR ?? ""
if (!state || state.startsWith(owner) || process.env.DBUS_SESSION_BUS_ADDRESS !== "disabled:") {
  process.stderr.write(
    "refusing: set WIRECAT_STATE_DIR outside the owner's folder and DBUS_SESSION_BUS_ADDRESS=disabled:\n",
  )
  process.exit(2)
}
const core = resolve(coreArg)
const work = resolve(workArg)
const items = Number(itemsArg)
const rounds = Number(roundsArg)
mkdirSync(work, { recursive: true })

const load = (path) => import(pathToFileURL(join(core, "dist", path)).href)
const { openStore } = await load("store/index.js")
const { searchAll, embedTracker, nearestTracker, downloadTextModel } = await load("services/index.js")
const { syncTracker } = await load("tracker/index.js")
const { fakeTrackerSource } = await load("tracker/testing/index.js")
const { warmEmbedders, openEmbedder, textModelsDirectory } = await load("embeddings/embed.js")
const { textModel, vectorModelKey, meaningFloor } = await load("embeddings/models.js")
const coreVersion = JSON.parse(readFileSync(join(core, "package.json"), "utf8")).version

await downloadTextModel(modelId, { env: process.env, progress: (line) => process.stderr.write(`${line}\n`) })
const model = textModel(modelId, process.env)
const key = vectorModelKey(model)
// A state folder with no model: the lane's meaning half then skips with not_found, as on a store with no vectors.
const noModel = { ...process.env, WIRECAT_STATE_DIR: join(work, "no-model-state") }

const queries = JSON.parse(readFileSync(join(here, "queries.json"), "utf8"))
const corpus = buildCorpus({ items })
const rows =
  variant === "as-is"
    ? corpus.rows
    : prefixed(
        variant === "prefixed"
          ? corpus.rows
          : { ...corpus.rows, comment: corpus.rows.comment.filter((row) => !SHORT_COMMENTS.includes(row.body)) },
      )
const ACCOUNTS = ["alice", "bob"].map((account) => ({ provider: "linear", account }))
const messenger = { provider: "test", account: "chat" }

const storePath = join(work, `${modelId}-${items}-${variant}.db`)
const store = await openStore({ path: storePath })
const t = () => performance.now()
let started = t()
for (const account of ACCOUNTS) {
  const source = fakeTrackerSource({ rows, provider: "linear", pageSize: 500, clock: () => Date.parse("2026-11-01") })
  const report = await syncTracker(source, store, account, { now: Date.parse("2026-11-01") })
  if (!report.complete) throw new Error(`sync incomplete: ${JSON.stringify(report.synced)}`)
}
await store.chats.saveChats(messenger, [
  { id: "1", title: "Team chat", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
])
await store.messages.saveMessages(
  messenger,
  "1",
  corpus.messages.map((one) => ({
    ...one,
    chatId: "1",
    senderId: "100",
    senderName: null,
    editedAt: null,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  })),
  { via: "history" },
)
await store.searchIndex.fillSearchIndex({})
await store.searchIndex.fillStems({})
const seedSeconds = (t() - started) / 1000

const refsOf = (target) => {
  const answer = corpus.answers[target]
  return ACCOUNTS.map(({ account }) => `tracker:linear/${account}/${answer.kind}/${answer.externalId}`)
}
const shortIds = new Set(
  corpus.rows.comment.filter((row) => SHORT_COMMENTS.includes(row.body)).map((row) => row.externalId),
)
const isShort = (item) => item.kind === "issue_comment" && shortIds.has(item.ref.split("/").at(-1))
const now = Date.parse("2026-11-23T12:00:00Z")
const ask = (text, only, env = process.env) =>
  searchAll(store, messenger, { text, limit: 10, now, env, ...(only ? { only } : {}) })

const score = async (arm, env, expectBy) => {
  const out = []
  for (const query of queries) {
    const refs = new Set(refsOf(query.target))
    const lane = await ask(query.text, ["tracker"], env)
    if (lane.tracker?.by !== expectBy)
      throw new Error(`${query.id}: tracker searched by ${lane.tracker?.by}, not ${expectBy}`)
    const full = await ask(query.text, undefined, env)
    const rankIn = (found) => found.items.findIndex((item) => refs.has(item.ref)) + 1 || null
    const foundIn = (found) => found.items.filter((item) => refs.has(item.ref)).length
    out.push({
      id: query.id,
      kind: query.kind,
      target: query.target,
      arm,
      lane_rank: rankIn(lane),
      lane_found: foundIn(lane),
      full_rank: rankIn(full),
      full_found: foundIn(full),
      full_kinds: [...new Set(full.items.map((item) => item.kind))],
      lane_short_comments: lane.items.filter(isShort).length,
      lane_meaning_only: lane.items.filter((item) => item.foundBy.join() === "meaning").length,
      lane_top: lane.items
        .slice(0, 3)
        .map((item) => `${item.ref.split("/").slice(1).join("/")} ${item.foundBy.join("+")}`),
      meaning_skipped: lane.tracker?.meaningSkipped ?? null,
    })
  }
  return out
}

const shortJson = JSON.stringify([...shortIds])
const counts = () => {
  const db = new DatabaseSync(storePath, { readOnly: true })
  const one = (sql, ...args) => Number(Object.values(db.prepare(sql).get(...args))[0])
  const result = {
    tracker_rows: one("SELECT count(*) FROM tracker_items WHERE kind IN ('issue', 'project', 'comment')"),
    chunks: one("SELECT count(*) FROM chunks WHERE chunkable_type = 'tracker_item'"),
    distinct_chunk_texts: one("SELECT count(DISTINCT content_hash) FROM chunks WHERE chunkable_type = 'tracker_item'"),
    vectors: one("SELECT count(*) FROM embeddings WHERE model = ?", key),
    short_comment_chunks: one(
      `SELECT count(*) FROM chunks c JOIN tracker_items t ON t.id = c.chunkable_id
       WHERE c.chunkable_type = 'tracker_item' AND t.kind = 'comment' AND t.external_id IN (SELECT value FROM json_each(?))`,
      shortJson,
    ),
    short_comment_vectors: one(
      `SELECT count(DISTINCT c.content_hash) FROM chunks c JOIN tracker_items t ON t.id = c.chunkable_id
       WHERE c.chunkable_type = 'tracker_item' AND t.kind = 'comment' AND t.external_id IN (SELECT value FROM json_each(?))`,
      shortJson,
    ),
  }
  db.close()
  const size = (path) => {
    try {
      return statSync(path).size
    } catch {
      return 0
    }
  }
  result.store_bytes = size(storePath) + size(`${storePath}-wal`)
  return result
}

const words = await score("words", process.env, "words")
const before = counts()

started = t()
let embedded = 0
for (;;) {
  const done = await embedTracker(store, { model: modelId, env: process.env })
  embedded += done.embedded
  if (!done.left) break
}
const embedSeconds = (t() - started) / 1000
const after = counts()

const both = await score("words+meaning", process.env, "words and meaning")

// Meaning alone, warm model: where each target ranks and its raw cosine, before the model's floor cuts the list.
const warm = warmEmbedders({ idleMs: 3_600_000 })
const embedder = await openEmbedder(model, textModelsDirectory(process.env))
const floor = meaningFloor(key)
const meaning = []
for (const query of queries) {
  const answer = corpus.answers[query.target]
  const plain = query.text.replace(/\?$/, "")
  const near = await nearestTracker(store, plain, { limit: 50, accounts: ACCOUNTS, embedders: warm })
  const [vector] = await embedder.embed([plain], "query")
  const raw = await store.tracker.nearest(key, vector, { limit: 200, accounts: ACCOUNTS })
  const at = raw.findIndex(({ item }) => item.kind === answer.kind && item.record.externalId === answer.externalId)
  const shortAbove = raw
    .slice(0, at < 0 ? 10 : Math.min(at, 10))
    .filter(({ item }) => item.kind === "comment" && shortIds.has(item.record.externalId)).length
  meaning.push({
    id: query.id,
    kind: query.kind,
    rank_after_floor:
      near.findIndex(({ item }) => item.kind === answer.kind && item.record.externalId === answer.externalId) + 1 ||
      null,
    raw_rank: at < 0 ? null : at + 1,
    cosine: at < 0 ? null : Math.round(raw[at].score * 1000) / 1000,
    top_cosine: raw[0] ? Math.round(raw[0].score * 1000) / 1000 : null,
    passed_floor: near.length,
    short_in_raw_top10: shortAbove,
  })
}
await embedder.close()

// Latency: two queries of each kind, `rounds` times, through searchAll as the CLI calls it (the model opens on every
// call), and the meaning lookup alone with a warm model, as a long-lived server would hold it.
const timed = queries.filter((_, n) => n % 6 === 0 || n % 6 === 3).slice(0, 10)
const time = async (f) => {
  const all = []
  for (let round = 0; round < rounds; round++)
    for (const query of timed) {
      const start = t()
      await f(query.text)
      all.push(t() - start)
    }
  all.sort((a, b) => a - b)
  const at = (p) => Math.round(all[Math.min(all.length - 1, Math.floor(p * all.length))] * 10) / 10
  return { n: all.length, p50: at(0.5), p95: at(0.95) }
}
for (const query of timed) await ask(query.text, ["tracker"])
const latency = {
  lane_words: await time((text) => ask(text, ["tracker"], noModel)),
  lane_words_meaning: await time((text) => ask(text, ["tracker"])),
  full_words: await time((text) => ask(text, undefined, noModel)),
  full_words_meaning: await time((text) => ask(text, undefined)),
  meaning_lookup_warm: await time((text) =>
    nearestTracker(store, text.replace(/\?$/, ""), { limit: 10, accounts: ACCOUNTS, embedders: warm }),
  ),
}
await warm.close()
await store.close()

const result = {
  core_version: coreVersion,
  node: process.version,
  model: modelId,
  vector_key: key,
  floor,
  items,
  variant,
  accounts: ACCOUNTS.length,
  corpus: {
    issues: rows.issue.length,
    projects: rows.project.length,
    comments: rows.comment.length,
    messages: corpus.messages.length,
  },
  seed_seconds: Math.round(seedSeconds * 10) / 10,
  embed: { chunks_embedded: embedded, seconds: Math.round(embedSeconds * 10) / 10 },
  before,
  after,
  latency,
  rounds,
  timed_queries: timed.map(({ id }) => id),
  queries: words.concat(both),
  meaning,
}
mkdirSync(join(here, "results"), { recursive: true })
const out = join(here, "results", `${modelId}-${items}-${variant}.json`)
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${out}\n`)
