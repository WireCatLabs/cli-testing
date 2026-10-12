import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import type { Message } from "../../dist/domain/models.js"
import { editDistance, maxEdits } from "../../dist/search/correct.js"
import { implicitTextTerms } from "../../dist/search/lucene/parser.js"
import { trigrams } from "../../dist/search/trigrams.js"
import { COMBINED_DEFAULTS, searchCombined } from "../../dist/services/messages-combined.js"
import { searchStore } from "../../dist/services/messages.js"
import { normalize } from "../../dist/store/normalize.js"
import { openStore } from "../../dist/store/store.js"

type Query = {
  id: string
  split: "dev" | "test"
  category: string
  lucene: string
  legacy: string
  relevant: Record<string, number>
}
type Corpus = {
  chats: { id: string; title: string }[]
  messages: Pick<Message, "id" | "chatId" | "senderId" | "timestamp" | "text">[]
  queries: Query[]
}
type Guard = { edits: "none" | "one" | "auto"; minDocs: number; prefix: 0 | 3 | 4 }
type Hit = { id: string; text: string }
type Outcome = {
  ids: string[]
  rewritten?: string
  corrections?: Record<string, string[]>
  partial?: { id: string; missing: string[] }[]
  ms: number
}

const bytes = readFileSync(new URL("./corpus.json", import.meta.url))
const corpus = JSON.parse(bytes.toString()) as Corpus
const root = mkdtempSync(join(tmpdir(), "typo-quality-"))
process.env.TZ = "UTC"
process.env.MESSAGING_STORE = join(root, "quality.db")
process.env.CLI_COMMON_CACHE_DIR = join(root, "empty-cache")
const store = await openStore({ path: process.env.MESSAGING_STORE })
const account = { provider: "synthetic", account: "500" }
const heldOut = process.argv.includes("--held-out")
const frozenArg = process.argv.find((a) => a.startsWith("--frozen="))
const frozenPartial = process.argv.find((a) => a.startsWith("--partial="))?.slice("--partial=".length) as
  | "any"
  | "allButOne"
  | "discover"
  | undefined

const strict = async (text: string): Promise<Hit[]> =>
  (await searchStore(store, account, { text, language: "lucene", timezone: "UTC", limit: 10 })).items

const plainWords = (text: string) =>
  [...implicitTextTerms(text)].flatMap((start) => {
    const word = text.slice(start).match(/^[\p{L}\p{N}]+/u)?.[0]
    return word && /^[\p{L}\p{N}]+$/u.test(word) && !/^\d+$/.test(word) ? [{ start, word }] : []
  })

const alternatives = async (word: string, guard: Guard) => {
  const w = normalize(word)
  const max = guard.edits === "one" ? 1 : maxEdits(w)
  const near = (
    await store.termCandidates(trigrams(w), { shortest: Math.max(3, w.length - max), longest: w.length + max })
  )
    .map((c) => ({ ...c, distance: editDistance(w, c.term, max) }))
    .filter((c) => c.distance <= max && c.docs >= guard.minDocs)
  const nearest = Math.min(...near.map((c) => c.distance))
  return near
    .filter((c) => c.distance === nearest)
    .sort((a, b) => b.docs - a.docs)
    .slice(0, 5)
    .map((c) => c.term)
}

const narrow = async (text: string, guard: Guard): Promise<Omit<Outcome, "ms">> => {
  const exact = await strict(text)
  if (exact.length) return { ids: exact.map((h) => h.id) }
  const words = plainWords(text)
  if (!words.length) return { ids: [] }
  const known = await store.knownTerms(words.map(({ word }) => normalize(word)))
  const corrections: Record<string, string[]> = {}
  let rewritten = text
  for (const { start, word } of [...words].sort((a, b) => b.start - a.start)) {
    const w = normalize(word)
    const whole = (await store.termCandidates(trigrams(w), { shortest: w.length, longest: w.length })).some(
      (c) => c.term === w,
    )
    if (whole) continue
    const beginning = known.has(w)
    const options = beginning
      ? guard.prefix && [...w].length >= guard.prefix
        ? [`${w}*`]
        : []
      : guard.edits === "none"
        ? []
        : await alternatives(word, guard)
    if (!options.length) continue
    corrections[word] = options
    rewritten = `${rewritten.slice(0, start)}(${options.join(" OR ")})${rewritten.slice(start + word.length)}`
  }
  if (rewritten === text) return { ids: [] }
  return { ids: (await strict(rewritten)).map((h) => h.id), rewritten, corrections }
}

