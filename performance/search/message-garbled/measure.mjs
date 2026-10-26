// Voice-note transcripts in message search: word forms and garbled spellings, on a copy of a real store.
//   node measure.mjs <cli-core checkout, built> <store copy> <private rows.jsonl>
// Prints totals only. The rows hold real words and go to the private file, never here.
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [checkout, path, rowsPath] = process.argv.slice(2)
if (!checkout || !path || !rowsPath) throw new Error("usage: node measure.mjs <cli-core> <store copy> <rows.jsonl>")
const load = (file) => import(pathToFileURL(join(checkout, "dist", file)).href)
const { openStore } = await load("store/store.js")
const { searchStore } = await load("services/messages-archive-search.js")
const { openCache } = await load("store/open.js")
const { isNumberWord } = await load("search/garbled.js")

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const timed = async (work) => {
  const started = performance.now()
  const result = await work()
  return { result, ms: performance.now() - started }
}

const opened = await timed(() => openStore({ path }))
const store = opened.result
const database = await openCache(path)
const SPEECH =
  "(coalesce(a.extractor,'') LIKE 'speech:%' OR a.kind IN ('voice','video_note') OR coalesce(a.mime,'')='audio/ogg')"
const transcripts = database
  .prepare(
    `SELECT a.text FROM attachments a WHERE a.attachable_type='message' AND coalesce(a.text,'')<>'' AND ${SPEECH}`,
  )
  .all()
  .map((row) => String(row.text))
const accounts = (await store.accounts.accounts()).filter(({ provider }) => provider !== "email")
const account = accounts[0]

// The first search fills the transcript index, as any search does.
const first = await timed(() => searchStore(store, account, { text: "проверка", accounts, limit: 10 }))
const indexed = Number(database.prepare("SELECT count(*) AS n FROM transcript_stems").get().n)

const counts = new Map()
for (const text of transcripts)
  for (const word of text
    .toLowerCase()
    .replaceAll("ё", "е")
    .match(/[а-я]+/g) ?? [])
    if (word.length >= 5 && !isNumberWord(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word)
const frequent = ranked.slice(0, 40)
const rest = ranked.slice(40)
const step = Math.max(1, Math.floor(rest.length / 40))
const queries = [...frequent, ...rest.filter((_, at) => at % step === 0).slice(0, 40)]

const rows = []
for (const query of queries) {
  const runs = []
  let found
  for (let run = 0; run < 3; run++) {
    const one = await timed(() => searchStore(store, account, { text: query, accounts, limit: 1000 }))
    runs.push(one.ms)
    found = one.result
  }
  const typed = await searchStore(store, account, { text: query, accounts, limit: 1000, exact: true })
  const spoken = found.items.filter(({ matchedIn }) => matchedIn === "transcript")
  rows.push({
    query,
    ms: median(runs),
    hits: found.items.length,
    transcript: spoken.length,
    typedTranscript: typed.items.filter(({ matchedIn }) => matchedIn === "transcript").length,
    corrected: spoken.filter(({ match }) => match === "corrected").length,
    corrections: found.corrections,
  })
}
const discover = []
for (const query of queries.slice(0, 5))
  discover.push(
    (await timed(() => searchStore(store, account, { text: query, accounts, limit: 100, discover: true }))).ms,
  )

writeFileSync(rowsPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", { mode: 0o600 })
const sum = (key) => rows.reduce((total, row) => total + row[key], 0)
const times = rows.map(({ ms }) => ms)
const sorted = [...times].sort((a, b) => a - b)
process.stdout.write(
  `${JSON.stringify(
    {
      openAndMigrateMs: Math.round(opened.ms),
      firstSearchMs: Math.round(first.ms),
      transcripts: transcripts.length,
      transcriptStemsRows: indexed,
      distinctWords: counts.size,
      queries: rows.length,
      transcriptHitsTyped: sum("typedTranscript"),
      transcriptHitsAll: sum("transcript"),
      correctedHits: sum("corrected"),
      queriesWithCorrections: rows.filter(({ corrected }) => corrected > 0).length,
      medianMs: Math.round(median(times)),
      p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
      discoverMedianMs: Math.round(median(discover)),
    },
    null,
    2,
  )}\n`,
)
database.close()
await store.close()
