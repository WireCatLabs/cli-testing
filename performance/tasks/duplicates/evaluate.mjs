// Usage: node evaluate.mjs [--certain plan|none] [tasks.jsonl]
// Runs the duplicate chain of cli-core's tasks plan over the synthetic set, tunes the weights on one half and
// reports both halves.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import {
  amountOf,
  analyze,
  CORE_INTEGRITY,
  CORE_VERSION,
  DAY,
  dueOf,
  jaccard,
  joinDigitGroups,
  normalize,
  trigrams,
} from "./chain.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const SPLIT_SEED = "tasks-duplicates-1"
const args = process.argv.slice(2)
const flag = args.indexOf("--certain")
const variant = flag >= 0 ? args.splice(flag, 2)[1] : "plan"
if (!["plan", "none"].includes(variant)) throw new Error(`--certain takes plan or none, not ${variant}`)

const START_WEIGHTS = {
  text: { high: 4, middle: 2, low: -2 },
  person: { same: 3, different: -3, unknown: 0 },
  amount: { equal: 3, different: -4, missing: 0 },
  category: { same: 1, different: -1 },
  due: { near: 1, far: -1, missing: 0 },
  reply: { yes: 6, no: 0 },
  time: { "0-3": 1, "4-14": 0, "15+": -1 },
}
const START_BANDS = { same: 8, maybe: 3 }

const levelsOf = (a, b) => {
  const text = Math.max(jaccard(a.stems, b.stems), jaccard(a.trigrams, b.trigrams))
  const days = Math.abs(a.created - b.created) / DAY
  return {
    text: text >= 0.6 ? "high" : text >= 0.3 ? "middle" : "low",
    person: a.person && b.person ? (a.person === b.person ? "same" : "different") : "unknown",
    amount:
      a.amount && b.amount
        ? a.amount.value === b.amount.value &&
          (a.amount.currency === b.amount.currency || !a.amount.currency || !b.amount.currency)
          ? "equal"
          : "different"
        : "missing",
    category: a.category === b.category ? "same" : "different",
    due: a.due !== null && b.due !== null ? (Math.abs(a.due - b.due) <= 2 ? "near" : "far") : "missing",
    reply: replyLinked(a, b) ? "yes" : "no",
    time: days <= 3 ? "0-3" : days <= 14 ? "4-14" : "15+",
  }
}
const scoreOf = (levels, weights) =>
  Object.entries(levels).reduce((sum, [field, level]) => sum + weights[field][level], 0)
const bandOf = (score, bands) => (score >= bands.same ? "same" : score >= bands.maybe ? "maybe" : "different")

const parentOf = new Map()
const ancestors = (message) => {
  const chain = []
  for (let at = parentOf.get(message); at; at = parentOf.get(at)) chain.push(at)
  return chain
}
const replyLinked = (a, b) =>
  ancestors(a.message).some((m) => b.messages.has(m)) || [...b.messages].some((m) => ancestors(m).includes(a.message))

const hash = (text) => createHash("sha256").update(text).digest().readUInt8(0)
const halfOf = (scenario) => (hash(`${SPLIT_SEED}:${scenario}`) % 2 === 0 ? "A" : "B")

