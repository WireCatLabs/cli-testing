// node features.mjs <cli-core dir> <in.json> <out.json> — per pair, every view combination's levels from cli-core's
// scorer, plus the raw text numbers, so other weights and rules can be tried without re-running the tool.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [core, input, output] = process.argv.slice(2)
const { prepareTask, compareTasks } = await import(join(core, "dist/search/task-similarity.js"))
const { normalize } = await import(join(core, "dist/store/normalize.js"))
const { tasks, pairs } = JSON.parse(readFileSync(input, "utf8"))
const byId = new Map(tasks.map((task) => [task.id, task]))

const viewsOf = (task) => {
  const base = {
    title: task.title,
    description: task.description ?? "",
    createdAt: new Date(task.sentMs),
    ...(task.person ? { person: task.person } : {}),
    ...(task.category ? { category: task.category } : {}),
  }
  const own = prepareTask(base)
  return task.message === undefined
    ? [own]
    : [own, prepareTask({ ...base, message: { text: task.message, sentAt: new Date(task.sentMs) } })]
}

const grams = (text) => {
  const set = new Set()
  for (let at = 0; at + 3 <= text.length; at++) set.add(text.slice(at, at + 3))
  return set
}
const jaccard = (a, b) => {
  let shared = 0
  for (const item of a) if (b.has(item)) shared++
  return a.size && b.size ? shared / (a.size + b.size - shared) : 0
}
// The agent opens every title with a verb ("Получить …", "Созвониться …"); trigrams of the rest only.
const restOf = (title) => normalize(title).split(/\s+/).slice(1).join(" ")

const out = pairs.map(({ a, b, ...rest }) => {
  const one = byId.get(a)
  const other = byId.get(b)
  const sameSource = one.messageId !== undefined && one.messageId === other.messageId
  const replyChain = !sameSource && other.messageId !== undefined && (one.chain ?? []).includes(other.messageId)
  const va = sameSource ? viewsOf(one).slice(0, 1) : viewsOf(one)
  const vb = sameSource ? viewsOf(other).slice(0, 1) : viewsOf(other)
  const combos = []
  for (const x of va)
    for (const y of vb) {
      const s = compareTasks(x, y, { replyChain })
      combos.push({ levels: s.levels, stems: s.text.stems, trigrams: s.text.trigrams })
    }
  return {
    a,
    b,
    ...rest,
    sameSource,
    dialog: one.chat !== undefined && one.chat === other.chat && one.dialog === true,
    trigramsRest: jaccard(grams(restOf(one.title)), grams(restOf(other.title))),
    combos,
  }
})
writeFileSync(output, `${JSON.stringify(out)}\n`, { mode: 0o600 })
