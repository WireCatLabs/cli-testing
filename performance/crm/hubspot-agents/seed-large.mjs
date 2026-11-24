#!/usr/bin/env node
// Seeds round 2's invented account (large-data.mjs) into the HubSpot test account through HubSpot's batch API, and
// reads the needles back. Never touches a record it did not create.
// Usage: node seed-large.mjs seed [--types companies,contacts] [--limit N]   only those types, N records of each (a
//          smoke run); a rerun goes on from there
//        node seed-large.mjs verify            reads every needle of large-data.mjs NEEDLES back from HubSpot
//        node seed-large.mjs probe             runs the searches a careful agent would try first, per question
// Status CSV: one row per batch (id = type:first..last, status started|done|failed, detail = key=id pairs). A rerun
// skips records a done row holds. A batch left "started" is looked up by its unique field (domain, e-mail, deal name)
// before anything is created again; an activity batch left "started" stops the run for a check by hand.
// The key is read from the keyring in this process (secret-tool) and never printed.
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { data, everyContact, NEEDLES } from "./large-data.mjs"

const RUN = process.env.HUBSPOT_AGENTS_RUN ?? join(homedir(), ".cache/wirecat-hubspot-agents")
const STATUS_CSV = join(RUN, "large", "seed-status.csv")
const IDS_JSON = join(RUN, "large", "seed-ids.json")
const KEYRING = ["service", "hubspot-cli-live", "account", process.env.HUBSPOT_AGENTS_KEYRING_ACCOUNT ?? "wirecat"]
const ACCOUNT = "149800303"
const API = "https://api.hubapi.com"
const BATCH = 100
const POOL = 3
// HubSpot allows a private app 100 requests in 10 s; the seed keeps to 4 a second so the contestants' runs, which
// share the key, keep their share.
const GAP_MS = 250

const say = (line) => process.stdout.write(`${line}\n`)
const [command = "seed", ...rest] = process.argv.slice(2)
const limit = rest.includes("--limit") ? Number(rest[rest.indexOf("--limit") + 1]) : Infinity
const TYPES = ["companies", "contacts", "deals", "notes", "tasks", "calls", "meetings"]
const types = rest.includes("--types") ? rest[rest.indexOf("--types") + 1].split(",") : TYPES

const token = execFileSync("secret-tool", ["lookup", ...KEYRING], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim()
if (!token) throw new Error(`no keyring entry ${KEYRING.join(" ")}`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let nextSlot = 0
const call = async (method, path, body) => {
  for (let attempt = 0; ; attempt++) {
    const wait = nextSlot - Date.now()
    nextSlot = Math.max(Date.now(), nextSlot) + (path.includes("/search") ? 400 : GAP_MS)
    if (wait > 0) await sleep(wait)
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if ((response.status === 429 || response.status >= 502) && attempt < 6) {
      await sleep(Number(response.headers.get("retry-after") ?? 2) * 1000 + 1000 * attempt)
      continue
    }
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) {
      const error = new Error(
        `${method} ${path.split("?")[0]} ${response.status}: ${json.message ?? text}`.slice(0, 400),
      )
      error.status = response.status
      throw error
    }
    return json
  }
}

mkdirSync(join(RUN, "large"), { recursive: true })
const ids = new Map()
const started = new Map()
const archived = new Set()
if (existsSync(STATUS_CSV)) {
  for (const line of readFileSync(STATUS_CSV, "utf8").trim().split("\n").slice(1)) {
    const [batch, status, detail] = line.split(",")
    if (status === "done") {
      for (const pair of detail.split(";")) {
        const [key, id] = pair.split("=")
        if (id) ids.set(key, id)
      }
      started.delete(batch)
    } else if (status === "started") started.set(batch, [...(started.get(batch) ?? []), ...detail.split(";")])
    else if (status === "archived")
      for (const key of detail.split(";")) {
        ids.delete(key.split("=")[0])
        archived.add(key.split("=")[0])
      }
  }
} else writeFileSync(STATUS_CSV, "id,status,detail,time\n")
const record = (batch, status, detail) =>
  appendFileSync(
    STATUS_CSV,
    `${batch},${status},${String(detail).replaceAll(",", " ").replaceAll("\n", " ")},${new Date().toISOString()}\n`,
  )

const ASSOC = {
  contacts: { companies: 1 },
  deals: { companies: 5, contacts: 3 },
  notes: { contacts: 202, companies: 190, deals: 214 },
  tasks: { contacts: 204, companies: 192, deals: 216 },
  calls: { contacts: 194, companies: 182, deals: 206 },
  meetings: { contacts: 200, companies: 188, deals: 212 },
}
const to = (id, typeId) => ({
  to: { id },
  types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }],
})
const UNIQUE = { companies: "domain", contacts: "email", deals: "dealname" }
const signature = {
  companies: (p) => p.domain,
  contacts: (p) => p.email?.toLowerCase(),
  deals: (p) => p.dealname,
  notes: (p) => `${Date.parse(p.hs_timestamp)}|${p.hs_note_body?.slice(0, 40)}`,
  tasks: (p) => `${Date.parse(p.hs_timestamp)}|${p.hs_task_subject}`,
  calls: (p) => `${Date.parse(p.hs_timestamp)}|${p.hs_call_title}`,
  meetings: (p) => `${Date.parse(p.hs_timestamp)}|${p.hs_meeting_title}`,
}
const keyOf = (type, key) => `${type}:${key}`

