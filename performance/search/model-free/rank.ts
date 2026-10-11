import { performance } from "node:perf_hooks"
import { words } from "../../dist/search/question-plan.js"
import { createStemmer } from "../../dist/search/stem.js"
import type { FoundMessage } from "../../dist/services/messages.js"

export const createCandidateRanker = async () => {
  const stemmer = await createStemmer()
  return (items: FoundMessage[], terms: string[]) => {
    const started = performance.now()
    const byLocator = new Map(items.map((m) => [m.locator, m]))
    const tokenize = (text: string) => words(text).map((w) => stemmer.stemToken(w))
    const query = [...new Set(terms.map((w) => stemmer.stemToken(w)))]
    const docs = items.map((m) => {
      const parent = m.discovery?.parent ? byLocator.get(m.discovery.parent) : undefined
      const tokens = tokenize(`${parent ? `${parent.text}\n` : ""}${m.text}`)
      const counts = new Map<string, number>()
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
      return { m, counts, length: tokens.length }
    })
    const average = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(docs.length, 1)
    const idf = new Map(
      query.map((term) => {
        const frequency = docs.filter((d) => d.counts.has(term)).length
        return [term, Math.log(1 + (docs.length - frequency + 0.5) / (frequency + 0.5))]
      }),
    )
    const rows = docs.map((d, index) => {
      let bm25 = 0
      let weightedCoverage = 0
      for (const term of query) {
        const tf = d.counts.get(term) ?? 0
        const weight = idf.get(term) ?? 0
        if (tf) weightedCoverage += weight
        bm25 += (weight * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * d.length) / Math.max(average, 1)))
      }
      return { ...d, index, bm25, weightedCoverage, coverage: d.m.discovery?.coverage ?? 0 }
    })
    const sorted = (compare: (a: (typeof rows)[number], b: (typeof rows)[number]) => number) =>
      [...rows].sort((a, b) => compare(a, b) || a.index - b.index).map((r) => r.m)
    const variants = [
      { mode: "candidate-bm25", items: sorted((a, b) => b.bm25 - a.bm25) },
      { mode: "coverage-bm25", items: sorted((a, b) => b.coverage - a.coverage || b.bm25 - a.bm25) },
      { mode: "idf-coverage", items: sorted((a, b) => b.weightedCoverage - a.weightedCoverage || b.bm25 - a.bm25) },
    ]
    return { variants, elapsedMs: performance.now() - started }
  }
}
