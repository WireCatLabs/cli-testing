// node tie-probe.mjs <cli-core checkout, built> <work directory>
// A literal word hit whose passage scores under the e5-small floor, against an unrelated passage above it.
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [checkout, work] = process.argv.slice(2)
if (!checkout || !work) throw new Error("usage: node tie-probe.mjs <cli-core checkout> <work directory>")
const load = (path) => import(pathToFileURL(join(checkout, "dist", path)).href)
const { openStore } = await load("store/store.js")
const { sampleMeeting } = await load("meetings/testing/index.js")
const { searchMeetingsCombined, applyMeetingEmbedding } = await load("services/index.js")

const axis = (similarity, other) => {
  const vector = new Float32Array(384)
  vector[0] = similarity
  vector[other] = Math.sqrt(1 - similarity ** 2)
  return vector
}
const embedder = {
  key: "local:e5-small:384",
  model: "e5-small",
  dims: 384,
  kind: "local",
  embed: async (texts, kind) =>
    texts.map((text) =>
      kind === "query" ? axis(1, 1) : text.toLowerCase().includes("залог") ? axis(0.7, 2) : axis(0.9, 3),
    ),
  close: async () => {},
}

mkdirSync(work, { recursive: true })
const store = await openStore({ path: join(work, `probe-${Date.now()}.db`) })
const accountId = await store.accounts.saveAccount({ provider: "example", account: "alice-example" }, { name: "A" })
for (const [key, text] of [
  ["word", "Залог за склад вернут после осмотра."],
  ["other", "Обсудили отпуск и погоду."],
]) {
  const input = sampleMeeting()
  Object.assign(input.meeting, { accountId, externalId: `probe-${key}`, title: `Встреча ${key}`, series: null })
  input.transcripts[0].language = "ru"
  input.transcripts[0].contentHash = `probe-${key}`
  input.transcripts[0].rows = [{ ...input.transcripts[0].rows[0], text, speakerParticipantPosition: null }]
  input.chat = []
  input.summaries = []
  await store.meetings.saveMeeting(input)
}
await store.meetingVectors.rebuild({ accountId })
await applyMeetingEmbedding(store.meetingVectors, accountId, embedder)
const found = await searchMeetingsCombined(store, embedder, "залог склад", { accountId })
process.stdout.write(
  `${JSON.stringify(found.items.map(({ text, by, score }) => ({ text, by, score: score && Number(score.toFixed(2)) })))}\n`,
)
await store.close()
