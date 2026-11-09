// cli-core's real `searchAll`, as memo's `search all` calls it, over a copy of a memo store with EmbeddingGemma
// vectors. `--arm plain` sends nothing; `--arm harder` runs `harder` of the cli-core build given with `--core`
// (0.620.0's rerank, the rewrite build, or the provider build), through one `--provider` for every call of the arm.
// The key is read from the keyring in this process and never printed; the store copy sees no keyring.
//
//   node harder_rewrite_check.mjs --core <built cli-core> --store <copied memo root> --fixture <fixture> \
//     --set v3-rew --ids results/set-ids.json --arm plain|harder [--provider anthropic|openai|openrouter] \
//     [--questions <paraphrased fixture>] [--names <names.json>] [--budget 0.10] --output out.json

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    core: { type: "string" },
    store: { type: "string" },
    fixture: { type: "string" },
    questions: { type: "string" },
    names: { type: "string" },
    set: { type: "string" },
    ids: { type: "string" },
    arm: { type: "string" },
    provider: { type: "string", default: "anthropic" },
    budget: { type: "string", default: "0.10" },
    output: { type: "string" },
  },
})
for (const name of ["core", "store", "fixture", "set", "ids", "arm", "output"])
  if (!values[name]) throw new Error(`--${name} is required`)

const services = await import(pathToFileURL(join(values.core, "dist/services/index.js")).href)
const { openStore } = await import(pathToFileURL(join(values.core, "dist/store/index.js")).href)
const { searchAll, searchStore, meaningLane, writeHarderSetting } = services

const root = values.store
const home = join(root, "home")
const env = {
  PATH: process.env.PATH,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_STATE_HOME: join(home, ".local/state"),
  XDG_DATA_HOME: join(home, ".local/share"),
  XDG_CACHE_HOME: join(home, ".cache"),
  MEMO_CONFIG_DIR: join(root, "memo-config"),
  MEMO_STATE_DIR: join(root, "memo-state"),
  MEMO_CACHE_DIR: join(root, "memo-cache"),
  WIRECAT_STATE_DIR: join(root, "wirecat-state"),
  WIRECAT_CONFIG_DIR: join(root, "wirecat-config"),
  MEMO_EMBEDDING_MODEL: "embeddinggemma",
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
  TZ: "UTC",
}