const tasks = readFileSync(args[0] ?? join(here, "tasks.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
  .sort((a, b) => a.created_at.localeCompare(b.created_at))

const db = new DatabaseSync(":memory:")
db.exec(`CREATE TABLE tasks (id INTEGER PRIMARY KEY, person TEXT, category TEXT, created INTEGER, closed INTEGER);
CREATE INDEX tasks_person ON tasks (person, created); CREATE INDEX tasks_category ON tasks (category, created);
CREATE VIRTUAL TABLE task_stems USING fts5(stems);`)
const ACTIVE = "(t.closed IS NULL OR t.closed >= :since)"
const byStems = db.prepare(
  `SELECT s.rowid AS id FROM task_stems s JOIN tasks t ON t.id = s.rowid WHERE task_stems MATCH :query AND ${ACTIVE} ORDER BY bm25(task_stems) LIMIT 20`,
)
const byPerson = db.prepare(`SELECT id FROM tasks t WHERE person = :value AND ${ACTIVE} ORDER BY created DESC LIMIT 10`)
const byCategory = db.prepare(
  `SELECT id FROM tasks t WHERE category = :value AND ${ACTIVE} ORDER BY created DESC LIMIT 10`,
)
const insertTask = db.prepare("INSERT INTO tasks (id, person, category, created, closed) VALUES (?, ?, ?, ?, ?)")
const insertStems = db.prepare("INSERT INTO task_stems (rowid, stems) VALUES (?, ?)")

const records = []
const linked = new Map()
const titleKeys = new Map()
const arrivals = []
const pairs = []
const extraction = {
  amount: { right: 0, wrong: 0, missed: 0, extra: 0 },
  due: { right: 0, wrong: 0, missed: 0, extra: 0 },
}
const countExtraction = (bucket, got, want, same) => {
  if (got === null && want === null) return
  if (got === null) bucket.missed++
  else if (want === null) bucket.extra++
  else if (same) bucket.right++
  else bucket.wrong++
}

const started = performance.now()
for (const task of tasks) {
  const t0 = performance.now()
  const created = Date.parse(task.created_at)
  const text = `${task.title}\n${task.description}`
  const { stems } = analyze(text)
  const title = normalize(joinDigitGroups(task.title))
  const signatureText = normalize(joinDigitGroups(`${task.description}\n${task.title}`))
  const item = {
    task,
    created,
    closed: task.closed_at ? Date.parse(task.closed_at) : null,
    person: task.person,
    category: task.category,
    stems,
    trigrams: trigrams(title),
    amount: amountOf(signatureText),
    due: dueOf(signatureText, created),
    message: task.source_message,
    messages: new Set([task.source_message]),
  }
  parentOf.set(task.source_message, task.reply_to)
  const wantDue = task.due ? Math.floor(Date.parse(task.due) / DAY) : null
  countExtraction(
    extraction.amount,
    item.amount,
    task.amount === null ? null : task.amount,
    item.amount?.value === task.amount && (item.amount?.currency ?? null) === task.currency,
  )
  countExtraction(extraction.due, item.due, wantDue, item.due === wantDue)

  const open = (record) => record.closed === null || record.closed > created
  const earlierInGroup = records.filter((record) => record.task.group === task.group)
  const arrival = {
    id: task.id,
    group: task.group,
    subtype: task.subtype,
    half: halfOf(task.scenario),
    hasDuplicate: earlierInGroup.length > 0,
    positives: earlierInGroup.map((record) => record.task.id),
  }
  arrivals.push(arrival)

  const parent = task.reply_to && linked.get(task.reply_to)
  const titleKey = task.person ? `${task.person}\u0000${title}` : null
  const certain =
    variant === "none"
      ? null
      : parent && open(parent)
        ? { rule: "reply", target: parent }
        : titleKey && titleKeys.get(titleKey) && open(titleKeys.get(titleKey))
          ? { rule: "title+person", target: titleKeys.get(titleKey) }
          : null
  if (certain) {
    certain.target.messages.add(task.source_message)
    linked.set(task.source_message, certain.target)
    arrival.certain = {
      rule: certain.rule,
      target: certain.target.task.id,
      correct: certain.target.task.group === task.group,
    }
    arrival.ms = performance.now() - t0
    continue
  }

  const since = created - 14 * DAY
  const found = new Map()
  const add = (id, source) => {
    const sources = found.get(id) ?? new Set()
    sources.add(source)
    found.set(id, sources)
  }
  if (stems.size) {
    const query = [...stems].map((stem) => `"${stem.replaceAll('"', '""')}"`).join(" OR ")
    for (const row of byStems.all({ query, since })) add(Number(row.id), "words")
  }
  if (task.person) for (const row of byPerson.all({ value: task.person, since })) add(Number(row.id), "person")
  for (const row of byCategory.all({ value: task.category, since })) add(Number(row.id), "category")
  for (const message of ancestors(task.source_message)) {
    const record = linked.get(message)
    if (record && (record.closed === null || record.closed >= since)) add(record.index, "reply")
  }

  arrival.candidates = found.size
  for (const [index, sources] of found) {
    const record = records[index]
    const levels = levelsOf(item, record)
    pairs.push({
      arrival: task.id,
      candidate: record.task.id,
      half: arrival.half,
      duplicate: record.task.group === task.group,
      sources: [...sources],
      levels,
    })
  }
  arrival.missed = arrival.positives.filter((id) => !pairs.some((p) => p.arrival === task.id && p.candidate === id))

  item.index = records.length
  records.push(item)
  linked.set(task.source_message, item)
  if (titleKey) titleKeys.set(titleKey, item)
  insertTask.run(item.index, task.person, task.category, created, item.closed)
  insertStems.run(item.index, [...stems].join(" "))
  arrival.ms = performance.now() - t0
}
const totalMs = performance.now() - started

const evaluate = (half, weights, bands) => {
  const inHalf = (x) => half === "all" || x.half === half
  const scored = pairs.filter(inHalf).map((pair) => {
    const score = scoreOf(pair.levels, weights)
    return { ...pair, score, band: bandOf(score, bands) }
  })
  const positives = arrivals.filter((a) => inHalf(a) && !a.certain).reduce((n, a) => n + a.positives.length, 0)
  const bandCounts = Object.fromEntries(
    ["same", "maybe", "different"].map((band) => [
      band,
      {
        true: scored.filter((p) => p.band === band && p.duplicate).length,
        false: scored.filter((p) => p.band === band && !p.duplicate).length,
      },
    ]),
  )
  const notCandidates = arrivals.filter((a) => inHalf(a) && !a.certain).reduce((n, a) => n + a.missed.length, 0)
  const ratio = (a, b) => (b ? a / b : null)
  const sameTrue = bandCounts.same.true
  const eitherTrue = sameTrue + bandCounts.maybe.true
  const eitherAll = eitherTrue + bandCounts.same.false + bandCounts.maybe.false
  const tasksOut = { duplicateTop: {}, freshTop: {} }
  for (const arrival of arrivals.filter((a) => inHalf(a) && !a.certain)) {
    const mine = scored.filter((p) => p.arrival === arrival.id).sort((a, b) => b.score - a.score)
    const top = mine[0]
    const key = !top
      ? "no candidate"
      : arrival.hasDuplicate
        ? `${top.band} ${top.duplicate ? "right" : "wrong task"}`
        : top.band
    const bucket = arrival.hasDuplicate ? tasksOut.duplicateTop : tasksOut.freshTop
    bucket[key] = (bucket[key] ?? 0) + 1
  }
  return {
    pairs: scored.length,
    positives,
    notCandidates,
    bands: bandCounts,
    same: { precision: ratio(sameTrue, sameTrue + bandCounts.same.false), recall: ratio(sameTrue, positives) },
    sameOrMaybe: { precision: ratio(eitherTrue, eitherAll), recall: ratio(eitherTrue, positives) },
    tasks: tasksOut,
    scored,
  }
}

const FIELDS = Object.keys(START_WEIGHTS)
const estimate = (half) => {
  const train = pairs.filter((p) => half === "all" || p.half === half)
  const duplicates = train.filter((p) => p.duplicate)
  const others = train.filter((p) => !p.duplicate)
  const weights = {}
  const counts = {}
  for (const field of FIELDS) {
    const levels = Object.keys(START_WEIGHTS[field])
    weights[field] = {}
    counts[field] = {}
    for (const level of levels) {
      const m =
        (duplicates.filter((p) => p.levels[field] === level).length + 0.5) / (duplicates.length + 0.5 * levels.length)
      const u = (others.filter((p) => p.levels[field] === level).length + 0.5) / (others.length + 0.5 * levels.length)
      weights[field][level] = Math.log2(m / u)
      counts[field][level] = {
        duplicates: duplicates.filter((p) => p.levels[field] === level).length,
        others: others.filter((p) => p.levels[field] === level).length,
      }
    }
  }
  return { weights, counts, duplicates: duplicates.length, others: others.length }
}
const rounded = (weights) =>
  Object.fromEntries(
    Object.entries(weights).map(([field, levels]) => [
      field,
      Object.fromEntries(Object.entries(levels).map(([level, w]) => [level, Math.round(w) + 0])),
    ]),
  )

// Same: the lowest threshold with no wrong merge on the tuning half. Maybe: the highest threshold that still
// reaches 90% of the duplicates the candidates hold there.
const pickBands = (half, weights) => {
  const { scored, positives, notCandidates } = evaluate(half, weights, { same: Infinity, maybe: Infinity })
  const worst = Math.max(...scored.filter((p) => !p.duplicate).map((p) => p.score))
  const above = scored.filter((p) => p.duplicate && p.score > worst).map((p) => p.score)
  const same = above.length ? Math.min(...above) : worst + 1
  const reachable = positives - notCandidates
  const trueScores = scored
    .filter((p) => p.duplicate)
    .map((p) => p.score)
    .sort((a, b) => b - a)
  const maybe = trueScores[Math.max(0, Math.ceil(0.9 * reachable) - 1)] ?? same
  return { same, maybe: Math.min(maybe, same) }
}

const tuned = { A: estimate("A"), B: estimate("B"), all: estimate("all") }
const proposed = rounded(tuned.all.weights)
// A level no duplicate showed gets its weight from a zero count plus smoothing — the set's authoring, not evidence.
const recommended = Object.fromEntries(
  FIELDS.map((field) => [
    field,
    Object.fromEntries(
      Object.entries(proposed[field]).map(([level, w]) => [
        level,
        tuned.all.counts[field][level].duplicates === 0 ? START_WEIGHTS[field][level] : w,
      ]),
    ),
  ]),
)
const fromA = rounded(tuned.A.weights)
const fromB = rounded(tuned.B.weights)
const configs = {
  "start weights, plan bands": { weights: START_WEIGHTS, bands: START_BANDS },
  "start weights, bands picked on A": { weights: START_WEIGHTS, bands: pickBands("A", START_WEIGHTS) },
  "estimated on A, bands picked on A": { weights: fromA, bands: pickBands("A", fromA) },
  "estimated on B, bands picked on B": { weights: fromB, bands: pickBands("B", fromB) },
  "estimated on all, bands picked on all (in-sample)": { weights: proposed, bands: pickBands("all", proposed) },
}
const PROPOSED = "estimated on all, bands picked on all (in-sample)"
const RECOMMENDED = "recommended: estimated on all, plan weights where no duplicate showed the level"
configs[RECOMMENDED] = { weights: recommended, bands: pickBands("all", recommended) }

const bySubtype = (weights, bands) => {
  const scored = pairs.map((p) => ({
    ...p,
    band: bandOf(scoreOf(p.levels, weights), bands),
    score: scoreOf(p.levels, weights),
  }))
  const table = {}
  for (const arrival of arrivals) {
    table[arrival.subtype] ??= {}
    const row = table[arrival.subtype]
    let key
    if (arrival.certain) key = `certain ${arrival.certain.correct ? "right" : "wrong"}`
    else {
      const top = scored.filter((p) => p.arrival === arrival.id).sort((a, b) => b.score - a.score)[0]
      if (!arrival.hasDuplicate) key = `${top?.band ?? "different"} (new task)`
      else if (arrival.missed.length === arrival.positives.length) key = "not a candidate"
      else key = `${top.band} ${top.duplicate ? "right" : "wrong task"}`
    }
    row[key] = (row[key] ?? 0) + 1
  }
  return table
}

const sweep = (weights) => {
  const scored = pairs.map((p) => ({ ...p, score: scoreOf(p.levels, weights) }))
  const positives = arrivals.filter((a) => !a.certain).reduce((n, a) => n + a.positives.length, 0)
  const fresh = arrivals.filter((a) => !a.certain && !a.hasDuplicate)
  const topOf = new Map()
  for (const pair of scored) topOf.set(pair.arrival, Math.max(topOf.get(pair.arrival) ?? -Infinity, pair.score))
  const rows = []
  for (let threshold = 2; threshold <= 22; threshold++) {
    const above = scored.filter((p) => p.score >= threshold)
    const hits = above.filter((p) => p.duplicate).length
    rows.push({
      threshold,
      true: hits,
      false: above.length - hits,
      precision: above.length ? hits / above.length : null,
      recall: hits / positives,
      newTasksFlagged: fresh.filter((a) => (topOf.get(a.id) ?? -Infinity) >= threshold).length,
      newTasks: fresh.length,
    })
  }
  return rows
}

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}
const candidateSizes = arrivals.filter((a) => !a.certain).map((a) => a.candidates)
const times = arrivals.map((a) => a.ms)
const certain = arrivals.filter((a) => a.certain)
const foundBy = {}
for (const pair of pairs.filter((p) => p.duplicate)) {
  const key = pair.sources.sort().join("+")
  foundBy[key] = (foundBy[key] ?? 0) + 1
}

const results = {
  generated: new Date().toISOString().slice(0, 10),
  environment: {
    node: process.version,
    sqlite: db.prepare("SELECT sqlite_version() AS v").get().v,
    cliCore: CORE_VERSION,
    cliCoreIntegrity: CORE_INTEGRITY,
    snowball: "3.1.1 (vendored in cli-core dist/search/snowball)",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    splitSeed: SPLIT_SEED,
  },
  data: {
    tasks: tasks.length,
    groups: new Set(tasks.map((t) => t.group)).size,
    duplicatePairs: arrivals.reduce((n, a) => n + a.positives.length, 0),
    halves: Object.fromEntries(
      ["A", "B"].map((half) => [
        half,
        {
          scenarios: new Set(tasks.filter((t) => halfOf(t.scenario) === half).map((t) => t.scenario)).size,
          tasks: tasks.filter((t) => halfOf(t.scenario) === half).length,
          duplicatePairs: arrivals.filter((a) => a.half === half).reduce((n, a) => n + a.positives.length, 0),
        },
      ]),
    ),
  },
  extraction,
  certain: {
    total: certain.length,
    right: certain.filter((a) => a.certain.correct).length,
    wrong: certain
      .filter((a) => !a.certain.correct)
      .map((a) => ({ arrival: a.id, subtype: a.subtype, rule: a.certain.rule, target: a.certain.target })),
    byRule: Object.fromEntries(
      ["reply", "title+person"].map((rule) => [
        rule,
        {
          right: certain.filter((a) => a.certain.rule === rule && a.certain.correct).length,
          wrong: certain.filter((a) => a.certain.rule === rule && !a.certain.correct).length,
        },
      ]),
    ),
  },
  candidates: {
    arrivals: candidateSizes.length,
    median: quantile(candidateSizes, 0.5),
    p95: quantile(candidateSizes, 0.95),
    max: Math.max(...candidateSizes),
    duplicatesFoundBy: foundBy,
  },
  runtime: {
    totalMs: Number(totalMs.toFixed(1)),
    perTaskMedianMs: Number(quantile(times, 0.5).toFixed(3)),
    perTaskP95Ms: Number(quantile(times, 0.95).toFixed(3)),
    perTaskMaxMs: Number(Math.max(...times).toFixed(3)),
  },
  certainRules: variant === "plan" ? ["reply to a linked message", "same title and person"] : [],
  tuning: Object.fromEntries(
    Object.entries(tuned).map(([half, t]) => [
      half,
      { duplicatePairs: t.duplicates, otherPairs: t.others, counts: t.counts, weights: t.weights },
    ]),
  ),
  weights: { start: START_WEIGHTS, fromA, fromB, proposed, recommended },
  configs: Object.fromEntries(
    Object.entries(configs).map(([name, { weights, bands }]) => {
      const strip = ({ scored, ...rest }) => rest
      return [
        name,
        {
          bands,
          A: strip(evaluate("A", weights, bands)),
          B: strip(evaluate("B", weights, bands)),
          all: strip(evaluate("all", weights, bands)),
        },
      ]
    }),
  ),
  subtypes: {
    "start weights, plan bands": bySubtype(START_WEIGHTS, START_BANDS),
    [PROPOSED]: bySubtype(proposed, configs[PROPOSED].bands),
    [RECOMMENDED]: bySubtype(recommended, configs[RECOMMENDED].bands),
  },
  sweep: { start: sweep(START_WEIGHTS), proposed: sweep(proposed), recommended: sweep(recommended) },
  falseSame: Object.fromEntries(
    Object.entries(configs).map(([name, { weights, bands }]) => [
      name,
      evaluate("all", weights, bands)
        .scored.filter((p) => p.band === "same" && !p.duplicate)
        .map((p) => ({
          arrival: p.arrival,
          candidate: p.candidate,
          half: p.half,
          score: Number(p.score.toFixed(2)),
          levels: p.levels,
        })),
    ]),
  ),
}
writeFileSync(join(here, `results-${variant}.json`), `${JSON.stringify(results, null, 2)}\n`)

const pct = (x) => (x === null ? "—" : `${(100 * x).toFixed(0)}%`)
const lines = []
lines.push(`certain rules: ${variant}`)
lines.push(
  `tasks ${results.data.tasks}, duplicate pairs ${results.data.duplicatePairs}; halves ${JSON.stringify(results.data.halves)}`,
)
lines.push(`certain: ${JSON.stringify(results.certain.byRule)}`)
lines.push(
  `candidates: median ${results.candidates.median}, p95 ${results.candidates.p95}, max ${results.candidates.max}`,
)
lines.push(`runtime: ${JSON.stringify(results.runtime)}`)
lines.push(`extraction: ${JSON.stringify(extraction)}`)
lines.push("")
lines.push(
  "| config | half | same ≥ | maybe ≥ | same true/false | maybe true/false | different true/false | not candidates | P same | R same | P same+maybe | R same+maybe |",
)
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|")
for (const [name, config] of Object.entries(results.configs))
  for (const half of name === PROPOSED || name === RECOMMENDED ? ["A", "B", "all"] : ["A", "B"]) {
    const r = config[half]
    const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1))
    lines.push(
      `| ${name} | ${half} | ${fmt(config.bands.same)} | ${fmt(config.bands.maybe)} | ${r.bands.same.true}/${r.bands.same.false} | ${r.bands.maybe.true}/${r.bands.maybe.false} | ${r.bands.different.true}/${r.bands.different.false} | ${r.notCandidates} | ${pct(r.same.precision)} | ${pct(r.same.recall)} | ${pct(r.sameOrMaybe.precision)} | ${pct(r.sameOrMaybe.recall)} |`,
    )
  }
lines.push("")
lines.push("")
const SWEPT = ["start", "proposed", "recommended"]
lines.push(`| ≥ | ${SWEPT.map((name) => `${name} true/false | P | R | new tasks flagged`).join(" | ")} |`)
lines.push(`|---|${SWEPT.map(() => "---|---|---|---|").join("")}`)
results.sweep.start.forEach((row, i) => {
  const cells = SWEPT.map((name) => {
    const r = results.sweep[name][i]
    return `${r.true}/${r.false} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.newTasksFlagged}/${r.newTasks}`
  })
  lines.push(`| ${row.threshold} | ${cells.join(" | ")} |`)
})
lines.push("")
for (const [name, weights] of Object.entries(results.weights)) lines.push(`${name}: ${JSON.stringify(weights)}`)
for (const [name, config] of Object.entries(results.configs))
  lines.push(`${name} — tasks, all halves: ${JSON.stringify(config.all.tasks)}`)
process.stdout.write(`${lines.join("\n")}\n`)
