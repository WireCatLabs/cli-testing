import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { parseLocator } from "../../dist/domain/locator.js"
import { createStemmer } from "../../dist/search/stem.js"
import type { FoundMessage, SearchQuery } from "../../dist/services/messages.js"
import { searchStore } from "../../dist/services/messages.js"
import { searchCombined } from "../../dist/services/messages-combined.js"
import type { AccountKey, MessageStore, StoredHit } from "../../dist/store/store.js"
import { planQuestion, words } from "./plan.ts"

export async function buildIndex(account: AccountKey, messages: StoredHit[]) {
  const documents = new Map(messages.map((m) => [m.locator, m]))
  const byId = new Map(messages.map((m) => [JSON.stringify([m.chatId, m.id]), m]))
  const children = new Map<string, StoredHit[]>()
  for (const m of messages) {
    const owner = parseLocator(m.locator)
    assert.equal(owner.provider, account.provider)
    assert.equal(owner.account, account.account)
    if (m.replyToId) {
      const parent = byId.get(JSON.stringify([m.chatId, m.replyToId]))
      if (parent) children.set(parent.locator, [...(children.get(parent.locator) ?? []), m])
    }
  }
  const stemmer = await createStemmer()
  const counts = new Map<string, Map<string, number>>()
  const frequency = new Map<string, number>()
  let tokens = 0
  for (const m of messages) {
    const c = new Map<string, number>()
    for (const token of words(m.text)) {
      const w = stemmer.stemToken(token)
      c.set(w, (c.get(w) ?? 0) + 1)
    }
    counts.set(m.locator, c)
    tokens += [...c.values()].reduce((s, n) => s + n, 0)
    for (const w of c.keys()) frequency.set(w, (frequency.get(w) ?? 0) + 1)
  }
  return { account, documents, children, counts, frequency, average: tokens / Math.max(messages.length, 1), stemmer }
}
export type Index = Awaited<ReturnType<typeof buildIndex>>
export async function search(
  index: Index,
  store: MessageStore,
  request: SearchQuery,
  mode: "direct" | "question" | "context",
  ranking: "bm25" | "content-bm25" | "coverage-bm25" = "bm25",
  relaxed = false,
) {
  request.signal?.throwIfAborted()
  const started = performance.now()
  const raw = request.text ?? ""
  const plan = planQuestion(raw, request.ast !== undefined || !!request.exact || !!request.newest)
  const queries = mode === "direct" ? [raw] : plan.queries
  const union = new Map<string, FoundMessage & { fused: number }>()
  let strict = request.ast !== undefined || !!request.exact || !!request.newest
  for (const text of queries) {
    const result = await searchCombined(
      store,
      index.account,
      request.ast !== undefined ? { ...request, limit: 300 } : { ...request, text, limit: 300 },
      {},
      { candidateDepth: 300, rrfK: 60, rerank: "none", chatCap: 0 },
    )
    assert.ok(
      result.items.every((m) => index.documents.has(m.locator)),
      "candidate belongs to the indexed account snapshot",
    )
    strict ||= !result.query.combined.expanded
    result.items.forEach((m, rank) => {
      const previous = union.get(m.locator)
      const fused = (previous?.fused ?? 0) + 1 / (60 + rank + 1)
      union.set(m.locator, { ...m, fused })
    })
  }
  if (relaxed && plan.changed && !strict) {
    const terms = [...new Set(plan.terms.concat(plan.aliases.flatMap((a) => words(a.split(" -> ")[1] ?? ""))))]
    const text = `(${terms.join(" OR ")})${plan.scope ? ` ${plan.scope}` : ""}`
    const found = await searchStore(store, index.account, { ...request, text, language: "lucene", limit: 300 })
    for (const [rank, m] of found.items.entries()) {
      const previous = union.get(m.locator)
      union.set(m.locator, { ...m, fused: (previous?.fused ?? 0) + 1 / (60 + rank + 1) })
    }
  }
  let candidates = [...union.values()].sort((a, b) => b.fused - a.fused).slice(0, 300)
  const originalIds = candidates.map((m) => m.id)
  const lookupMs = performance.now() - started
  let contextMs = 0
  const contextual = new Map<string, FoundMessage>()
  if (mode === "context" && !strict) {
    const start = performance.now()
    const proposed = [...candidates]
    const proposedKeys = new Set(proposed.map((m) => m.locator))
    let proposedReplies = 0
    for (const parent of candidates)
      for (const child of index.children.get(parent.locator) ?? []) {
        if (!proposedKeys.has(child.locator) && proposedReplies < 100) {
          proposed.push({ ...child, fused: 0 })
          proposedKeys.add(child.locator)
          proposedReplies++
        }
      }
    const requestedOnly = request.only ? new Set(request.only.map((m) => JSON.stringify([m.chatId, m.id]))) : undefined
    const only = proposed
      .filter((m) => !requestedOnly || requestedOnly.has(JSON.stringify([m.chatId, m.id])))
      .map((m) => ({ chatId: m.chatId, id: m.id }))
    const proposedChats = [...new Set(proposed.map((m) => m.chatId))]
    const eligibilityChat = request.chat ?? (!plan.scope && proposedChats.length === 1 ? proposedChats[0] : undefined)
    let eligible: Set<string> | undefined
    if (!only.length) eligible = new Set()
    else {
      const scope = await searchStore(store, index.account, {
        ...request,
        text: plan.scope || undefined,
        language: "lucene",
        chat: eligibilityChat,
        ast: undefined,
        only,
        limit: 500,
      })
      assert.ok(!scope.hasMore, "bounded reply eligibility is complete")
      eligible = new Set(scope.items.map((m) => m.locator))
      assert.ok(scope.items.every((m) => proposedKeys.has(m.locator)))
    }
    if (eligible) {
      let additions = 0
      const seen = new Set(candidates.map((m) => m.locator))
      for (const parent of [...candidates]) {
        request.signal?.throwIfAborted()
        if (!eligible.has(parent.locator)) continue
        for (const child of index.children.get(parent.locator) ?? []) {
          if (eligible.has(child.locator) && !seen.has(child.locator) && additions < 100 && candidates.length < 300) {
            candidates.push({ ...child, match: undefined, fused: 0 })
            seen.add(child.locator)
            additions++
          }
          if (seen.has(child.locator) && eligible.has(child.locator)) contextual.set(child.locator, parent)
        }
      }
      assert.ok(candidates.every((m) => eligible?.has(m.locator)))
    }
    contextMs = performance.now() - start
  }
  const scoreStart = performance.now()
  if (mode !== "direct" && !strict) {
    const rawTerms = (ranking === "bm25" ? plan.rankingTerms : plan.terms).concat(
      plan.aliases.flatMap((a) => words(a.split(" -> ")[1] ?? "")),
    )
    const terms = rawTerms.map((w) => index.stemmer.stemToken(w))
    let scoredBytes = 0
    const score = (m: FoundMessage) => {
      request.signal?.throwIfAborted()
      const parent = contextual.get(m.locator)
      scoredBytes += Buffer.byteLength(m.text) + (parent ? Buffer.byteLength(parent.text) : 0)
      assert.ok(scoredBytes <= 8 * 1024 * 1024, "bounded scoring body bytes")
      const count = new Map(index.counts.get(m.locator) ?? [])
      if (parent) {
        for (const [word, frequency] of index.counts.get(parent.locator) ?? [])
          count.set(word, (count.get(word) ?? 0) + frequency)
        const reply = index.stemmer.stemToken("reply")
        count.set(reply, (count.get(reply) ?? 0) + 1)
      }
      const length = [...count.values()].reduce((s, n) => s + n, 0)
      const unique = [...new Set(terms)]
      const coverage = unique.filter((word) => count.has(word)).length / Math.max(unique.length, 1)
      const bm25 = unique.reduce((sum, word) => {
        const tf = count.get(word) ?? 0
        const df = index.frequency.get(word) ?? 0
        const idf = Math.log(1 + (index.documents.size - df + 0.5) / (df + 0.5))
        return sum + (tf ? (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * length) / index.average)) : 0)
      }, 0)
      return { bm25, coverage }
    }
    candidates = candidates
      .map((m) => ({ ...m, ...score(m) }))
      .sort(
        (a, b) => (ranking === "coverage-bm25" ? b.coverage - a.coverage : 0) || b.bm25 - a.bm25 || b.fused - a.fused,
      )
      .map(({ bm25, coverage: _coverage, ...m }) => ({ ...m, score: bm25 }))
  }
  return {
    plan,
    strict,
    originalIds,
    candidateIds: candidates.map((m) => m.id),
    items: candidates.slice(0, request.limit).map(({ fused: _fused, ...m }) => m),
    lookupMs,
    contextMs,
    scoringMs: performance.now() - scoreStart,
    totalMs: performance.now() - started,
  }
}