const corpus = readFileSync(join(values.fixture, "corpus.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
const indexOf = new Map(corpus.map((record, i) => [record.id, i]))
const asked = JSON.parse(readFileSync(join(values.questions ?? values.fixture, "queries.json"), "utf8"))
const oracle = new Map(
  JSON.parse(readFileSync(join(values.fixture, "oracle.json"), "utf8")).map((row) => [row.id, row]),
)
const wanted = JSON.parse(readFileSync(values.ids, "utf8"))[values.set]
// v3 keeps its questions in queries.json, LifeBench in oracle.json.
const text = new Map(asked.map((q) => [q.id, q]))
const questions = wanted.map((id) => {
  const q = text.get(id) ?? oracle.get(id)
  return {
    id,
    question: q.question,
    asOf: q.as_of,
    gold: new Set(oracle.get(id).required_citations.map((c) => indexOf.get(c))),
  }
})

// How a hit maps back to its record, as memo_baseline and memo_clean wrote the store: a mail by the message number in
// its ref, a note by its title. v3's titles are in names.json (title -> record id); LifeBench's are each record's
// title made unique in corpus order.
const MESSAGE_BASE = 1_000_000_000_000_000n
const nameOf = (i) => `r${String(i + 1).padStart(4, "0")}`
const byTitle = new Map()
if (values.names) {
  for (const [title, id] of Object.entries(JSON.parse(readFileSync(values.names, "utf8"))))
    if (indexOf.has(id)) byTitle.set(title, indexOf.get(id))
} else {
  const taken = new Set()
  corpus.forEach((record, i) => {
    if (record.kind === "mail") return
    const base =
      (record.title || nameOf(i))
        .replace(/[\\/:*?"<>|\n]+/g, " ")
        .trim()
        .slice(0, 120) || "untitled"
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base} (${n})`
    taken.add(name)
    byTitle.set(name, i)
  })
}
const hitIndex = (item) =>
  item.kind === "mail" ? Number(BigInt(item.ref.split("/").at(-1)) - MESSAGE_BASE) : byTitle.get(item.title)

// Each arm calls one provider and model for both the rewrite and the rerank. OpenRouter's price is not in cli-core's
// table, so its tokens are counted from the answers here, at the price its model list gave on 9 November 2026.
const PROVIDERS = {
  anthropic: { setting: { provider: "anthropic", model: "claude-haiku-5-5" }, keyring: ["cli-memo", "anthropic"] },
  openai: { setting: { provider: "openai", model: "gpt-4o-mini" }, keyring: ["openai", "default"] },
  openrouter: {
    setting: { provider: "openai", model: "deepseek/deepseek-chat", base_url: "https://openrouter.ai/api/v1" },
    keyring: ["openrouter", "AIX125"],
    price: { input: 0.32e-6, output: 0.89e-6 },
  },
}
const chosen = PROVIDERS[values.provider]
if (!chosen) throw new Error(`--provider is one of ${Object.keys(PROVIDERS).join(", ")}`)
let key
let counted = 0
const counting = async (input, init) => {
  const response = await fetch(input, init)
  if (chosen.price && response.ok) {
    const { usage } = await response.clone().json()
    counted += (usage?.prompt_tokens ?? 0) * chosen.price.input + (usage?.completion_tokens ?? 0) * chosen.price.output
  }
  return response
}
if (values.arm === "harder") {
  try {
    key = execFileSync("secret-tool", ["lookup", "service", chosen.keyring[0], "account", chosen.keyring[1]], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim()
  } catch {}
  if (!key) throw new Error(`no ${values.provider} key in the keyring; nothing was sent`)
  writeHarderSetting(env, { ...chosen.setting, consented_at: new Date().toISOString() })
} else writeHarderSetting(env, undefined)

const APP = { command: "memo", appName: "cli-memo", envPrefix: "MEMO", description: "", messenger: false, version: "0" }
const MEMO = { provider: "notes", account: "internal" }
const messenger = { app: { ...APP, command: "tg" }, hintCommand: "memo" }
const store = await openStore({ env })
const budget = Number(values.budget)
let spent = 0
const rows = []
try {
  for (const q of questions) {
    if (spent > budget) break
    const started = performance.now()
    const found = await searchAll(
      store,
      MEMO,
      {
        text: q.question,
        limit: 10,
        env,
        now: Date.parse(q.asOf),
        timezone: "UTC",
        ...(values.arm === "harder" ? { harder: { app: APP, key: () => key, fetch: counting } } : {}),
      },
      messenger,
      (query) => searchStore(store, MEMO, query, messenger),
      meaningLane({ env, store: async () => store, messenger: { app: { command: "memo" } } }),
    )
    const ms = Math.round(performance.now() - started)
    const cost = chosen.price ? counted : (found.harder?.cost_usd ?? 0)
    counted = 0
    const top = found.items.slice(0, 10).map(hitIndex)
    const hits = top.filter((i) => q.gold.has(i)).length
    spent += cost
    rows.push({
      id: q.id,
      recall: hits / q.gold.size,
      hit: hits > 0 ? 1 : 0,
      top,
      unmapped: top.filter((i) => i === undefined || Number.isNaN(i)).length,
      ms,
      by: { notes: found.notes?.by ?? null, mail: found.mail?.by ?? null, messages: found.messages?.by ?? null },
      meaning_skipped: [found.notes?.meaningSkipped, found.mail?.meaningSkipped, found.messages?.meaningSkipped].filter(
        Boolean,
      ),
      harder: found.harder ?? null,
    })
  }
} finally {
  await store.close()
}

const mean = (pick) => Math.round((rows.reduce((sum, row) => sum + pick(row), 0) / rows.length) * 1000) / 1000
const sorted = (list) => [...list].sort((a, b) => a - b)
const ms = sorted(rows.map((row) => row.ms))
const summary = {
  set: values.set,
  arm: values.arm,
  provider: values.arm === "harder" ? values.provider : null,
  core: values.core,
  questions: rows.length,
  of: questions.length,
  recall_at_10: mean((r) => r.recall),
  hit_at_10: mean((r) => r.hit),
  ms_median: ms[Math.floor(ms.length / 2)],
  ms_max: ms.at(-1),
  cost_usd: Math.round(spent * 1e6) / 1e6,
  unmapped_hits: rows.reduce((sum, row) => sum + row.unmapped, 0),
  rerank_applied: rows.filter((row) => row.harder?.applied).length,
  rewrite_applied: rows.filter((row) => row.harder?.rewrite?.applied).length,
  fallbacks: rows.flatMap((row) =>
    [row.harder?.applied === false && row.harder.reason_id, row.harder?.rewrite?.reason_id].filter(Boolean),
  ),
}
writeFileSync(values.output, `${JSON.stringify({ summary, rows }, null, 1)}\n`)
process.stdout.write(`${JSON.stringify(summary)}\n`)
