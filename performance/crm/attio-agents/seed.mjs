#!/usr/bin/env node
// Seeds the invented sales account of seed-data.mjs into an Attio workspace through Attio's REST API directly, so that
// no contestant's tool shapes the data. Idempotent: an entry the status CSV marks done is skipped, and a company,
// person or deal already in the workspace under the same marked name is reused. `--delete` removes every record,
// note and task the CSV lists as done, newest first, and archives the two deal attributes the seed added.
// Usage: node seed.mjs [--delete]
// The token is read from the keyring in this process (secret-tool) and never printed.
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import * as data from "./seed-data.mjs"

const say = (line) => process.stdout.write(`${line}\n`)
const warn = (line) => process.stderr.write(`${line}\n`)
const RUN = process.env.ATTIO_AGENTS_RUN ?? join(homedir(), ".cache/wirecat-attio-agents")
const STATUS_CSV = join(RUN, "seed-status.csv")
const IDS_JSON = join(RUN, "seed-ids.json")
const KEYRING = ["service", "attio", "account", process.env.ATTIO_AGENTS_KEYRING_ACCOUNT ?? "leemour"]
const API = "https://api.attio.com/v2"
// Attio allows 25 writes a second per workspace (docs.attio.com/rest-api/guides/rate-limiting); 5 at a time stays
// well under it, and a 429 waits for the time its Retry-After names.
const POOL = 5
const MARK = (name) => `${name} ${data.MARKER}`
const ATTRIBUTES = [
  { api_slug: "close_date", title: "Close date", type: "date", description: "Expected or actual close date" },
  { api_slug: "lost_reason", title: "Lost reason", type: "text", description: "Why the deal was lost" },
]

