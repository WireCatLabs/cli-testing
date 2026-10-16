// Usage: node linked.mjs [tasks.jsonl]
// Replays the set through cli-core's shipped duplicate check with an agent that answers every refusal right, once
// with the comparison reading only a task's own text and once reading the messages linked to it too, and runs the
// check again each time a message is linked. Writes results-linked.json.
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

// cli-core src/search/task-similarity.ts, TASK_SIMILARITY_WEIGHTS and TASK_SIMILARITY_BANDS.
const WEIGHTS = {
  text: { high: 5, middle: 5, low: -2 },
  person: { same: 1, different: -3, unknown: 0 },
  amount: { equal: 6, different: -4, missing: 0 },
  category: { same: 1, different: -1 },
  due: { near: 4, far: -1, missing: 0 },
  reply: { yes: 6, no: 0 },
  time: { near: 2, weeks: -2, far: -3 },
}
const BANDS = { likely: 10, maybe: 5 }
// cli-core src/store/sqlite/task-candidates.ts, LINKED_MESSAGES.
const LINKED_MESSAGES = 5

const tasks = readFileSync(process.argv[2] ?? join(here, "tasks.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
  .sort((a, b) => a.created_at.localeCompare(b.created_at))

const parentOf = new Map(tasks.map((task) => [task.source_message, task.reply_to]))
const childrenOf = new Map()
for (const task of tasks)
  if (task.reply_to) childrenOf.set(task.reply_to, [...(childrenOf.get(task.reply_to) ?? []), task.source_message])

/** A message, the messages it replies to and the replies to it, as cli-core's replyChain reads one chat. */
const chainOf = (messages) => {
  const chain = new Set()
  for (const message of messages) {
    for (let at = message; at; at = parentOf.get(at)) chain.add(at)
    const down = [message]
    while (down.length) {
      const at = down.pop()
      chain.add(at)
      down.push(...(childrenOf.get(at) ?? []))
    }
  }
  return chain
}

const baseView = (task) => {
  const created = Date.parse(task.created_at)
  const signature = normalize(joinDigitGroups(`${task.description}\n${task.title}`))
  return {
    stems: analyze(`${task.title}\n${task.description}`).stems,
    trigrams: trigrams(normalize(joinDigitGroups(task.title))),
    person: task.person,
    category: task.category,
    amount: amountOf(signature),
    due: dueOf(signature, created),
    created,
  }
}

/** The task's text with one linked message: its own amount and due first, the message's read from when it was sent. */
const linkedView = (task, base, message) => {
  const text = normalize(joinDigitGroups(message.text))
  return {
    ...base,
    stems: analyze(`${task.title}\n${task.description}\n${message.text}`).stems,
    person: message.person ?? base.person,
    amount: base.amount ?? amountOf(text),
    due: base.due ?? dueOf(text, message.sent),
  }
}

const levelsOf = (a, b, reply) => {
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
    reply: reply ? "yes" : "no",
    time: days <= 3 ? "near" : days <= 14 ? "weeks" : "far",
  }
}
const scoreOf = (levels) => Object.entries(levels).reduce((sum, [field, level]) => sum + WEIGHTS[field][level], 0)

const replay = ({ read, agent }) => {
  const db = new DatabaseSync(":memory:")
  db.exec(`CREATE TABLE tasks (id INTEGER PRIMARY KEY, person TEXT, category TEXT, created INTEGER, closed INTEGER);
CREATE VIRTUAL TABLE task_stems USING fts5(stems);`)
  const ACTIVE = "(t.closed IS NULL OR t.closed >= :since)"
  const byStems = db.prepare(
    `SELECT s.rowid AS id FROM task_stems s JOIN tasks t ON t.id = s.rowid WHERE task_stems MATCH :query AND ${ACTIVE} ORDER BY bm25(task_stems) LIMIT 20`,
  )
  const byField = (column) =>
    db.prepare(`SELECT id FROM tasks t WHERE ${column} = :value AND ${ACTIVE} ORDER BY created DESC LIMIT 10`)
  const byPerson = byField("person")
  const byCategory = byField("category")
  const insertTask = db.prepare("INSERT INTO tasks (id, person, category, created, closed) VALUES (?, ?, ?, ?, ?)")
  const insertStems = db.prepare("INSERT INTO task_stems (rowid, stems) VALUES (?, ?)")

  const records = []
  const owner = new Map()
  const viewsOf = (record) =>
    read
      ? [record.base, ...record.linked.map((message) => linkedView(record.task, record.base, message))]
      : [record.base]
  const messagesOf = (record) =>
    read ? [record.task.source_message, ...record.linked.map((m) => m.message)] : [record.task.source_message]

  /** The candidates of a subject at `now`, each scored on its best pair of views, best first. */
  const candidates = (subject, now, skip) => {
    const since = now - 14 * DAY
    const found = new Set()
    const stems = new Set(subject.views.flatMap((view) => [...view.stems]))
    if (stems.size) {
      const query = [...stems].map((stem) => `"${stem.replaceAll('"', '""')}"`).join(" OR ")
      for (const row of byStems.all({ query, since })) found.add(Number(row.id))
    }
    const persons = new Set(subject.views.map((view) => view.person).filter(Boolean))
    // cli-core takes the newest 10 of any of the subject's people; a subject here has one or two.
    const personRows = [...persons].flatMap((value) => byPerson.all({ value, since }))
    for (const row of personRows.sort((a, b) => records[b.id].base.created - records[a.id].base.created).slice(0, 10))
      found.add(Number(row.id))
    for (const row of byCategory.all({ value: subject.category, since })) found.add(Number(row.id))
    const chain = chainOf(subject.messages)
    for (const message of chain) {
      const record = owner.get(message)
      if (record && (record.closed === null || record.closed >= since)) found.add(record.index)
    }
    found.delete(skip)
    return [...found]
      .map((index) => {
        const record = records[index]
        const reply = messagesOf(record).some((message) => chain.has(message))
        let best
        for (const a of subject.views)
          for (const b of viewsOf(record)) {
            const levels = levelsOf(a, b, reply)
            const score = scoreOf(levels)
            if (!best || score > best.score) best = { score, levels }
          }
        return { record, ...best }
      })
      .sort((a, b) => b.score - a.score)
  }

  const arrivals = []
  const pairs = []
  const linkPairs = []
  let flaggedBefore = 0
  const held = new Set()
  const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`)

  for (const task of tasks) {
    const created = Date.parse(task.created_at)
    const base = baseView(task)
    const stored = records.filter((record) => record.task.group === task.group)
    const scored = candidates(
      { views: [base], category: task.category, messages: [task.source_message] },
      created,
      undefined,
    )
    for (const one of scored)
      pairs.push({ arrival: task.id, duplicate: one.record.task.group === task.group, score: one.score })
    const flagged = scored.filter((one) => one.score >= BANDS.maybe)
    const target = agent ? flagged.find((one) => one.record.task.group === task.group)?.record : undefined
    arrivals.push({
      id: task.id,
      positives: stored.length,
      hasDuplicate: stored.length > 0,
      flagged: flagged.length > 0,
      attached: Boolean(target),
    })
    if (target) {
      target.linked = [
        { message: task.source_message, text: task.description, person: task.person, sent: created },
        ...target.linked,
      ].slice(0, LINKED_MESSAGES)
      if (read) owner.set(task.source_message, target)
      for (const one of candidates(
        { views: viewsOf(target), category: target.task.category, messages: messagesOf(target) },
        created,
        target.index,
      )) {
        if (one.score < BANDS.maybe) continue
        if (held.has(key(target.index, one.record.index))) {
          flaggedBefore += 1
          continue
        }
        held.add(key(target.index, one.record.index))
        linkPairs.push({
          task: target.task.id,
          other: one.record.task.id,
          duplicate: one.record.task.group === target.task.group,
          score: one.score,
          levels: one.levels,
        })
      }
      continue
    }
    const record = {
      task,
      base,
      linked: [],
      index: records.length,
      closed: task.closed_at ? Date.parse(task.closed_at) : null,
    }
    for (const one of flagged) held.add(key(record.index, one.record.index))
    records.push(record)
    owner.set(task.source_message, record)
    insertTask.run(record.index, task.person, task.category, created, record.closed)
    insertStems.run(record.index, [...base.stems].join(" "))
  }

  const positives = arrivals.reduce((n, a) => n + a.positives, 0)
  const at = (threshold) => {
    const above = pairs.filter((p) => p.score >= threshold)
    const hits = above.filter((p) => p.duplicate).length
    return {
      true: hits,
      false: above.length - hits,
      precision: above.length ? hits / above.length : null,
      recall: positives ? hits / positives : null,
    }
  }
  const linkAt = (threshold) => {
    const above = linkPairs.filter((p) => p.score >= threshold)
    return { true: above.filter((p) => p.duplicate).length, false: above.filter((p) => !p.duplicate).length }
  }
  const fresh = arrivals.filter((a) => !a.hasDuplicate)
  const withDuplicate = arrivals.filter((a) => a.hasDuplicate)
  const groups = new Map()
  for (const record of records) groups.set(record.task.group, (groups.get(record.task.group) ?? 0) + 1)
  return {
    positives,
    pairs: { maybe: at(BANDS.maybe), likely: at(BANDS.likely) },
    tasks: {
      withDuplicate: withDuplicate.length,
      duplicateFlagged: withDuplicate.filter((a) => a.flagged).length,
      attached: arrivals.filter((a) => a.attached).length,
      new: fresh.length,
      newRefused: fresh.filter((a) => a.flagged).length,
      stored: records.length,
      duplicatesStored: [...groups.values()].reduce((n, count) => n + count - 1, 0),
    },
    linkCheck: {
      pairs: linkPairs.length,
      flaggedBefore,
      maybe: linkAt(BANDS.maybe),
      likely: linkAt(BANDS.likely),
      wrong: linkPairs.filter((p) => !p.duplicate),
    },
  }
}

const runs = {
  "no agent (port check: matches results-none.json, recommended weights)": replay({ read: false, agent: false }),
  "agent, own text only (before)": replay({ read: false, agent: true }),
  "agent, linked messages read (after)": replay({ read: true, agent: true }),
}
writeFileSync(
  join(here, "results-linked.json"),
  `${JSON.stringify(
    {
      environment: {
        node: process.version,
        cliCore: CORE_VERSION,
        cliCoreIntegrity: CORE_INTEGRITY,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      weights: WEIGHTS,
      bands: BANDS,
      linkedMessages: LINKED_MESSAGES,
      runs,
    },
    null,
    2,
  )}\n`,
)

const pct = (x) => (x === null ? "—" : `${(100 * x).toFixed(0)}%`)
const lines = [
  "| run | ≥ 5 true/false | P | R | ≥ 10 true/false | P | R | duplicates flagged | attached | new refused | link check ≥ 5 true/false | ≥ 10 |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
]
for (const [name, r] of Object.entries(runs))
  lines.push(
    `| ${name} | ${r.pairs.maybe.true}/${r.pairs.maybe.false} | ${pct(r.pairs.maybe.precision)} | ${pct(r.pairs.maybe.recall)} | ` +
      `${r.pairs.likely.true}/${r.pairs.likely.false} | ${pct(r.pairs.likely.precision)} | ${pct(r.pairs.likely.recall)} | ` +
      `${r.tasks.duplicateFlagged}/${r.tasks.withDuplicate} | ${r.tasks.attached} | ${r.tasks.newRefused}/${r.tasks.new} | ` +
      `${r.linkCheck.maybe.true}/${r.linkCheck.maybe.false} | ${r.linkCheck.likely.true}/${r.linkCheck.likely.false} |`,
  )
process.stdout.write(`${lines.join("\n")}\n`)