const seed = async ({ reconcileOnly = false } = {}) => {
  const info = await call("GET", "/account-info/v3/details")
  if (String(info.portalId) !== ACCOUNT) throw new Error(`the key belongs to ${info.portalId}, not ${ACCOUNT}`)
  const owner = (await call("GET", "/crm/v3/owners?limit=10")).results[0]?.id
  const pipeline = (await call("GET", "/crm/v3/pipelines/deals")).results.find((p) => p.id === "default")
  const stageId = (label) => {
    const stage = pipeline.stages.find((s) => s.label === label)
    if (!stage) throw new Error(`no stage ${label}`)
    return stage.id
  }
  const industries = new Set((await call("GET", "/crm/v3/properties/companies/industry")).options.map((o) => o.value))

  const assoc = (type, links) =>
    links
      .filter(([, key]) => key)
      .map(([target, key]) => {
        const id = ids.get(keyOf(target, key))
        if (!id) throw new Error(`${type} links to ${target} ${key}, which is not seeded yet`)
        return to(id, ASSOC[type][target])
      })
  const activityLinks = (one) => [
    ["deals", one.deal],
    ["companies", one.company],
    ...one.contacts.map((c) => ["contacts", c]),
  ]
  const build = {
    companies: (c) => ({
      properties: {
        name: c.name,
        domain: c.domain,
        city: c.city,
        phone: c.phone,
        hubspot_owner_id: owner,
        ...(industries.has(c.industry) ? { industry: c.industry } : {}),
      },
    }),
    contacts: (p) => ({
      properties: {
        firstname: p.first,
        lastname: p.last,
        email: p.email,
        phone: p.phone,
        jobtitle: p.title,
        city: p.city,
        hubspot_owner_id: owner,
      },
      associations: assoc("contacts", [["companies", p.company]]),
    }),
    deals: (d) => ({
      properties: {
        dealname: d.name,
        amount: String(d.amount),
        closedate: `${d.close}T12:00:00Z`,
        pipeline: "default",
        dealstage: stageId(d.stage),
        hubspot_owner_id: owner,
        ...(d.lost ? { closed_lost_reason: d.lost } : {}),
      },
      associations: assoc("deals", [["companies", d.company], ...d.contacts.map((c) => ["contacts", c])]),
    }),
    notes: (n) => ({
      properties: { hs_timestamp: n.at, hs_note_body: n.body, hubspot_owner_id: owner },
      associations: assoc("notes", activityLinks(n)),
    }),
    tasks: (t) => ({
      properties: {
        hs_timestamp: t.due,
        hs_task_subject: t.subject,
        hs_task_status: t.status,
        hs_task_priority: t.priority,
        hs_task_type: "TODO",
        ...(t.body ? { hs_task_body: t.body } : {}),
        hubspot_owner_id: owner,
      },
      associations: assoc("tasks", activityLinks(t)),
    }),
    calls: (c) => ({
      properties: {
        hs_timestamp: c.at,
        hs_call_title: c.title,
        hs_call_body: c.body,
        hs_call_duration: String(c.minutes * 60_000),
        hs_call_status: "COMPLETED",
        hs_call_direction: "OUTBOUND",
        hubspot_owner_id: owner,
      },
      associations: assoc("calls", activityLinks(c)),
    }),
    meetings: (m) => ({
      properties: {
        hs_timestamp: m.start,
        hs_meeting_title: m.title,
        hs_meeting_body: m.body,
        hs_meeting_start_time: m.start,
        hs_meeting_end_time: m.end,
        hubspot_owner_id: owner,
        hs_meeting_outcome: Date.parse(m.start) < Date.parse("2026-11-23") ? "COMPLETED" : "SCHEDULED",
      },
      associations: assoc("meetings", activityLinks(m)),
    }),
  }

  // A batch left "started" by a broken run, or refused part way (HubSpot's 402 keeps what it made before the
  // limit): find what it made before making anything again.
  for (const [batch, keys] of started) {
    const type = batch.split(":")[0]
    const missing = [...new Set(keys)].filter((k) => !ids.has(k) && !archived.has(k))
    if (!missing.length) continue
    if (!UNIQUE[type]) throw new Error(`${batch} was started but not finished; check it in HubSpot before a rerun`)
    const byKey = new Map((type === "contacts" ? everyContact : data[type]).map((r) => [keyOf(type, r.key), r]))
    const values = missing.map((k) => build[type](byKey.get(k)).properties[UNIQUE[type]])
    const found = await call("POST", `/crm/v3/objects/${type}/search`, {
      filterGroups: [{ filters: [{ propertyName: UNIQUE[type], operator: "IN", values }] }],
      properties: [UNIQUE[type]],
      limit: 200,
    })
    const bySig = new Map(found.results.map((r) => [signature[type](r.properties), r.id]))
    const pairs = missing
      .map((k) => [k, bySig.get(signature[type](build[type](byKey.get(k)).properties))])
      .filter(([, id]) => id)
    for (const [k, id] of pairs) ids.set(k, id)
    record(batch, "done", pairs.map(([k, id]) => `${k}=${id}`).join(";"))
    // Records the generator no longer plans (it was shrunk to fit the account's limit) are made but unwanted.
    const extra = data[type].length ? pairs.filter(([k]) => !byKey.has(k)) : []
    if (extra.length) say(`${batch}: ${extra.length} made records are no longer planned; run archive-extra`)
  }

  if (reconcileOnly) {
    writeFileSync(IDS_JSON, `${JSON.stringify(Object.fromEntries(ids), null, 1)}\n`)
    return say(`reconciled; ${[...ids.keys()].filter((k) => k.startsWith("contacts:")).length} contacts known`)
  }
  let stopped = false
  let batches = 0
  let created = 0
  let lastPrint = Date.now()
  for (const type of TYPES.filter((t) => types.includes(t))) {
    const planted = (r) => (r.key.startsWith("x-") ? 0 : 1)
    const todo = data[type]
      .filter((r) => !ids.has(keyOf(type, r.key)))
      .sort((a, b) => planted(a) - planted(b))
      .slice(
        0,
        limit === Infinity
          ? undefined
          : Math.max(0, limit - data[type].filter((r) => ids.has(keyOf(type, r.key))).length),
      )
    const chunks = []
    for (let i = 0; i < todo.length; i += BATCH) chunks.push(todo.slice(i, i + BATCH))
    const queue = [...chunks]
    if (stopped) break
    await Promise.all(
      Array.from({ length: POOL }, async () => {
        while (queue.length && !stopped) {
          const chunk = queue.shift()
          const batch = `${type}:${chunk[0].key}..${chunk.at(-1).key}`
          if (stopped) return
          let inputs
          try {
            inputs = chunk.map((r) => build[type](r))
          } catch (error) {
            record(batch, "failed", error.message)
            say(`${batch} failed: ${error.message}`)
            stopped = true
            return
          }
          record(batch, "started", chunk.map((r) => keyOf(type, r.key)).join(";"))
          try {
            const result = await call("POST", `/crm/v3/objects/${type}/batch/create`, { inputs })
            const bySig = new Map()
            for (const r of result.results) {
              const sig = signature[type](r.properties)
              bySig.set(sig, [...(bySig.get(sig) ?? []), r.id])
            }
            const pairs = chunk.map((r, i) => {
              const sig = signature[type](inputs[i].properties)
              const id = bySig.get(sig)?.shift() ?? result.results[i]?.id
              return [keyOf(type, r.key), id]
            })
            for (const [k, id] of pairs) ids.set(k, id)
            record(batch, "done", pairs.map(([k, id]) => `${k}=${id}`).join(";"))
            created += pairs.length
            if (result.errors?.length)
              say(`${batch}: ${result.errors.length} errors: ${JSON.stringify(result.errors[0]).slice(0, 300)}`)
          } catch (error) {
            record(batch, "failed", error.message)
            say(`${batch} failed: ${error.message}`)
            // A 402 is the account's record limit: every later create is refused too, so the whole run stops.
            if (error.status === 402) stopped = true
            if (error.status && error.status < 500 && error.status !== 429) queue.length = 0
          }
          batches++
          if (batches % 10 === 0 || Date.now() - lastPrint > 10_000) {
            say(`${batches} batches, ${created} records (${type})`)
            lastPrint = Date.now()
          }
        }
      }),
    )
  }
  writeFileSync(IDS_JSON, `${JSON.stringify(Object.fromEntries(ids), null, 1)}\n`)
  const counts = {}
  for (const type of Object.keys(data)) counts[type] = data[type].filter((r) => ids.has(keyOf(type, r.key))).length
  say(`seeded: ${JSON.stringify(counts)}; ids in ${IDS_JSON}`)
}

