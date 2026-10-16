// Usage: node evaluate.mjs [--core <cli-core checkout with dist/>]
// Scores cli-core's rule category (old and new default lists) against labels on the duplicate set, then replays the
// duplicate check with each list's rule categories in place of the labelled ones. Writes results.json.
// With --core, also checks this port of categorize() against the real one on every task and both lists.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { CORE_VERSION, normalize } from "../duplicates/chain.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const duplicates = join(here, "..", "duplicates")
const snowball = join(duplicates, ".cache", `cli-core-${CORE_VERSION}`, "package", "dist", "search", "snowball")
const load = async (file) => (await import(pathToFileURL(join(snowball, file)).href)).default
const russian = new (await load("russian-stemmer.js"))()
const english = new (await load("english-stemmer.js"))()
const spanish = new (await load("spanish-stemmer.js"))()

const read = (file) => JSON.parse(readFileSync(join(here, file), "utf8"))
const lists = { old: read("old-defaults.json"), new: read("new-defaults.json") }
const labels = read("labels.json")
const tasks = readFileSync(join(duplicates, "tasks.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))

// cli-core stemTokens() with one Latin stemmer: a stemmer per script.
const TOKEN = /[\p{L}\p{N}\p{Co}\p{M}]+/gu
const MARKS = /\p{M}+/gu
const CYRILLIC = /^\p{Script=Cyrillic}+$/u
const LATIN = /^\p{Script=Latin}+$/u
const stemTokens = (latin) => (text) =>
  (text.normalize("NFC").toLowerCase().match(TOKEN) ?? [])
    .map((token) => {
      const word = token.normalize("NFC").toLowerCase().replace(MARKS, "")
      const engine = CYRILLIC.test(word) ? russian : LATIN.test(word) ? latin : null
      return normalize(engine?.stemWord(word) || word)
    })
    .filter(Boolean)
const englishStems = stemTokens(english)
const spanishStems = stemTokens(spanish)

// cli-core src/services/task-categories.ts categorize() (`spanishStems: false` is the version before the Spanish stems fix: English
// stems only, so a Spanish word was stemmed as English): every trigger meets the message's English stems; `es`
// triggers also meet its Spanish stems when the message reads as Spanish. Most distinct trigger stems hit wins, a tie
// goes to the earlier one, a word counts once (its English stem first).
const SPANISH_LETTERS = /[ñáéíóú¿¡]/u
const SPANISH_WORDS = new Set(
  "de del la las el los al lo que por para con una unos unas mi mis tu tus su sus nos hay tengo hola gracias".split(
    " ",
  ),
)
const readsSpanish = (text) =>
  SPANISH_LETTERS.test(text.toLowerCase()) ||
  (text.toLowerCase().match(/\p{L}+/gu) ?? []).some((word) => SPANISH_WORDS.has(word))

const categorizer = (list, { spanishStems: withSpanish = true } = {}) => {
  const stems = list.map(({ name, triggers }) => ({
    name,
    english: new Set(Object.values(triggers).flatMap((words) => words.flatMap(englishStems))),
    spanish: new Set(triggers.es.flatMap(spanishStems)),
  }))
  return (text) => {
    const words = englishStems(text)
    const other = withSpanish && readsSpanish(text) ? spanishStems(text) : []
    let best = { name: "other", hits: 0 }
    for (const { name, english: en, spanish: es } of stems) {
      const hit = new Set()
      words.forEach((word, at) => {
        if (en.has(word)) hit.add(word)
        else if (other[at] !== undefined && es.has(other[at])) hit.add(other[at])
      })
      if (hit.size > best.hits) best = { name, hits: hit.size }
    }
    return best.name
  }
}

const predicted = Object.fromEntries(
  Object.entries(lists).map(([name, list]) => {
    const categorize = categorizer(list)
    return [name, Object.fromEntries(tasks.map((task) => [task.id, categorize(task.description)]))]
  }),
)

// Synthetic Spanish messages, labelled by hand from the meanings before they were scored: the duplicate set has none.
const spanishSet = read("spanish.json")
const spanishRuns = Object.fromEntries(
  [
    ["English stems only (before)", false],
    ["Spanish stems too (after)", true],
  ].map(([name, withSpanish]) => {
    const categorize = categorizer(lists.new, { spanishStems: withSpanish })
    const picks = spanishSet.map(({ text }) => categorize(text))
    const right = spanishSet.filter(({ label }, at) => picks[at] === label).length
    const fellToOther = picks.filter((pick) => pick === "other").length
    return [name, { right, of: spanishSet.length, share: right / spanishSet.length, fellToOther, picks }]
  }),
)

const coreAt = process.argv.indexOf("--core")
let portCheck = "not run (pass --core <cli-core checkout>)"
if (coreAt > 0) {
  const core = resolve(process.argv[coreAt + 1])
  const { categorize } = await import(pathToFileURL(join(core, "dist", "services", "task-categories.js")).href)
  const differ = Object.entries(lists).flatMap(([name, list]) =>
    tasks.filter((task) => categorize(task.description, list) !== predicted[name][task.id]).map((task) => task.id),
  )
  const after = spanishRuns["Spanish stems too (after)"].picks
  differ.push(...spanishSet.filter(({ text }, at) => categorize(text, lists.new) !== after[at]).map(({ text }) => text))
  if (differ.length) throw new Error(`the port of categorize() differs from cli-core on ${differ.join(", ")}`)
  portCheck = `matches cli-core's categorize() on ${tasks.length} tasks × 2 lists and ${spanishSet.length} Spanish messages`
}

// The old seven, for the set's own labels: a new name maps to the old one that held its tasks.
const OLD_NAME = {
  bills: "money",
  taxes: "money",
  bank: "money",
  insurance: "money",
  legal: "documents",
  government: "documents",
  family: "personal",
  health: "personal",
  shopping: "personal",
  travel: "personal",
  events: "personal",
  entertainment: "personal",
  car: "personal",
}
const coarse = (name) =>
  ["money", "documents", "meeting", "delivery", "access", "personal", "other"].includes(name)
    ? name
    : (OLD_NAME[name] ?? "other")

const accuracy = (pick, truth) => {
  const right = tasks.filter((task) => pick(task) === truth(task)).length
  return { right, of: tasks.length, share: right / tasks.length }
}
const confusion = (name) => {
  const counts = {}
  for (const task of tasks) {
    const key = `${labels[task.id]} → ${predicted[name][task.id]}`
    if (labels[task.id] !== predicted[name][task.id]) counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}
const categoryAccuracy = Object.fromEntries(
  Object.keys(lists).map((name) => [
    name,
    {
      newLabels: accuracy(
        (task) => predicted[name][task.id],
        (task) => labels[task.id],
      ),
      setLabels: accuracy(
        (task) => coarse(predicted[name][task.id]),
        (task) => task.category,
      ),
      fellToOther: tasks.filter((task) => predicted[name][task.id] === "other").length,
      misses: confusion(name),
    },
  ]),
)

// The duplicate replay reads `category`; each variant swaps in another source for it.
const cache = join(here, ".cache")
mkdirSync(cache, { recursive: true })
const variants = {
  "set labels (old seven)": (task) => task.category,
  "new labels (36)": (task) => labels[task.id],
  "rule, old list": (task) => predicted.old[task.id],
  "rule, new list": (task) => predicted.new[task.id],
}
const duplicateRuns = {}
for (const [name, categoryOf] of Object.entries(variants)) {
  const slug = name.replace(/[^a-z0-9]+/g, "-")
  const input = join(cache, `${slug}.jsonl`)
  const output = join(cache, `${slug}.json`)
  writeFileSync(input, `${tasks.map((task) => JSON.stringify({ ...task, category: categoryOf(task) })).join("\n")}\n`)
  execFileSync(process.execPath, [join(duplicates, "linked.mjs"), input, output], { stdio: "ignore" })
  const { runs } = JSON.parse(readFileSync(output, "utf8"))
  const pick = (run) => ({ maybe: run.pairs.maybe, likely: run.pairs.likely, newRefused: run.tasks.newRefused })
  duplicateRuns[name] = {
    agentTasks: pick(Object.entries(runs).find(([key]) => key.startsWith("no agent"))[1]),
    ruleTasks: pick(runs["rule tasks, source message read (after)"]),
  }
}

writeFileSync(
  join(here, "results.json"),
  `${JSON.stringify(
    {
      environment: { node: process.version, cliCoreStemmers: CORE_VERSION, portCheck },
      categories: Object.fromEntries(Object.entries(lists).map(([name, list]) => [name, list.length])),
      categoryAccuracy,
      spanish: spanishRuns,
      duplicateRuns,
    },
    null,
    2,
  )}\n`,
)

const pct = (x) => (x === null ? "—" : `${(100 * x).toFixed(0)}%`)
const lines = [
  `port check: ${portCheck}`,
  "",
  "| list | new labels | set labels (old 7) | fell to other |",
  "|---|---|---|---|",
]
for (const [name, a] of Object.entries(categoryAccuracy))
  lines.push(
    `| ${name} | ${a.newLabels.right}/${a.newLabels.of} ${pct(a.newLabels.share)} | ` +
      `${a.setLabels.right}/${a.setLabels.of} ${pct(a.setLabels.share)} | ${a.fellToOther} |`,
  )
lines.push("", "| Spanish set, new list | right | fell to other |", "|---|---|---|")
for (const [name, run] of Object.entries(spanishRuns))
  lines.push(`| ${name} | ${run.right}/${run.of} ${pct(run.share)} | ${run.fellToOther} |`)
lines.push(
  "",
  "| category from | tasks | ≥ 5 true/false | P | R | ≥ 10 true/false | P | R | new tasks refused |",
  "|---|---|---|---|---|---|---|---|---|",
)
for (const [name, run] of Object.entries(duplicateRuns))
  for (const [kind, r] of Object.entries(run))
    lines.push(
      `| ${name} | ${kind} | ${r.maybe.true}/${r.maybe.false} | ${pct(r.maybe.precision)} | ${pct(r.maybe.recall)} | ` +
        `${r.likely.true}/${r.likely.false} | ${pct(r.likely.precision)} | ${pct(r.likely.recall)} | ${r.newRefused}/180 |`,
    )
process.stdout.write(`${lines.join("\n")}\n`)
