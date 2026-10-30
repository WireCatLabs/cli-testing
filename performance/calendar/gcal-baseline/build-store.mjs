// Builds a synthetic gcal store by running gcal's real `sync` against an in-process fake of Google Calendar.
// Usage: node build-store.mjs <gcal checkout> <sandbox dir> <events> [calendars=4] [seriesShare=0.04]
// No network, no real keyring: the session lives in cli-base's memoryKeyring, folders are under <sandbox dir>.
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [gcalDir, sandbox, eventsArg, calendarsArg = "4", shareArg = "0.04"] = process.argv.slice(2)
const TOTAL = Number(eventsArg)
const CALENDARS = Number(calendarsArg)
const SERIES_SHARE = Number(shareArg)
// BENCH_SYNC_ARGS="--timeout 30m" makes each sync one run instead of several deadline-sized ones.
const SYNC_ARGS = (process.env.BENCH_SYNC_ARGS ?? "").split(" ").filter(Boolean)
const at = (path) => import(pathToFileURL(join(gcalDir, path)).href)

const { memoryKeyring } = await at("node_modules/@wirecat/cli-base/dist/index.js")
const { rememberAccount } = await at("node_modules/@wirecat/cli-core/dist/cli/index.js")
const { CALENDAR_READ_SCOPE, sessionStorage } = await at("dist/google.js")
const { IDENTITY } = await at("dist/identity.js")
const { run } = await at("dist/program.js")

for (const dir of ["config", "state", "cache", "store", "home"]) mkdirSync(join(sandbox, dir), { recursive: true })
const env = {
  ...process.env,
  HOME: join(sandbox, "home"),
  GCAL_CONFIG_DIR: join(sandbox, "config"),
  GCAL_STATE_DIR: join(sandbox, "state"),
  GCAL_CACHE_DIR: join(sandbox, "cache"),
  GCAL_NO_UPDATE_CHECK: "1",
  MESSAGING_STORE: join(sandbox, "store", "wirecat.db"),
}
delete env.DBUS_SESSION_BUS_ADDRESS
const keyring = memoryKeyring()
sessionStorage(env, "personal", keyring).write({
  tokens: {
    accessToken: "bench-access",
    refreshToken: "bench-refresh",
    expiresAt: Date.now() + 3_600_000,
    scopes: [CALENDAR_READ_SCOPE],
  },
  client: { clientId: "bench-client.apps" },
})
rememberAccount(IDENTITY, "personal", "owner@example.com", env)

// Deterministic pseudo-random numbers, so every run builds the same store.
let seed = 42
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const pick = (list) => list[Math.floor(rnd() * list.length)]
const WORDS = (
  "planning review roadmap budget hiring design sync retro standup interview launch customer onboarding " +
  "invoice quarterly offsite workshop demo pricing security migration release postmortem training lunch"
).split(" ")
const PEOPLE = Array.from({ length: 400 }, (_, i) => ({ email: `person${i}@example.org`, displayName: `Person ${i}` }))
const now = Date.now()
const DAY = 86_400_000
const from = now - 365 * DAY
const to = now + 90 * DAY
const iso = (ms) => new Date(ms).toISOString()
const calendarIds = Array.from({ length: CALENDARS }, (_, i) =>
  i === 0 ? "owner@example.com" : `cal${i}@group.example.com`,
)

const eventAt = (calendar, i, start) => {
  const minutes = pick([30, 30, 45, 60, 60, 90])
  const attendees = [{ email: "owner@example.com", self: true, organizer: rnd() < 0.5, responseStatus: "accepted" }]
  const guests = Math.floor(rnd() * 8)
  for (let g = 0; g < guests; g++)
    attendees.push({ ...pick(PEOPLE), responseStatus: pick(["accepted", "needsAction", "tentative"]) })
  const title = `${pick(WORDS)} ${pick(WORDS)} ${i}`
  return {
    kind: "calendar#event",
    id: `${calendar.replace(/\W/g, "")}e${i}`,
    etag: `"${i}"`,
    status: "confirmed",
    htmlLink: `https://calendar.google.com/calendar/event?eid=${i}`,
    updated: iso(start - DAY),
    summary: title,
    description: `Agenda for ${title}: ${pick(WORDS)}, ${pick(WORDS)} and ${pick(WORDS)}.\nhttps://example.zoom.us/j/${i}?pwd=x`,
    location: rnd() < 0.3 ? `Room ${Math.floor(rnd() * 20)}` : undefined,
    organizer: { email: "owner@example.com", self: true },
    start: { dateTime: iso(start), timeZone: "Europe/Madrid" },
    end: { dateTime: iso(start + minutes * 60_000), timeZone: "Europe/Madrid" },
    iCalUID: `${calendar}e${i}@google.com`,
    sequence: 0,
    attendees,
    eventType: "default",
  }
}

