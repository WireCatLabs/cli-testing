// Times the calendar list reads on a store sync-bench.mjs built. Usage: node reads-bench.mjs <cli-core checkout> <store>

import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, path] = process.argv.slice(2)
const at = (file) => import(pathToFileURL(join(core, file)).href)
const { openStore } = await at("dist/store/index.js")
const { peopleAnswer } = await at("dist/calendar/reads.js")
const store = await openStore({ path })
const accountId = 1
const NOW = Date.UTC(2026, 9, 30, 9)
const DAY = 86_400_000
const day = (ms) => new Date(ms).toISOString().slice(0, 10)
const today = {
  accountId,
  from: NOW - 9 * 3_600_000,
  to: NOW + 15 * 3_600_000,
  fromDate: day(NOW),
  toDate: day(NOW + DAY),
}
const week = { accountId, from: NOW, to: NOW + 7 * DAY, fromDate: day(NOW), toDate: day(NOW + 7 * DAY) }
const median = async (fn, n = 15) => {
  await fn()
  const times = []
  for (let i = 0; i < n; i++) {
    const t = process.hrtime.bigint()
    await fn()
    times.push(Number(process.hrtime.bigint() - t) / 1e6)
  }
  times.sort((a, b) => a - b)
  return Math.round(times[Math.floor(n / 2)] * 10) / 10
}
const out = {
  "events list today (ms)": await median(() => store.calendar.events(today)),
  "events list week (ms)": await median(() => store.calendar.events(week)),
  "people list week (ms)": await median(() => peopleAnswer(store.calendar, accountId, { filter: week })),
  "today rows": (await store.calendar.events(today)).length,
  "week people": (await peopleAnswer(store.calendar, accountId, { filter: week })).items.length,
}
await store.close()
process.stdout.write(`${JSON.stringify(out)}\n`)
