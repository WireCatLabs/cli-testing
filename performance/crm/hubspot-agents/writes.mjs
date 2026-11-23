#!/usr/bin/env node
// Checks the five write tasks against the account, or puts their records back as the seed left them, through
// HubSpot's API directly.
//   node writes.mjs verify --since <ISO time the contestant's write run started>   prints one JSON line per task
//   node writes.mjs reset --since <ISO time>       stages, lost reason and phone back; notes and tasks made since archived
// The key is read from the keyring in this process (secret-tool) and never printed.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import * as data from "./seed-data.mjs"

const say = (line) => process.stdout.write(`${line}\n`)
const warn = (line) => process.stderr.write(`${line}\n`)
const RUN = process.env.HUBSPOT_AGENTS_RUN ?? join(homedir(), ".cache/wirecat-hubspot-agents")
const IDS = JSON.parse(readFileSync(join(RUN, "seed-ids.json"), "utf8"))
const KEYRING = ["service", "hubspot-cli-live", "account", process.env.HUBSPOT_AGENTS_KEYRING_ACCOUNT ?? "wirecat"]
const API = "https://api.hubapi.com"

const [mode, , since] = process.argv.slice(2)
if (!["verify", "reset"].includes(mode) || !since) {
  warn("usage: node writes.mjs <verify|reset> --since <ISO time>")
  process.exit(2)
}
const token = execFileSync("secret-tool", ["lookup", ...KEYRING], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim()

const call = async (method, path, body) => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} ${response.status}: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : {}
  }
}

const pipeline = await call("GET", "/crm/v3/pipelines/deals/default")
const stageId = (label) => pipeline.stages.find((s) => s.label === label).id
const stageLabel = (id) => pipeline.stages.find((s) => s.id === id)?.label ?? id

const deal = (key) =>
  call("GET", `/crm/v3/objects/deals/${IDS[`deal:${key}`]}?properties=dealstage,closed_lost_reason,dealname`)
const contact = (key) =>
  call("GET", `/crm/v3/objects/contacts/${IDS[`contact:${key}`]}?properties=phone,mobilephone,firstname,lastname`)
const linked = async (object, id, kind) =>
  (await call("GET", `/crm/v4/objects/${object}/${id}/associations/${kind}?limit=100`)).results.map((r) =>
    String(r.toObjectId),
  )
const madeSince = async (kind, ids, properties) => {
  if (!ids.length) return []
  const read = await call("POST", `/crm/v3/objects/${kind}/batch/read`, {
    inputs: ids.map((id) => ({ id })),
    properties: [...properties, "hs_createdate"],
  })
  return read.results.filter((r) => Date.parse(r.createdAt) >= Date.parse(since))
}
const digits = (phone) => (phone ?? "").replace(/\D/g, "")

const newNotes = async () =>
  madeSince("notes", await linked("deals", IDS["deal:kedr-catalog"], "notes"), ["hs_note_body"])
const newTasks = async () => {
  const ids = new Set([
    ...(await linked("contacts", IDS["contact:orlova"], "tasks")),
    ...(await linked("deals", IDS["deal:medv-booking"], "tasks")),
  ])
  return madeSince("tasks", [...ids], ["hs_task_subject", "hs_task_body", "hs_timestamp", "hs_task_status"])
}

// Seed values of every deal and contact, to see that a write changed nothing it was not asked to.
const drift = async () => {
  const deals = await call("POST", "/crm/v3/objects/deals/batch/read", {
    inputs: data.deals.map((d) => ({ id: IDS[`deal:${d.key}`] })),
    properties: ["dealstage"],
  })
  const contacts = await call("POST", "/crm/v3/objects/contacts/batch/read", {
    inputs: data.contacts.map((c) => ({ id: IDS[`contact:${c.key}`] })),
    properties: ["phone"],
  })
  const changed = []
  for (const d of data.deals) {
    const now = deals.results.find((r) => r.id === IDS[`deal:${d.key}`])?.properties.dealstage
    if (now !== stageId(d.stage)) changed.push({ deal: d.key, stage: stageLabel(now), seed: d.stage })
  }
  for (const c of data.contacts) {
    const now = contacts.results.find((r) => r.id === IDS[`contact:${c.key}`])?.properties.phone
    if (digits(now) !== digits(c.phone)) changed.push({ contact: c.key, phone: now, seed: c.phone })
  }
  return changed
}