// Per calendar: its events (singles plus series masters) and, per series, its weekly slots.
const perCalendar = new Map()
const instancesOf = new Map()
for (const calendar of calendarIds) perCalendar.set(calendar, [])
for (let i = 0; i < TOTAL; i++) {
  const calendar = calendarIds[i % CALENDARS]
  const start = from + Math.floor((rnd() * (to - from)) / 900_000) * 900_000
  const event = eventAt(calendar, i, start)
  if (rnd() < SERIES_SHARE) {
    event.recurrence = ["RRULE:FREQ=WEEKLY"]
    const slots = []
    for (let s = start; s < to; s += 7 * DAY) {
      const slot = { ...event, id: `${event.id}_${s}`, recurringEventId: event.id, originalStartTime: event.start }
      delete slot.recurrence
      slot.start = { dateTime: iso(s), timeZone: "Europe/Madrid" }
      slot.end = { dateTime: iso(s + 3_600_000), timeZone: "Europe/Madrid" }
      slot.originalStartTime = slot.start
      slots.push(slot)
    }
    instancesOf.set(event.id, slots)
  }
  perCalendar.get(calendar).push(event)
}

const requests = { calendarList: 0, list: 0, instances: 0, bytes: 0 }
const json = (body, status = 200) => {
  const text = JSON.stringify(body)
  requests.bytes += text.length
  return new Response(text, { status, headers: { "content-type": "application/json" } })
}
const paged = (items, query, extra = {}) => {
  const size = Math.min(Number(query.get("maxResults") ?? 250), 2500)
  const offset = Number(query.get("pageToken") ?? 0)
  const page = items.slice(offset, offset + size)
  const more = offset + size < items.length
  return json({ kind: "calendar#events", items: page, ...(more ? { nextPageToken: String(offset + size) } : extra) })
}
const fakeFetch = async (input) => {
  const url = new URL(String(input))
  const path = decodeURIComponent(url.pathname.replace(/^\/calendar\/v3\//, ""))
  const query = url.searchParams
  if (path === "users/me/calendarList") {
    requests.calendarList += 1
    return json({
      kind: "calendar#calendarList",
      items: calendarIds.map((id, i) => ({
        id,
        summary: id,
        timeZone: "Europe/Madrid",
        accessRole: "owner",
        primary: i === 0,
      })),
    })
  }
  const instances = path.match(/^calendars\/([^/]+)\/events\/([^/]+)\/instances$/)
  if (instances) {
    requests.instances += 1
    return paged(instancesOf.get(instances[2]) ?? [], query)
  }
  const list = path.match(/^calendars\/([^/]+)\/events$/)
  if (list) {
    requests.list += 1
    if (query.get("syncToken")) return json({ kind: "calendar#events", items: [], nextSyncToken: "bench-token" })
    return paged(perCalendar.get(list[1]) ?? [], query, { nextSyncToken: "bench-token" })
  }
  return json({ error: { code: 404, message: "Not Found" } }, 404)
}

const gcal = async (...argv) => {
  const out = []
  const err = []
  const t = process.hrtime.bigint()
  const code = await run(argv, {
    streams: { data: (text) => out.push(text), diagnostic: (text) => err.push(text) },
    tty: false,
    env,
    keyring,
    fetch: fakeFetch,
  })
  const ms = Number(process.hrtime.bigint() - t) / 1e6
  return { code, ms, out: out.join("\n"), err: err.join("\n") }
}

const syncUntilDone = async (label, ...extra) => {
  const before = { ...requests }
  let runs = 0
  let ms = 0
  let report
  do {
    const answer = await gcal("personal", "sync", "--json", ...SYNC_ARGS, ...extra)
    runs += 1
    ms += answer.ms
    if (answer.code !== 0) throw new Error(`sync exited ${answer.code}: ${answer.err}`)
    report = JSON.parse(answer.out).item
    extra = extra.filter((word) => word !== "--rescan")
  } while (report.state !== "complete" && runs < 50)
  const used = Object.fromEntries(Object.keys(requests).map((k) => [k, requests[k] - before[k]]))
  return { label, runs, ms: Math.round(ms), requests: used, saved: report.progress?.saved, state: report.state }
}

const series = instancesOf.size
const slots = [...instancesOf.values()].reduce((sum, list) => sum + list.length, 0)
const results = { syncArgs: SYNC_ARGS, events: TOTAL, calendars: CALENDARS, series, slots, steps: [] }
results.steps.push(await syncUntilDone("first sync (full)"))
results.steps.push(await syncUntilDone("second sync (no changes)"))
results.steps.push(await syncUntilDone("sync --rescan (daily full round)", "--rescan"))
results.storeBytes = statSync(env.MESSAGING_STORE).size
writeFileSync(join(sandbox, "build.json"), JSON.stringify(results, null, 2))
process.stdout.write(`${JSON.stringify(results)}\n`)