const PROPS = {
  contacts: ["firstname", "lastname", "city", "phone", "email"],
  companies: ["name", "city", "domain"],
  deals: ["dealname", "amount", "dealstage", "closedate", "closed_lost_reason"],
  notes: ["hs_note_body", "hs_timestamp"],
  tasks: ["hs_task_subject", "hs_timestamp", "hs_task_status"],
  calls: ["hs_call_title", "hs_call_body", "hs_timestamp"],
  meetings: ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time"],
}

const verify = async () => {
  let failures = 0
  for (const [question, checks] of Object.entries(NEEDLES)) {
    for (const check of checks) {
      const id = ids.get(keyOf(check.object, check.key))
      const problems = []
      if (!id) problems.push("not seeded")
      else {
        const got = await call(
          "GET",
          `/crm/v3/objects/${check.object}/${id}?properties=${PROPS[check.object].join(",")}`,
        )
        for (const [prop, want] of Object.entries(check.expect)) {
          const value = String(got.properties[prop] ?? "")
          if (!value.includes(want))
            problems.push(`${prop}=${JSON.stringify(value.slice(0, 60))}, want ${JSON.stringify(want)}`)
        }
        for (const [target, key] of check.assoc) {
          const targetId = ids.get(keyOf(target, key))
          const links = await call("GET", `/crm/v4/objects/${check.object}/${id}/associations/${target}`)
          if (!links.results.some((l) => String(l.toObjectId) === targetId))
            problems.push(`no association to ${target} ${key}`)
        }
      }
      failures += problems.length ? 1 : 0
      say(
        `${question} ${check.object} ${check.key} ${id ?? "-"} ${problems.length ? `FAIL ${problems.join("; ")}` : "ok"}`,
      )
    }
  }
  say(failures ? `${failures} needles failed` : "every needle reads back as the key says")
  if (failures) process.exitCode = 1
}