// The relaxed OR query mirrors --discover's partial step (messages-discovery.ts), scope words kept.
const partial = async (text: string, guard: Guard, need: "any" | "allButOne"): Promise<Omit<Outcome, "ms">> => {
  const forgiven = await narrow(text, guard)
  if (forgiven.ids.length) return forgiven
  const plain = plainWords(text)
  const words = plain.map(({ word }) => word)
  if (words.length < 2) return forgiven
  const scope = [...plain]
    .sort((a, b) => b.start - a.start)
    .reduce((rest, { start, word }) => `${rest.slice(0, start)}${rest.slice(start + word.length)}`, text)
    .trim()
  const alternatives = (word: string) => forgiven.corrections?.[word] ?? [word]
  const group = (w: string) => `(${alternatives(w).join(" OR ")})`
  const relaxed =
    need === "any"
      ? `(${words.map(group).join(" OR ")})`
      : `(${words.map((_, skip) => `(${words.filter((__, at) => at !== skip).map(group).join(" AND ")})`).join(" OR ")})`
  const query = scope ? `${relaxed} ${scope}` : relaxed
  const hits = await strict(query)
  const stem = (w: string) => normalize(w).slice(0, Math.max(3, normalize(w).length - 2))
  return {
    ids: hits.map((h) => h.id),
    rewritten: query,
    corrections: forgiven.corrections,
    partial: hits.map((h) => ({
      id: h.id,
      missing: words.filter((w) => !alternatives(w).some((a) => normalize(h.text).includes(stem(a.replace(/\*$/, ""))))),
    })),
  }
}

const discoverAfter = async (text: string, guard: Guard): Promise<Omit<Outcome, "ms">> => {
  const forgiven = await narrow(text, guard)
  if (forgiven.ids.length) return forgiven
  const found = await searchStore(store, account, { text, language: "lucene", discover: true, timezone: "UTC", limit: 10 })
  return {
    ids: found.items.map((h) => h.id),
    rewritten: "discover",
    partial: found.items.map((h) => ({ id: h.id, missing: h.discovery?.missingTerms ?? [] })),
  }
}

const score = (q: Query, ids: string[]) => {
  const grades = Object.values(q.relevant)
  const first = ids.findIndex((id) => q.relevant[id])
  const dcg = (g: number[]) => g.reduce((s, v, i) => s + (2 ** v - 1) / Math.log2(i + 2), 0)
  return {
    recallAt10: grades.length ? ids.filter((id) => q.relevant[id]).length / grades.length : null,
    mrr: grades.length ? (first < 0 ? 0 : 1 / (first + 1)) : null,
    ndcgAt10: grades.length
      ? dcg(ids.map((id) => q.relevant[id] ?? 0)) / dcg([...grades].sort((a, b) => b - a).slice(0, 10))
      : null,
    falseHits: grades.length ? 0 : ids.length,
  }
}
type Row = ReturnType<typeof score> & { id: string; category: string } & Outcome
const aggregate = (rows: Row[]) => {
  const summarize = (subset: Row[]) => {
    const answerable = subset.filter((r) => r.recallAt10 !== null)
    const mean = (k: "recallAt10" | "mrr" | "ndcgAt10") =>
      answerable.length ? answerable.reduce((s, r) => s + (r[k] ?? 0), 0) / answerable.length : null
    return {
      recallAt10: mean("recallAt10"),
      mrr: mean("mrr"),
      ndcgAt10: mean("ndcgAt10"),
      noAnswerFalseHits: subset.reduce((s, r) => s + r.falseHits, 0),
    }
  }
  const times = rows.map((r) => r.ms).sort((a, b) => a - b)
  return {
    ...summarize(rows),
    p50Ms: times[Math.floor(times.length * 0.5)],
    p95Ms: times[Math.floor(times.length * 0.95)],
    categories: Object.fromEntries(
      [...new Set(rows.map((r) => r.category))].map((c) => [c, summarize(rows.filter((r) => r.category === c))]),
    ),
  }
}

// Unlabelled diagnostic: a real word missing from the archive but one or two edits from an archive word.
// No relevance labels exist for these; a hit shows a correction firing on a word that was not a typo.
const absentNearWordQueries: Query[] = [
  ["cedar-detention", "cedar backup detention"],
  ["lumen-refuse", "lumen invoice refuse"],
  ["aurora-callback", "aurora rollout callback"],
  ["aurora-restart", "aurora rollout restart"],
  ["cedar-attention", "cedar backup attention"],
].map(([id, lucene]) => ({ id: id as string, split: "dev", category: "absent-near-word", lucene: lucene as string, legacy: lucene as string, relevant: {} }))

type Mode = { name: string; search: (q: Query) => Promise<Omit<Outcome, "ms">> }
const evaluate = async (mode: Mode, queries: Query[]) => {
  const rows: Row[] = []
  for (const q of queries) {
    const start = performance.now()
    const outcome = await mode.search(q)
    const ms = performance.now() - start
    assert.equal(new Set(outcome.ids).size, outcome.ids.length, `${mode.name} duplicate ${q.id}`)
    rows.push({ id: q.id, category: q.category, ...outcome, ms, ...score(q, outcome.ids) })
  }
  return rows
}
const sameAsStrict = async (rows: Row[], queries: Query[]) => {
  const differs: string[] = []
  for (const q of queries.filter((q) => ["phrase", "and", "or", "from", "date", "chat"].includes(q.category))) {
    const reference = (await strict(q.lucene)).map((h) => h.id)
    const row = rows.find((r) => r.id === q.id)
    if (JSON.stringify(row?.ids) !== JSON.stringify(reference)) differs.push(q.id)
  }
  return differs
}

