import { appendFileSync } from "node:fs"
import { it, vi } from "vitest"
import type { FoundMessage } from "../src/services/messages.js"
import { searchStore } from "../src/services/messages-archive-search.js"
import { meaningLane } from "../src/services/messages-meaning.js"
import { openStore } from "../src/store/store.js"

vi.mock("../src/store/sqlite/note-index.js", async (original) => ({
  ...(await original<typeof import("../src/store/sqlite/note-index.js")>()),
  drainNoteIndex: () => undefined,
}))

const DAY = 86_400_000
const now = Date.now()
const at = (m: FoundMessage) => Date.parse(m.timestamp ?? "")
// The owner's chats stay out of this public script: two to exclude, two narrow ones to filter by.
const [A, B, C, D] = (process.env.MEASURE_CHATS ?? "").split(",")
// Each check names what a hit must not be; a day of margin covers Madrid day edges.
const QUERIES: [string, (m: FoundMessage) => boolean][] = [
  ["встреча -date>=30d", (m) => at(m) >= now - 29 * DAY],
  ["встреча NOT завтра", (m) => /завтра/iu.test(m.text)],
  ["встреча OR созвон", () => false],
  ["встреча (date>=30d OR date<=2020-01-01)", (m) => at(m) < now - 31 * DAY && at(m) > Date.UTC(2020, 0, 2)],
  [`встреча -chat:"${A}"`, (m) => m.chatId === A],
  [`встреча -(chat:"${A}" OR chat:${B})`, (m) => m.chatId === A || m.chatId === B],
  [`встреча chat:"${C}"`, (m) => m.chatId !== C],
  [`встреча chat:"${D}"`, (m) => m.chatId !== D],
  ["встреча date>=30d", (m) => at(m) < now - 31 * DAY],
  ["встреча date>=60d", (m) => at(m) < now - 61 * DAY],
  ["оплата date>=14d", (m) => at(m) < now - 15 * DAY],
]

it("messages", async () => {
  const store = await openStore({ path: process.env.MEASURE_STORE as string, readOnly: true })
  Object.assign(store.searchIndex, { fillSearchIndex: async () => undefined, fillStems: async () => undefined })
  const account = { provider: "telegram", account: process.env.MEASURE_ACCOUNT as string }
  const lane = meaningLane({ env: process.env, store: async () => store, messenger: { app: { command: "tg" } } })
  const out = process.env.MEASURE_OUT as string
  const label = process.env.MEASURE_LABEL
  const run = (text: string) =>
    searchStore(
      store,
      account,
      { text, limit: 20, timezone: "Europe/Madrid", discover: true, accounts: [account] },
      {},
      lane,
    )
  await run("встреча").catch(() => undefined)
  for (const [text, breaks] of QUERIES) {
    const started = performance.now()
    const found = await run(text).catch((e: Error) => ({ error: e.message }))
    const ms = Math.round(performance.now() - started)
    if ("error" in found) {
      appendFileSync(out, `${JSON.stringify({ label, text, error: found.error.slice(0, 160) })}\n`)
      continue
    }
    const by = (m: FoundMessage) => m.discovery?.foundBy ?? []
    appendFileSync(
      out,
      `${JSON.stringify({
        label,
        text,
        method: found.query?.discovery?.method ?? "strict",
        hits: found.items.length,
        meaning_hits: found.items.filter((m) => by(m).includes("meaning")).length,
        meaning_only: found.items.filter((m) => by(m).join() === "meaning").length,
        meaning_candidates: found.query?.discovery?.meaning?.candidates ?? null,
        follow_ups: found.query?.discovery?.followUps ?? null,
        breaks: found.items.filter(breaks).length + found.items.flatMap((m) => m.followUps ?? []).filter(breaks).length,
        skipped: found.meaningSkipped?.reason ?? null,
        ms,
      })}\n`,
    )
  }
  await store.close()
}, 900_000)
