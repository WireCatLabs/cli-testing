#!/usr/bin/env node
// Seeds the invented sales account of seed-data.mjs into a HubSpot test account, through HubSpot's API directly, so
// that no contestant's tool shapes the data. Idempotent: a record the status CSV marks done is skipped, and a company,
// contact or deal already in the account (same domain, e-mail or name) is reused, not created again.
// Usage: node seed.mjs [--account 149800303]
// The key is read from the keyring in this process (secret-tool) and never printed.
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import * as data from "./seed-data.mjs"

const say = (line) => process.stdout.write(`${line}\n`)
const warn = (line) => process.stderr.write(`${line}\n`)
const RUN = process.env.HUBSPOT_AGENTS_RUN ?? join(homedir(), ".cache/wirecat-hubspot-agents")
const STATUS_CSV = join(RUN, "seed-status.csv")
const IDS_JSON = join(RUN, "seed-ids.json")
const KEYRING = ["service", "hubspot-cli-live", "account", process.env.HUBSPOT_AGENTS_KEYRING_ACCOUNT ?? "wirecat"]
const API = "https://api.hubapi.com"
const POOL = 4
const expectedAccount = process.argv.includes("--account")
  ? process.argv[process.argv.indexOf("--account") + 1]
  : "149800303"

const token = execFileSync("secret-tool", ["lookup", ...KEYRING], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim()
if (!token) throw new Error(`no keyring entry ${KEYRING.join(" ")}`)

mkdirSync(RUN, { recursive: true })
const done = new Map()
if (existsSync(STATUS_CSV)) {
  for (const line of readFileSync(STATUS_CSV, "utf8").trim().split("\n").slice(1)) {
    const [id, status, detail] = line.split(",")
    if (status === "done") done.set(id, detail)
  }
} else writeFileSync(STATUS_CSV, "id,status,detail,time\n")
say(`status: ${STATUS_CSV}`)
const record = (id, status, detail) => {
  appendFileSync(
    STATUS_CSV,
    `${id},${status},${String(detail).replaceAll(",", ";").replaceAll("\n", " ")},${new Date().toISOString()}\n`,
  )
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const call = async (method, path, body) => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status === 429 && attempt < 6) {
      await sleep(Number(response.headers.get("retry-after") ?? 2) * 1000 + 500)
      continue
    }
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) {
      const error = new Error(
        `${method} ${path.split("?")[0]} ${response.status}: ${json.message ?? text}`.slice(0, 300),
      )
      error.status = response.status
      throw error
    }
    return json
  }
}

let progress = 0
let lastPrint = Date.now()
const tick = (what) => {
  progress++
  if (progress % 10 === 0 || Date.now() - lastPrint > 10_000) {
    say(`${progress} records (${what})`)
    lastPrint = Date.now()
  }
}

const pool = async (items, work) => {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: POOL }, async () => {
      while (queue.length) await work(queue.shift())
    }),
  )
}

const ids = {}
const once = async (id, make) => {
  if (done.has(id)) {
    ids[id] = done.get(id)
    return
  }
  try {
    ids[id] = String(await make())
    record(id, "done", ids[id])
  } catch (error) {
    record(id, "failed", error.message)
    warn(`${id}: ${error.message}`)
  }
  tick(id.split(":")[0])
}

const findOne = async (object, property, value) => {
  const found = await call("POST", `/crm/v3/objects/${object}/search`, {
    filterGroups: [{ filters: [{ propertyName: property, operator: "EQ", value }] }],
    limit: 2,
    properties: [property],
  })
  return found.results[0]?.id
}

const ASSOC = {
  contactCompany: 1,
  dealCompany: 5,
  dealContact: 3,
  note: { contacts: 202, companies: 190, deals: 214 },
  task: { contacts: 204, companies: 192, deals: 216 },
  call: { contacts: 194, companies: 182, deals: 206 },
  meeting: { contacts: 200, companies: 188, deals: 212 },
}
const to = (id, typeId) => ({
  to: { id },
  types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }],
})