const parity = async (rows: Row[]) => {
  const matched: string[] = []
  const differs: string[] = []
  for (const row of rows.filter((r) => r.category === "typo" || r.category === "beginnings")) {
    const spelled = corpus.queries.find((q) => q.id === row.id.replace(/-(typo|beginnings)$/, "-words"))
    assert.ok(spelled)
    const reference = (await strict(spelled.lucene)).map((h) => h.id)
    ;(JSON.stringify(reference) === JSON.stringify(row.ids) ? matched : differs).push(row.id)
  }
  return { matched, differs }
}

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
  await store.fillSearchIndex({})
  await store.fillStems({})
  const split = heldOut ? "test" : "dev"
  const queries = corpus.queries.filter((q) => q.split === split)
  const baseModes: Mode[] = [
    { name: "strict", search: async (q) => ({ ids: (await strict(q.lucene)).map((h) => h.id) }) },
    {
      name: "legacy",
      search: async (q) => ({
        ids: (await searchStore(store, account, { text: q.legacy, language: "legacy", limit: 10 }))
          .items.map((h) => h.id),
      }),
    },
    {
      name: "combined",
      search: async (q) => ({
        ids: (await searchCombined(store, account, { text: q.lucene, limit: 10, timezone: "UTC" }, {}, COMBINED_DEFAULTS))
          .items.map((h) => h.id),
      }),
    },
    {
      name: "discover",
      search: async (q) => ({
        ids: (
          await searchStore(store, account, { text: q.lucene, language: "lucene", discover: true, timezone: "UTC", limit: 10 })
        ).items.map((h) => h.id),
      }),
    },
    {
      name: "combined-when-strict-empty",
      search: async (q) => {
        const exact = await strict(q.lucene)
        if (exact.length || !plainWords(q.lucene).length) return { ids: exact.map((h) => h.id) }
        return {
          ids: (await searchCombined(store, account, { text: q.lucene, limit: 10, timezone: "UTC" }, {}, COMBINED_DEFAULTS))
            .items.map((h) => h.id),
        }
      },
    },
  ]
  const guards: Guard[] = []
  for (const edits of ["none", "one", "auto"] as const)
    for (const minDocs of edits === "none" ? [1] : [1, 2, 3, 5, 10])
      for (const prefix of [0, 3, 4] as const) guards.push({ edits, minDocs, prefix })
  const frozen = frozenArg ? (JSON.parse(frozenArg.slice("--frozen=".length)) as Guard) : undefined
  const narrowModes: Mode[] = (frozen ? [frozen] : guards).map((guard) => ({
    name: `narrow ${JSON.stringify(guard)}`,
    search: (q) => narrow(q.lucene, guard),
  }))
  const cGuard: Guard = frozen ?? { edits: "one", minDocs: 1, prefix: 3 }
  const partialNeeds = frozenPartial ? [frozenPartial] : (["any", "allButOne", "discover"] as const)
  narrowModes.push(
    ...partialNeeds.map((need) => ({
      name: `C partial ${need} ${JSON.stringify(cGuard)}`,
      search: (q: Query) => (need === "discover" ? discoverAfter(q.lucene, cGuard) : partial(q.lucene, cGuard, need)),
    })),
  )
  const results = []
  for (const mode of [...baseModes, ...narrowModes]) {
    const rows = await evaluate(mode, queries)
    const absentNearWords = await evaluate(mode, absentNearWordQueries)
    results.push({
      mode: mode.name,
      metrics: aggregate(rows),
      absentNearWordHits: absentNearWords.reduce((s, r) => s + r.ids.length, 0),
      absentNearWordQueriesHit: absentNearWords.filter((r) => r.ids.length).map((r) => r.id),
      strictControlsDiffer: await sameAsStrict(rows, queries),
      sameTopTenAsCorrectlySpelled: await parity(rows),
      rows: rows.filter((r) => r.rewritten || r.category === "paraphrase" || r.category.startsWith("no-answer") || ["typo", "beginnings"].includes(r.category)),
    })
  }
  console.log(
    JSON.stringify(
      {
        split,
        frozen: frozen ?? null,
        corpusSha256: createHash("sha256").update(bytes).digest("hex"),
        runnerSha256: createHash("sha256").update(readFileSync(new URL("./typo.ts", import.meta.url))).digest("hex"),
        productionSha256: Object.fromEntries(
          [
            "services/messages.js",
            "services/messages-combined.js",
            "services/messages-discovery.js",
            "services/messages-search.js",
            "search/correct.js",
            "search/lucene/parser.js",
            "store/sqlite/lucene.js",
            "store/sqlite/words.js",
          ].map((file) => [
            file,
            createHash("sha256").update(readFileSync(new URL(`../../dist/${file}`, import.meta.url))).digest("hex"),
          ]),
        ),
        results,
      },
      null,
      2,
    ),
  )
} finally {
  await store.close()
}
