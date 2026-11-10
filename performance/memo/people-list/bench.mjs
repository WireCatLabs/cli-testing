// What `memo people list` costs in cli-core on the store seed.mjs makes, and whether two builds answer the same.
// No real data, no network, no account, no CLI run.
//   node bench.mjs <cli-core dist folder> <store file> [answers.json]
// With a third argument it writes every answer there, to compare two builds with `cmp`.
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [dist, path, answersFile] = process.argv.slice(2)
if (!dist || !path) throw new Error("usage: node bench.mjs <cli-core dist folder> <store file> [answers.json]")
const load = (file) => import(pathToFileURL(join(dist, file)).href)
const { openStore } = await load("store/store.js")
const store = await openStore({ env: { ...process.env, MESSAGING_STORE: path } })

const RUNS = 7
const say = (line) => process.stdout.write(`${line}\n`)
const median = async (label, work) => {
  const firstStart = performance.now()
  await work()
  const first = performance.now() - firstStart
  const times = []
  for (let run = 0; run < RUNS; run++) {
    const began = performance.now()
    await work()
    times.push(performance.now() - began)
  }
  times.sort((a, b) => a - b)
  say(
    `${label.padEnd(48)} first ${first.toFixed(0).padStart(6)} ms, median ${times[RUNS >> 1].toFixed(0).padStart(5)} ms`,
  )
}

await median("kind:person, interactions, limit 1", () => store.people.list({ limit: 1 }))
await median("kind:person, interactions, limit 50", () => store.people.list({ limit: 50 }))
await median("kind:person, interactions, limit 5000", () => store.people.list({ limit: 5000 }))
await median("kind:all, interactions, limit 5000", () => store.people.list({ limit: 5000, kind: "all" }))
await median("kind:all, name, limit 50", () => store.people.list({ limit: 50, kind: "all", sort: "name" }))
await median("kind:person, recent, limit 50", () => store.people.list({ limit: 50, sort: "recent" }))
await median("kind:person, tasks, limit 50", () => store.people.list({ limit: 50, sort: "tasks" }))
for (const kind of ["organization", "automated", "stranger", "unsorted"])
  await median(`kind:${kind}, limit 1 (a tab count)`, () => store.people.list({ limit: 1, kind }))
await median("name search, kind:all", () => store.people.list({ limit: 50, kind: "all", query: "Garcia 12" }))
if (store.people.counts) {
  await median("counts, every kind", () => store.people.counts())
  // What a sync leaves for the next list: people whose stored kind a trigger cleared.
  const writer = new DatabaseSync(path)
  const persons = Number(writer.prepare("SELECT count(*) AS n FROM persons").get()?.n)
  for (const stale of [500, 2_000, 5_000])
    await median(`limit 50, ${stale} people to work out again`, () => {
      writer.prepare("UPDATE persons SET kind = NULL WHERE id % ? = 0").run(Math.floor(persons / stale))
      return store.people.list({ limit: 50 })
    })
  writer.close()
}

if (answersFile) {
  const answers = {}
  for (const kind of ["person", "organization", "automated", "stranger", "unsorted", "all"])
    for (const sort of ["interactions", "recent", "name", "tasks"])
      for (const offset of [0, 50, 4950]) {
        const page = await store.people.list({ limit: 50, offset, kind, sort })
        answers[`${kind} ${sort} ${offset}`] = page
      }
  answers.search = await store.people.list({ limit: 50, kind: "all", query: "Garcia 12" })
  answers.similar = await store.people.similar("ivan petrov")
  writeFileSync(answersFile, JSON.stringify(answers, null, 1))
}
say(JSON.stringify((await store.people.list({ limit: 1 })).counts))
await store.close()