const token = execFileSync("secret-tool", ["lookup", ...KEYRING], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim()
if (!token) throw new Error(`no keyring entry ${KEYRING.join(" ")}`)

mkdirSync(RUN, { recursive: true })
const rows = () =>
  existsSync(STATUS_CSV)
    ? readFileSync(STATUS_CSV, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(","))
    : []
const done = new Map()
for (const [id, status, detail] of rows()) {
  if (status === "done") done.set(id, detail)
  if (status === "deleted") done.delete(id)
}
if (!existsSync(STATUS_CSV)) writeFileSync(STATUS_CSV, "id,status,detail,time\n")
say(`status: ${STATUS_CSV}`)
const record = (id, status, detail) =>
  appendFileSync(
    STATUS_CSV,
    `${id},${status},${String(detail).replaceAll(",", ";").replaceAll("\n", " ")},${new Date().toISOString()}\n`,
  )

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const call = async (method, path, body) => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status === 429 && attempt < 8) {
      const until = Date.parse(response.headers.get("retry-after") ?? "")
      await sleep(Number.isNaN(until) ? 1500 : Math.max(until - Date.now(), 0) + 250)
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
    say(`${progress} entries (${what})`)
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

const findByName = async (object, name) => {
  const filter = object === "people" ? { name: { full_name: { $eq: name } } } : { name: { $eq: name } }
  const found = await call("POST", `/objects/${object}/records/query`, { filter, limit: 1 })
  return found.data[0]?.id.record_id
}
const ref = (object, id) => ({ target_object: object, target_record_id: id })
const countryOf = (phone) => ({ "+7": "RU", "+34": "ES", "+44": "GB", "+351": "PT", "+371": "LV" })[phone.split(" ")[0]]

const remove = async () => {
  const listed = [...done].map(([id, detail]) => [id, "done", detail])
  const order = ["task", "note", "deal", "person", "company"]
  for (const kind of order) {
    const mine = listed.filter(([id]) => id.startsWith(`${kind}:`))
    await pool(mine, async ([id, , recordId]) => {
      const path =
        kind === "task"
          ? `/tasks/${recordId}`
          : kind === "note"
            ? `/notes/${recordId}`
            : `/objects/${{ deal: "deals", person: "people", company: "companies" }[kind]}/records/${recordId}`
      try {
        await call("DELETE", path)
        record(id, "deleted", recordId)
      } catch (error) {
        record(id, error.status === 404 ? "deleted" : "delete-failed", error.message)
      }
      tick(`delete ${kind}`)
    })
  }
  for (const one of ATTRIBUTES) {
    if (!done.has(`attribute:${one.api_slug}`)) continue
    await call("PATCH", `/objects/deals/attributes/${one.api_slug}`, { data: { is_archived: true } })
    record(`attribute:${one.api_slug}`, "deleted", "archived")
  }
  say("delete done")
}

const seed = async () => {
  const self = await call("GET", "/self")
  if (!String(self.scope).includes("record_permission:read-write")) throw new Error("the token cannot write records")
  const member = (await call("GET", "/workspace_members")).data.find(
    (m) => m.id.workspace_member_id === self.authorized_by_workspace_member_id,
  )

  const existing = (await call("GET", "/objects/deals/attributes")).data.map((a) => a.api_slug)
  for (const one of ATTRIBUTES) {
    await once(`attribute:${one.api_slug}`, async () => {
      if (existing.includes(one.api_slug)) return "existed"
      await call("POST", "/objects/deals/attributes", {
        data: { ...one, is_required: false, is_unique: false, is_multiselect: false, config: {} },
      })
      return "created"
    })
  }

  await pool(data.companies, (one) =>
    once(`company:${one.key}`, async () => {
      const name = MARK(one.name)
      const found = await findByName("companies", name)
      if (found) return found
      const made = await call("POST", "/objects/companies/records", {
        data: { values: { name, description: one.about } },
      })
      return made.data.id.record_id
    }),
  )

  await pool(data.people, (one) =>
    once(`person:${one.key}`, async () => {
      const full = MARK(`${one.first} ${one.last}`)
      const found = await findByName("people", full)
      if (found) return found
      const values = {
        name: [{ first_name: one.first, last_name: one.last, full_name: full }],
        job_title: one.title,
        company: [ref("companies", ids[`company:${one.company}`])],
        phone_numbers: [{ original_phone_number: one.phone, country_code: countryOf(one.phone) }],
      }
      try {
        return (await call("POST", "/objects/people/records", { data: { values } })).data.id.record_id
      } catch (error) {
        if (error.status !== 400) throw error
        // A number Attio's phone check refuses: the person is still worth having, without it.
        warn(`${one.key}: phone refused, created without it`)
        delete values.phone_numbers
        return (await call("POST", "/objects/people/records", { data: { values } })).data.id.record_id
      }
    }),
  )

  await pool(data.deals, (one) =>
    once(`deal:${one.key}`, async () => {
      const name = MARK(one.name)
      const found = await findByName("deals", name)
      if (found) return found
      const values = {
        name,
        stage: one.stage,
        value: one.amount,
        owner: member.email_address,
        associated_company: [ref("companies", ids[`company:${one.company}`])],
        associated_people: one.people.map((p) => ref("people", ids[`person:${p}`])),
        close_date: one.close,
        ...(one.lost ? { lost_reason: one.lost } : {}),
      }
      return (await call("POST", "/objects/deals/records", { data: { values } })).data.id.record_id
    }),
  )

  await pool(data.notes, (one) =>
    once(`note:${one.key}`, async () => {
      const parent = ids[`deal:${one.deal}`]
      const title = MARK(one.title)
      const there = await call("GET", `/notes?parent_object=deals&parent_record_id=${parent}&limit=50`)
      const found = there.data.find((n) => n.title === title)
      if (found) return found.id.note_id
      const made = await call("POST", "/notes", {
        data: {
          parent_object: "deals",
          parent_record_id: parent,
          title,
          format: "plaintext",
          content: one.body,
          created_at: one.at,
        },
      })
      return made.data.id.note_id
    }),
  )

  await pool(data.tasks, (one) =>
    once(`task:${one.key}`, async () => {
      const made = await call("POST", "/tasks", {
        data: {
          content: one.text,
          format: "plaintext",
          deadline_at: one.due,
          is_completed: Boolean(one.done),
          linked_records: [ref("deals", ids[`deal:${one.deal}`])],
          assignees: [
            { referenced_actor_type: "workspace-member", referenced_actor_id: member.id.workspace_member_id },
          ],
        },
      })
      return made.data.id.task_id
    }),
  )

  writeFileSync(IDS_JSON, `${JSON.stringify(ids, null, 2)}\n`)
  const failed = rows()
    .filter(([id, status]) => status === "failed" && !ids[id])
    .map(([id]) => id)
  say(`${Object.keys(ids).length} entries; ids in ${IDS_JSON}${failed.length ? `; failed: ${failed.join(" ")}` : ""}`)
}

await (process.argv.includes("--delete") ? remove() : seed())
