// node bench.mjs <cli-core checkout, built> [meetings=120] [cues=600]
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

const [checkout, meetings = "120", cues = "600"] = process.argv.slice(2)
if (!checkout) throw new Error("usage: node bench.mjs <cli-core checkout> [meetings] [cues]")
const load = (path) => import(pathToFileURL(join(checkout, "dist", path)).href)
const { openStore } = await load("store/store.js")
const { sampleMeeting } = await load("meetings/testing/index.js")

const syllables =
  "ба ве ги до ку ла ми но пе ро са ти ус фа ха це чу ша ще ры ле кор пред при про рас вы на за от об под ст тр гр кр ль ния ство тель ова ина".split(
    " ",
  )
const endings = [
  "",
  "а",
  "у",
  "ом",
  "е",
  "ы",
  "ов",
  "ами",
  "ах",
  "ть",
  "л",
  "ла",
  "ли",
  "ет",
  "ют",
  "ий",
  "ая",
  "ое",
  "ого",
]
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const lemmas = Array.from({ length: 6000 }, () =>
  Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => pick(syllables)).join(""),
)
const word = () => {
  let value = lemmas[Math.floor(Math.random() ** 1.3 * lemmas.length)] + pick(endings)
  if (Math.random() < 0.02) {
    const at = Math.floor(Math.random() * value.length)
    value = value.slice(0, at) + pick([..."аеиоуы"]) + value.slice(at + 1)
  }
  return value
}
const planted = ["риелтор", "реелтора", "рилторов", "дриелтора", "циана", "цианом"]

const path = join(mkdtempSync(join(tmpdir(), "meeting-garbled-bench-")), "bench.db")
const store = await openStore({ path, env: { MESSAGING_STORE: path }, now: () => 1000 })
const accountId = await store.accounts.saveAccount({ provider: "example", account: "BenchExample" }, {})
let started = performance.now()
for (let m = 0; m < Number(meetings); m++) {
  const input = sampleMeeting()
  input.meeting.accountId = accountId
  input.meeting.externalId = `bench-${m}`
  const row = input.transcripts[0].rows[0]
  input.transcripts[0].rows = Array.from({ length: Number(cues) }, (_, position) => ({
    ...row,
    position,
    startMs: position * 5000,
    endMs: position * 5000 + 4000,
    speakerParticipantPosition: null,
    text: [...Array.from({ length: 15 }, word), ...(position % 97 === 0 ? [pick(planted)] : [])].join(" "),
  }))
  await store.meetings.saveMeeting(input)
}
const saved = performance.now() - started
started = performance.now()
let result
do result = await store.meetings.indexSearch({ accountId, limit: 1000 })
while (result.remaining)
const indexed = performance.now() - started

const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
const timed = async (query) => {
  const runs = []
  let found
  for (let run = 0; run < 7; run++) {
    const at = performance.now()
    found = await store.meetings.searchHits(query, { accountId, limit: 1000 })
    runs.push(performance.now() - at)
  }
  const corrected = found.items.filter((hit) => hit.match === "corrected").length
  return { query, ms: Math.round(median(runs)), hits: found.items.length, corrected }
}
const rows = []
for (const query of ["риелтор", "циана", "exact:риелтор", "проверка", "риелтор квартира", word()])
  rows.push(await timed(query))
await store.close()
process.stdout.write(
  `${JSON.stringify(
    { meetings: Number(meetings), cues: Number(cues), saveMs: Math.round(saved), indexMs: Math.round(indexed), rows },
    null,
    2,
  )}\n`,
)