const main = async () => {
  const info = await call("GET", "/account-info/v3/details")
  if (String(info.portalId) !== expectedAccount)
    throw new Error(`the key belongs to ${info.portalId}, not ${expectedAccount}`)
  const owner = (await call("GET", "/crm/v3/owners?limit=10")).results[0]?.id

  const dealPipelines = async () => (await call("GET", "/crm/v3/pipelines/deals")).results
  let pipelines = await dealPipelines()
  for (const one of data.pipelines) {
    if (pipelines.some((p) => p.label === one.label)) continue
    await once(`pipeline:${one.key}`, async () => {
      const made = await call("POST", "/crm/v3/pipelines/deals", {
        label: one.label,
        displayOrder: 1,
        stages: one.stages.map((label, i) => ({
          label,
          displayOrder: i,
          metadata: {
            probability: label === "Closed Won" ? "1.0" : label === "Closed Lost" ? "0.0" : String((i + 1) / 10),
            ...(label.startsWith("Closed") ? { isClosed: "true" } : {}),
          },
        })),
      })
      return made.id
    })
  }
  pipelines = await dealPipelines()
  const main = pipelines.find((p) => p.id === "default") ?? pipelines[0]
  const stageOf = (one) => {
    const own = pipelines.find((p) => p.label === data.pipelines.find((d) => d.key === one.pipeline)?.label)
    const pipeline = own ?? main
    const label = own ? (one.partnerStage ?? one.stage) : one.stage
    const stage = pipeline.stages.find((s) => s.label === label)
    if (!stage) throw new Error(`no stage ${label} in ${pipeline.label}`)
    return { pipeline: pipeline.id, dealstage: stage.id }
  }

  await pool(data.companies, (one) =>
    once(`company:${one.key}`, async () => {
      const existing = await findOne("companies", "domain", one.domain)
      if (existing) return existing
      const properties = {
        name: one.name,
        domain: one.domain,
        city: one.city,
        phone: one.phone,
        industry: one.industry,
        hubspot_owner_id: owner,
      }
      try {
        return (await call("POST", "/crm/v3/objects/companies", { properties })).id
      } catch (error) {
        if (error.status !== 400) throw error
        delete properties.industry
        return (await call("POST", "/crm/v3/objects/companies", { properties })).id
      }
    }),
  )

  await pool(data.contacts, (one) =>
    once(`contact:${one.key}`, async () => {
      const existing = await findOne("contacts", "email", one.email)
      if (existing) return existing
      const company = ids[`company:${one.company}`]
      return (
        await call("POST", "/crm/v3/objects/contacts", {
          properties: {
            firstname: one.first,
            lastname: one.last,
            email: one.email,
            phone: one.phone,
            jobtitle: one.title,
            hubspot_owner_id: owner,
          },
          associations: company ? [to(company, ASSOC.contactCompany)] : [],
        })
      ).id
    }),
  )

  await pool(data.deals, (one) =>
    once(`deal:${one.key}`, async () => {
      const existing = await findOne("deals", "dealname", one.name)
      if (existing) return existing
      const properties = {
        dealname: one.name,
        amount: String(one.amount),
        closedate: `${one.close}T12:00:00Z`,
        hubspot_owner_id: owner,
        ...stageOf(one),
        ...(one.lost ? { closed_lost_reason: one.lost } : {}),
      }
      const associations = [
        to(ids[`company:${one.company}`], ASSOC.dealCompany),
        ...one.contacts.map((c) => to(ids[`contact:${c}`], ASSOC.dealContact)),
      ].filter((a) => a.to.id)
      return (await call("POST", "/crm/v3/objects/deals", { properties, associations })).id
    }),
  )

  const linksOf = (kind, one) => {
    const company = data.deals.find((d) => d.key === one.deal)?.company
    return [
      to(ids[`deal:${one.deal}`], ASSOC[kind].deals),
      to(ids[`company:${company}`], ASSOC[kind].companies),
      ...one.contacts.map((c) => to(ids[`contact:${c}`], ASSOC[kind].contacts)),
    ].filter((a) => a.to.id)
  }
  const activities = [
    ...data.notes.map((one) => ["note", "notes", one, { hs_timestamp: one.at, hs_note_body: one.body }]),
    ...data.tasks.map((one) => [
      "task",
      "tasks",
      one,
      {
        hs_timestamp: one.due,
        hs_task_subject: one.subject,
        hs_task_status: one.status,
        hs_task_priority: one.priority,
        hs_task_type: "TODO",
      },
    ]),
    ...data.calls.map((one) => [
      "call",
      "calls",
      one,
      {
        hs_timestamp: one.at,
        hs_call_title: one.title,
        hs_call_body: one.body,
        hs_call_duration: String(one.minutes * 60_000),
        hs_call_status: "COMPLETED",
        hs_call_direction: "OUTBOUND",
      },
    ]),
    ...data.meetings.map((one) => [
      "meeting",
      "meetings",
      one,
      {
        hs_timestamp: one.start,
        hs_meeting_title: one.title,
        hs_meeting_body: one.body,
        hs_meeting_start_time: one.start,
        hs_meeting_end_time: one.end,
        hs_meeting_outcome: Date.parse(one.start) < Date.parse("2026-11-23") ? "COMPLETED" : "SCHEDULED",
      },
    ]),
  ]
  await pool(activities, ([kind, object, one, properties]) =>
    once(`${kind}:${one.key}`, async () => {
      const made = await call("POST", `/crm/v3/objects/${object}`, {
        properties: { ...properties, hubspot_owner_id: owner },
        associations: linksOf(kind, one),
      })
      return made.id
    }),
  )

  writeFileSync(IDS_JSON, `${JSON.stringify(ids, null, 2)}\n`)
  const failed = [...readFileSync(STATUS_CSV, "utf8").matchAll(/^([^,]+),failed,/gm)]
    .map((m) => m[1])
    .filter((id) => !ids[id])
  say(`${Object.keys(ids).length} records; ids in ${IDS_JSON}${failed.length ? `; failed: ${failed.join(" ")}` : ""}`)
}

await main()
