// Calendar sync engine over cli-core's SQLite store and an in-memory fake source.
// Usage: node sync-bench.mjs <cli-core checkout, built> <store path> [events=20000] [calendars=4] [seriesShare=0.04]

import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, path, eventsArg = "20000", calendarsArg = "4", shareArg = "0.04"] = process.argv.slice(2)
const at = (file) => import(pathToFileURL(join(core, file)).href)
const { openStore } = await at("dist/store/index.js")
const { syncCalendars, calendarSyncWindow } = await at("dist/calendar/index.js")
const { fakeCalendarSource } = await at("dist/calendar/testing/index.js")

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 30, 9)
const window = calendarSyncWindow(NOW)
let seed = 42
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const calendars = Array.from({ length: Number(calendarsArg) }, (_, i) => ({
  externalId: `cal${i}`,
  title: `Calendar ${i}`,
  timezone: "Europe/Madrid",
  accessRole: "owner",
  primary: i === 0,
  syncByDefault: true,
}))
const source = fakeCalendarSource({ calendars, pageSize: 2500 })
let series = 0
let slots = 0
const later = []
for (let i = 0; i < Number(eventsArg); i++) {
  const calendar = calendars[i % calendars.length].externalId
  const start = window.from + Math.floor((rnd() * (window.to - window.from)) / 900_000) * 900_000
  const guests = Array.from({ length: Math.floor(rnd() * 8) }, () => ({
    email: `person${Math.floor(rnd() * 400)}@example.org`,
  }))
  const event = {
    externalId: `${calendar}e${i}`,
    kind: "single",
    status: "confirmed",
    title: `Review ${i}`,
    etag: `"${i}"`,
    startsAt: start,
    endsAt: start + 3_600_000,
    timezone: "Europe/Madrid",
    participants: [{ email: "owner@example.com", self: true, organizer: true, response: "accepted" }, ...guests],
  }
  if (rnd() < Number(shareArg)) {
    series += 1
    const list = []
    for (let s = start; s < window.to + 30 * DAY; s += 7 * DAY)
      list.push({
        ...event,
        externalId: `${event.externalId}_${s}`,
        kind: "occurrence",
        seriesExternalId: event.externalId,
        originalStartsAt: s,
        startsAt: s,
        endsAt: s + 3_600_000,
        etag: `"${i}-${s}"`,
      })
    source.put(calendar, { ...event, kind: "series", recurrence: ["RRULE:FREQ=WEEKLY"] })
    // The fake hands every stored slot back; the engine asks for the window, so keep the slots inside it, as Google does.
    const inside = (w) => list.filter((one) => one.originalStartsAt >= w.from && one.originalStartsAt < w.to)
    source.setOccurrences(event.externalId, inside(window))
    later.push([event.externalId, inside])
    slots += inside(window).length
  } else source.put(calendar, event)
}

const store = await openStore({ path })
const accountId = await store.accounts.saveAccount({ provider: "google-calendar", account: "bench" }, { name: null })
let writes = 0
const counted = new Proxy(store.calendar, {
  get: (target, key) => {
    const value = Reflect.get(target, key)
    if (typeof value !== "function") return value
    return (...args) => {
      if (
        [
          "saveEntries",
          "removeEntries",
          "saveSlots",
          "setCursor",
          "markUnseen",
          "restoreUnseen",
          "saveCalendars",
        ].includes(String(key))
      )
        writes += 1
      return value.apply(target, args)
    }
  },
})
const round = async (label, now) => {
  for (const [id, inside] of later) source.setOccurrences(id, inside(calendarSyncWindow(now)))
  const [w0, a0] = [writes, source.calls.occurrences.length]
  const t = process.hrtime.bigint()
  const report = await syncCalendars(source, counted, { accountId, now })
  const ms = Number(process.hrtime.bigint() - t) / 1e6
  return {
    label,
    ms: Math.round(ms),
    writeTransactions: writes - w0,
    instancesRequests: source.calls.occurrences.length - a0,
    rounds: report.synced.map(({ round }) => round).join(","),
    state: report.state,
    saved: report.progress.saved,
  }
}
const results = { events: Number(eventsArg), calendars: calendars.length, series, slotsInWindow: slots, steps: [] }
results.steps.push(await round("first sync (full)", NOW))
results.steps.push(await round("same day, no changes", NOW + 3_600_000))
results.steps.push(await round("next day: daily full round", NOW + DAY))
results.steps.push(await round("8 days on: full round, every series", NOW + 8 * DAY))
await store.close()
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
