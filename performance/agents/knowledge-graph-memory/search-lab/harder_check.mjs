// cli-core's `search all --harder` reorder, run as shipped over the lab's stack C top 30 for the 17 reworded v3
// questions. The candidates come from the cross-encoder results (their keys are stack C's top 50 in order), so no
// vectors are rebuilt. The key is read from the keyring in this process and never printed.
//
//   node harder_check.mjs --core <cli-core checkout> [--budget 0.10]

import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { core: { type: "string" }, budget: { type: "string", default: "0.10" } } })
if (!values.core) throw new Error("--core <cli-core checkout, built> is required")
const { reorderHarder, writeHarderSetting } = await import(
  pathToFileURL(join(values.core, "dist/services/search-harder.js")).href
)

const bench = join(homedir(), ".cache/wirecat-bench")
const here = new URL(".", import.meta.url).pathname
const corpus = readFileSync(join(bench, "kg-fixture-v3/corpus.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
const index = new Map(corpus.map((record, i) => [record.id, i]))
const oracle = new Map(JSON.parse(readFileSync(join(bench, "kg-fixture-v3/oracle.json"), "utf8")).map((r) => [r.id, r]))
const asOf = new Map(
  JSON.parse(readFileSync(join(bench, "kg-fixture-v3/queries.json"), "utf8")).map((q) => [q.id, q.as_of]),
)
// JSON.parse would sort the integer keys and lose stack C's order, so the order is read from the text.
const stackC = [
  ...readFileSync(join(here, "results/rerank-bge-reranker-base-v3-rew-stackC.json"), "utf8").matchAll(
    /"((?:[^"\\]|\\.)*)": \{([^{}]*)\}/g,
  ),
].map(([, k, inner]) => [JSON.parse(`"${k}"`), [...inner.matchAll(/"(\d+)":/g)].map(([, i]) => Number(i))])

let key
try {
  key = execFileSync("secret-tool", ["lookup", "service", "cli-memo", "account", "anthropic"], {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim()
} catch {}
if (!key) throw new Error("no Anthropic key in the keyring (service cli-memo, account anthropic); nothing was sent")

const root = mkdtempSync(join(tmpdir(), "harder-check-"))
const env = { WIRECAT_STATE_DIR: root, MESSAGING_STORE: join(root, "store.db") }
writeHarderSetting(env, { provider: "anthropic", model: "claude-haiku-5-5", consented_at: new Date().toISOString() })

const budget = Number(values.budget)
const score = (order, gold) => {
  const found = order.slice(0, 10).filter((i) => gold.has(i)).length
  return { recall: found / gold.size, hit: found > 0 ? 1 : 0 }
}
const rows = []
let spent = 0
for (const [k, order] of stackC) {
  if (spent > budget) break
  const [qid, question] = k.split("\t")
  const gold = new Set(oracle.get(qid).required_citations.map((id) => index.get(id)))
  const hits = order
    .slice(0, 30)
    .map((i) => ({ i, title: corpus[i].title ?? null, timestamp: corpus[i].timestamp, text: corpus[i].text }))
  const { items, harder } = await reorderHarder(question, hits, { env, now: Date.parse(asOf.get(qid)), key: () => key })
  spent += harder.cost_usd ?? 0
  rows.push({
    plain: score(
      hits.map((h) => h.i),
      gold,
    ),
    harder: score(
      items.map((h) => h.i),
      gold,
    ),
    applied: harder.applied,
    reason: harder.reason_id ?? null,
    ms: harder.ms,
  })
}
const mean = (pick) => Math.round((rows.reduce((sum, row) => sum + pick(row), 0) / rows.length) * 100) / 100
const ms = rows.map((row) => row.ms).sort((a, b) => a - b)
process.stdout.write(
  `${JSON.stringify(
    {
      questions: rows.length,
      applied: rows.filter((row) => row.applied).length,
      fallbacks: rows.filter((row) => !row.applied).map((row) => row.reason),
      stack_c: { recall_at_10: mean((r) => r.plain.recall), hit_at_10: mean((r) => r.plain.hit) },
      harder: { recall_at_10: mean((r) => r.harder.recall), hit_at_10: mean((r) => r.harder.hit) },
      ms_median: ms[Math.floor(ms.length / 2)],
      ms_max: ms.at(-1),
      cost_usd: Math.round(spent * 1e6) / 1e6,
    },
    null,
    1,
  )}\n`,
)