if (mode === "verify") {
  const notes = await newNotes()
  const w1 = notes.some(
    (n) =>
      /20/.test(n.properties.hs_note_body) &&
      /100/.test(n.properties.hs_note_body) &&
      /10\s*(декабр|dec)|10[./]12|12-10/i.test(n.properties.hs_note_body),
  )
  const tasks = await newTasks()
  const w2 = tasks.some(
    (t) => t.properties.hs_timestamp?.startsWith("2026-11-27") && t.properties.hs_task_status !== "COMPLETED",
  )
  const route = await deal("alfayug-route")
  const partner = await deal("datanest-partner")
  const belova = await contact("belova")
  const changed = await drift()
  const expected = new Set(["alfayug-route", "datanest-partner", "belova"])
  const other = changed.filter((c) => !expected.has(c.deal ?? c.contact))
  const rows = [
    { id: "W1", pass: w1, detail: notes.map((n) => n.properties.hs_note_body.slice(0, 160)) },
    {
      id: "W2",
      pass: w2,
      detail: tasks.map(
        (t) => `${t.properties.hs_timestamp} ${t.properties.hs_task_status} ${t.properties.hs_task_subject}`,
      ),
    },
    {
      id: "W3",
      pass: stageLabel(route.properties.dealstage) === "Solution Design" && !other.some((c) => c.deal === "alfa-wms"),
      detail: stageLabel(route.properties.dealstage),
    },
    {
      id: "W4",
      pass:
        partner.properties.dealstage === "closedlost" &&
        /партн|partner/i.test(partner.properties.closed_lost_reason ?? ""),
      detail: `${stageLabel(partner.properties.dealstage)}: ${partner.properties.closed_lost_reason ?? ""}`,
    },
    {
      id: "W5",
      pass:
        digits(belova.properties.phone) === "79164509999" || digits(belova.properties.mobilephone) === "79164509999",
      detail: `phone ${belova.properties.phone} mobile ${belova.properties.mobilephone ?? ""}`,
    },
    { id: "other", pass: other.length === 0, detail: other },
  ]
  for (const row of rows) say(JSON.stringify(row))
} else {
  for (const d of data.deals) {
    const now = await deal(d.key)
    const lost = d.lost ?? ""
    if (now.properties.dealstage !== stageId(d.stage) || (now.properties.closed_lost_reason ?? "") !== lost) {
      await call("PATCH", `/crm/v3/objects/deals/${IDS[`deal:${d.key}`]}`, {
        properties: { dealstage: stageId(d.stage), closed_lost_reason: lost },
      })
      say(`deal ${d.key}: back to ${d.stage}`)
    }
  }
  for (const c of data.contacts) {
    const now = await contact(c.key)
    if (digits(now.properties.phone) !== digits(c.phone) || now.properties.mobilephone) {
      await call("PATCH", `/crm/v3/objects/contacts/${IDS[`contact:${c.key}`]}`, {
        properties: { phone: c.phone, mobilephone: "" },
      })
      say(`contact ${c.key}: phone back`)
    }
  }
  for (const [kind, made] of [
    ["notes", await newNotes()],
    ["tasks", await newTasks()],
  ]) {
    for (const one of made) {
      await call("DELETE", `/crm/v3/objects/${kind}/${one.id}`)
      say(`${kind} ${one.id}: archived`)
    }
  }
  say("reset done")
}