// The first searches a careful agent would run with HubSpot's own search, and where the needle lands in them.
const PROBES = [
  ["L1", "contacts", { query: "Хофман" }, "x-hoffmann-jens"],
  ["L1", "contacts", { query: "Hofmann" }, "x-hoffmann-jens"],
  ["L1", "contacts", { query: "Hoffmann" }, "x-hoffmann-jens"],
  ["L2", "companies", { query: "Schmidt" }, "x-schmid-soehne"],
  ["L2", "companies", { query: "Söhne" }, "x-schmid-soehne"],
  ["L2", "companies", { query: "Schmid" }, "x-schmid-soehne"],
  ["L3", "contacts", { query: "Хименес" }, "x-gimenez-lucia"],
  ["L3", "contacts", { query: "Jimenez" }, "x-gimenez-lucia"],
  ["L3", "contacts", { query: "Gimenez" }, "x-gimenez-lucia"],
  ["L3", "contacts", { query: "Giménez" }, "x-gimenez-lucia"],
  ["L4", "notes", { query: "сроки" }, "x-n-kama"],
  ["L4", "notes", { query: "delay" }, "x-n-pennine"],
  ["L4", "notes", { query: "slipped" }, "x-n-pennine"],
  ["L4", "notes", { query: "недовольна" }, "x-n-kama"],
  ["L5", "notes", { query: "kazakh" }, "x-n-irtysh"],
  ["L5", "notes", { query: "казахском" }, "x-n-irtysh"],
  ["L5", "notes", { tokens: ["hs_note_body", "казах*"] }, "x-n-irtysh"],
  ["L6", "companies", { query: "Феррара" }, "x-ferraro"],
  ["L6", "companies", { query: "Ferrara" }, "x-ferraro"],
  ["L6", "tasks", { query: "Ferraro" }, "x-t-ferraro"],
  ["L7", "notes", { query: "конкурент" }, "x-n-volna"],
  ["L7", "notes", { query: "cheaper" }, "x-n-kestrel"],
  ["L7", "notes", { query: "дешевле" }, "x-n-volna"],
  ["L8", "contacts", { query: "Петров" }, "x-petrov-alexandr"],
  ["L8", "meetings", { query: "Петров" }, "x-m-volga"],
  ["L9", "notes", { query: "предоплату" }, "x-n-prepay-2"],
  ["L10", "calls", { query: "Bilbao" }, "x-c-itsasoa"],
  ["L10", "calls", { query: "frigoríficas" }, "x-c-itsasoa"],
  ["L10", "companies", { query: "Bilbao" }, "x-itsasoa"],
]
const probe = async () => {
  for (const [question, object, how, needle] of PROBES) {
    const body = how.query
      ? { query: how.query, limit: 100, properties: ["hs_object_id"] }
      : {
          filterGroups: [
            { filters: [{ propertyName: how.tokens[0], operator: "CONTAINS_TOKEN", value: how.tokens[1] }] },
          ],
          limit: 100,
        }
    const found = await call("POST", `/crm/v3/objects/${object}/search`, body)
    const at = found.results.findIndex((r) => r.id === ids.get(keyOf(object, needle)))
    say(
      `${question} ${object} ${JSON.stringify(how)}: ${found.total} hits, needle ${at < 0 ? "not in the first 100" : `#${at + 1}`}`,
    )
  }
}

// Archives contacts this seed made that the generator no longer plans (it was shrunk to fit the account's limit).
// Only ids from this seed's own status CSV are touched.
const archiveExtra = async () => {
  const planned = new Set(data.contacts.map((r) => keyOf("contacts", r.key)))
  const extra = [...ids].filter(([k]) => k.startsWith("contacts:") && !planned.has(k))
  for (let i = 0; i < extra.length; i += BATCH) {
    const chunk = extra.slice(i, i + BATCH)
    await call("POST", "/crm/v3/objects/contacts/batch/archive", { inputs: chunk.map(([, id]) => ({ id })) })
    record(`contacts:archive-${i / BATCH}`, "archived", chunk.map(([k, id]) => `${k}=${id}`).join(";"))
  }
  say(`archived ${extra.length} contacts the generator no longer plans`)
}

const reconcile = async () => {
  await seed({ reconcileOnly: true })
}

await { seed, verify, probe, "archive-extra": archiveExtra, reconcile }[command]()
