import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath, pathToFileURL } from "node:url"
import { docExamples } from "./docs.mjs"
import { searchTools } from "./mcp.mjs"
import { HOST } from "./portal.mjs"

const [prefix, output, ...rest] = process.argv.slice(2)
const option = (name) => {
  const at = rest.indexOf(name)
  return at === -1 ? undefined : rest[at + 1]
}
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON --memo-docs DIR --b24-docs DIR [--build FILE]")
const packages = join(resolve(prefix), "node_modules/@wirecat")
const b24Package = join(packages, "bitrix24-cli")
const memoPackage = join(packages, "cli-memo")
const b24Bin = join(b24Package, "dist/bin/b24.js")
const memoBin = join(memoPackage, "dist/bin/memo.js")
const here = fileURLToPath(new URL(".", import.meta.url))
const guard = fileURLToPath(new URL("../../documents/drive-shared-store/guard.mjs", import.meta.url))
const portalPreload = join(here, "portal.mjs")
const worker = process.env.CRM_RELATIONSHIPS_WORKER

const WRITES = /^memo (?:\w+ )?(?:relationships (?:add|end|update)|groups (?:add|remove|move)|deals update)/

const DAY = 86_400_000
const OPENED = Date.UTC(2026, 9, 1, 6)
const TELEGRAM = { provider: "telegram", account: "300" }
const PERSONAL_TELEGRAM = { provider: "telegram", account: "100" }
const MAIL = { provider: "email", account: "owner@northstar.example" }
const CALENDAR = { provider: "google-calendar", account: "owner@northstar.example" }
const PORTAL = `bitrix24:${HOST}`

// The non-CRM half of the scenario goes in through the store calls a messenger, mail or calendar import makes, from
// the cli-core memo itself runs on; no CLI here imports Telegram, mail or a calendar without a real account.
const storeOf = async () => {
  const require = createRequire(join(memoPackage, "package.json"))
  return import(pathToFileURL(require.resolve("@wirecat/cli-core/store")))
}
const workers = {
  seed: async (store) => {
    const at = (days) => new Date(OPENED + days * DAY).toISOString()
    await store.accounts.saveAccount(TELEGRAM, { name: null })
    await store.chats.saveChats(TELEGRAM, [
      { id: "201", title: "Alice", kind: "dialog", unreadCount: 0, lastMessageAt: at(3), participantsCount: null },
    ])
    await store.people.savePeople(TELEGRAM, [{ id: "201", name: "Alice" }])
    await store.messages.saveMessages(
      TELEGRAM,
      "201",
      [
        {
          ...{ id: "1", chatId: "201", senderId: "201", senderName: "Alice", timestamp: at(3), editedAt: null },
          ...{ text: "Can we renew Atlas before December?", outgoing: false, attachments: [], replyTo: null },
          ...{ forwardedFrom: null, reactions: null },
        },
      ],
      { via: "history" },
    )
    await store.roster.saveMembers(TELEGRAM, "201", ["201", "300"])
    await store.accounts.saveAccount(PERSONAL_TELEGRAM, { name: null })
    await store.chats.saveChats(PERSONAL_TELEGRAM, [
      { id: "401", title: "Rita", kind: "dialog", unreadCount: 0, lastMessageAt: at(4), participantsCount: null },
    ])
    await store.people.savePeople(PERSONAL_TELEGRAM, [{ id: "401", name: "Rita Example" }])
    await store.messages.saveMessages(
      PERSONAL_TELEGRAM,
      "401",
      [
        {
          ...{ id: "1", chatId: "401", senderId: "401", senderName: "Rita Example", timestamp: at(4), editedAt: null },
          ...{ text: "Weekend hike on Saturday?", outgoing: false, attachments: [], replyTo: null },
          ...{ forwardedFrom: null, reactions: null },
        },
      ],
      { via: "history" },
    )
    const mail = await store.accounts.saveAccount(MAIL, { name: null })
    const thread = (externalId, from, name, subject, days) =>
      store.mail.saveThread({
        accountId: mail,
        externalId,
        now: Date.now(),
        emails: [
          {
            ...{ externalId: `<${externalId}@acme.example>`, subject, from: { address: from, name } },
            ...{ to: [{ address: MAIL.account, name: null }], sentAt: OPENED + days * DAY },
            ...{ receivedAt: OPENED + days * DAY, bodyText: `${subject}, synthetic.`, outgoing: false },
          },
        ],
      })
    await thread("renewal-terms", "bob@acme.example", "Bob", "Renewal terms", 5)
    await thread("office-hours", "carol@acme.example", "Front desk", "Office hours", 6)
    await store.people.savePeople(MAIL, [
      { id: "bob@acme.example", name: "Bob" },
      { id: "carol@acme.example", name: "Front desk" },
    ])
    const calendarAccount = await store.accounts.saveAccount(CALENDAR, { name: null })
    const [calendar] = await store.calendar.saveCalendars(
      calendarAccount,
      [
        {
          ...{ externalId: "primary", title: "Work", timezone: "UTC", accessRole: "owner", primary: true },
          syncByDefault: true,
        },
      ],
      Date.now(),
    )
    await store.calendar.saveEntries(
      calendar.id,
      [
        {
          ...{ externalId: "renewal-call", kind: "single", status: "confirmed", title: "Acme renewal call (Zoom)" },
          ...{ location: "https://zoom.example/j/1", startsAt: OPENED + 7 * DAY, endsAt: OPENED + 7 * DAY + 3_600_000 },
          participants: [
            { email: "alice@acme.example", name: "Alice" },
            { email: "bob@acme.example", name: "Bob" },
            { email: "emma@northstar.example", name: "Emma" },
          ],
        },
      ],
      Date.now(),
    )
    return {}
  },
  // memo has no owner command for joining or separating identities; tg and max do this through the same store calls.
  link: async (store) => {
    await store.people.linkIdentities(
      { provider: "email", id: "alice@acme.example" },
      { provider: "telegram", id: "201" },
      { method: "manual", by: "owner" },
    )
    return {}
  },
  unlink: async (store) => {
    await store.people.unlinkIdentity(
      { provider: "email", id: "carol@acme.example" },
      { method: "manual", by: "owner" },
    )
    return {}
  },
}

if (worker) {
  const { openStore } = await storeOf()
  const store = await openStore({ env: process.env })
  try {
    process.stdout.write(JSON.stringify(await workers[worker](store)))
  } finally {
    await store.close()
  }
} else {
  const root = mkdtempSync(join(tmpdir(), "crm-relationships-"))
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "xdg-state"),
    XDG_RUNTIME_DIR: join(root, "runtime"),
    MESSAGING_STORE: join(root, "shared.db"),
    WIRECAT_STATE_DIR: join(root, "state"),
    TMPDIR: root,
    MEMO_CONFIG_DIR: join(root, "memo-config"),
    MEMO_STATE_DIR: join(root, "memo-state"),
    B24_CONFIG_DIR: join(root, "b24-config"),
    B24_STATE_DIR: join(root, "b24-state"),
    MEMO_NO_UPDATE_CHECK: "1",
    B24_NO_UPDATE_CHECK: "1",
    DBUS_SESSION_BUS_ADDRESS: "disabled:",
    NO_COLOR: "1",
    FAKE_PORTAL: join(root, "portal.json"),
    FAKE_PORTAL_LOG: join(root, "portal.log"),
    // The fake webhook's secret is invented and spelled as b24's own tests spell theirs.
    B24_TOKEN: `https://${HOST}/rest/7/wirecatfake0secret42/`,
  }
  const spawn = (entry, args, extra = {}, preloads = []) => {
    const ran = spawnSync(process.execPath, ["--import", guard, ...preloads, entry, ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    })
    let json = null
    try {
      json = JSON.parse(ran.stdout)
    } catch {}
    return { code: ran.status, out: ran.stdout, err: ran.stderr, json }
  }
  const strict = (ran, what) => {
    assert.equal(ran.code, 0, `${what} failed (${ran.code}): ${ran.err.slice(0, 600)}`)
    return ran.json
  }
  const memo = (args, extra) => strict(spawn(memoBin, [...args, "--json"], extra), `memo ${args.join(" ")}`)
  const memoRan = (args, extra) => spawn(memoBin, [...args, "--json"], extra)
  // memo takes a write as the owner's only from a terminal (src/author.ts whoRuns); anything else is an unattended
  // agent's proposal. A pseudo-terminal from util-linux `script` is the owner at a terminal, as far as memo can tell.
  const quote = (word) => `'${String(word).replaceAll("'", "'\\''")}'`
  const ownerRan = (args) => {
    const line = [process.execPath, "--import", guard, memoBin, ...args].map(quote).join(" ")
    const ran = spawnSync("script", ["-qec", line, "/dev/null"], {
      env,
      encoding: "utf8",
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const lines = ran.stdout
      .replaceAll("\r", "")
      .split("\n")
      .filter((one) => one.startsWith("{"))
    let json = null
    try {
      json = JSON.parse(lines.at(-1))
    } catch {}
    return { code: ran.status, out: ran.stdout, err: ran.stdout + ran.stderr, json }
  }
  // At a terminal `--json` must name its fields, so the owner writes in text, and the runner reads back in JSON.
  const owner = (args) => {
    const ran = ownerRan(args)
    assert.equal(ran.code, 0, `memo ${args.join(" ")} (owner) failed (${ran.code}): ${ran.out.slice(0, 600)}`)
  }
  const b24 = (args) =>
    strict(spawn(b24Bin, ["work", ...args, "--json"], {}, ["--import", portalPreload]), `b24 ${args.join(" ")}`)
  const runWorker = (name) =>
    strict(spawn(fileURLToPath(import.meta.url), [prefix, output], { CRM_RELATIONSHIPS_WORKER: name }), name)
  const sql = (query, ...values) => {
    const database = new DatabaseSync(env.MESSAGING_STORE, { readOnly: true })
    try {
      return database.prepare(query).all(...values)
    } finally {
      database.close()
    }
  }

  const time = (days) => new Date(OPENED + days * DAY + 3 * 3_600_000).toISOString().replace(/\.\d+Z$/, "+03:00")
  const row = (fields, days = 0) => ({ assignedById: 7, createdTime: time(days), updatedTime: time(days), ...fields })
  const email = (value) => [{ valueTypeId: "WORK", value }]
  // The owner answered the setup questions every WireCat tool shares once already; at a terminal they would be asked.
  writeFileSync(
    join(root, "config.json"),
    JSON.stringify({ setup: { languages: true, tools: true, permissions: "allow" } }),
  )
  const portal = {
    withheld: [],
    mine: [{ id: 1, title: "Northstar Consulting" }],
    company: [row({ id: 10, title: "Acme Ltd", typeId: "CUSTOMER" })],
    contact: [
      row({
        id: 20,
        name: "Alice",
        lastName: "Example",
        post: "Procurement manager",
        email: email("alice@acme.example"),
      }),
      row({ id: 21, name: "Bob", lastName: "Example", post: "CEO", email: email("bob@acme.example") }),
      row({ id: 22, name: "Carol", lastName: "Example", post: "Office manager", email: email("carol@acme.example") }),
    ].map((one) => ({ ...one, companiesId: [10], companyId: 10 })),
    deal: [
      row({
        ...{ id: 30, title: "Acme renewal", categoryId: 0, stageId: "NEW", stageSemanticId: "P", companyId: 10 },
        ...{ contactsId: [20], contactId: 20, opportunity: 1200, currencyId: "EUR" },
      }),
    ],
    lead: [],
    users: [
      ["7", "Emma", "Example", "Sales owner"],
      ["8", "Grace", "Example", "Head of sales"],
    ].map(([ID, NAME, LAST_NAME, WORK_POSITION]) => ({
      ...{ ID, ACTIVE: true, NAME, LAST_NAME, WORK_POSITION, UF_DEPARTMENT: [1], USER_TYPE: "employee" },
      EMAIL: `${NAME.toLowerCase()}@northstar.example`,
    })),
    departments: [{ ID: "1", NAME: "Sales", SORT: 500, UF_HEAD: "8" }],
    statuses: [
      ["DEAL_STAGE", "NEW", "New", "P"],
      ["DEAL_STAGE", "WON", "Won", "S"],
      ["DEAL_STAGE", "LOSE", "Lost", "F"],
      ["STATUS", "NEW", "Unprocessed", "P"],
      ["STATUS", "CONVERTED", "Good lead", "S"],
      ["STATUS", "JUNK", "Junk", "F"],
    ].map(([ENTITY_ID, STATUS_ID, NAME, SEMANTICS], index) => ({ ENTITY_ID, STATUS_ID, NAME, SORT: index, SEMANTICS })),
  }
  let portalClock = 40
  const savePortal = () => writeFileSync(env.FAKE_PORTAL, JSON.stringify(portal))
  const touch = (one, fields) => Object.assign(one, fields, { updatedTime: time(portalClock++) })
  savePortal()

  const checks = []
  const check = (id, name, body) => {
    const evidence = {}
    try {
      body(evidence)
      checks.push({ id, name, pass: true, evidence })
    } catch (error) {
      checks.push({ id, name, pass: false, error: String(error.message ?? error).slice(0, 1200), evidence })
    }
  }
  const refsOf = (section) => section.items.map((one) => one.ref)
  const rolesOf = (section) =>
    Object.fromEntries(
      section.items.map((one) => [one.ref, one.roles.map(({ role, standing }) => `${role}:${standing}`)]),
    )
  const personBy = (address) => {
    const [found] = sql(
      "SELECT person_id AS id FROM identity_links JOIN identities ON identities.id = identity_id " +
        "WHERE identities.provider = ? AND identities.external_id = ?",
      ...(address.includes("@") ? ["email", address] : address.split(":")),
    )
    return found ? `person:${found.id}` : null
  }
  const relationshipLinks = () =>
    sql(
      "SELECT id, from_type, from_id, to_type, to_id, kind, role, account_id, confirmed, deleted_at FROM links " +
        "WHERE kind IN ('member-of', 'reports-to', 'customer-of', 'partner-of', 'related-to') ORDER BY id",
    )
  const revisions = () => sql("SELECT count(*) AS n FROM link_revisions")[0].n

  runWorker("seed")
  const firstSync = b24(["sync"])
  owner(["groups", "add", "work", PORTAL])
  owner(["groups", "add", "work", `telegram:${TELEGRAM.account}`])
  owner(["groups", "add", "personal", `telegram:${PERSONAL_TELEGRAM.account}`])
  owner(["groups", "add", "personal", `email:${MAIL.account}`])
  const ids = {
    alice: personBy("alice@acme.example"),
    bob: personBy("bob@acme.example"),
    carol: personBy("carol@acme.example"),
    emma: personBy("emma@northstar.example"),
    grace: personBy("grace@northstar.example"),
    aliceTelegram: personBy("telegram:201"),
  }
  const organizations = memo(["organizations", "list"]).items
  ids.acme = organizations.find((one) => one.name === "Acme Ltd")?.ref
  ids.northstar = organizations.find((one) => one.name === "Northstar Consulting")?.ref
  ids.deal = memo(["deals", "list"]).items.find((one) => one.title === "Acme renewal")?.ref

  check(1, "Alice's CRM contact and Telegram identity are one person once the owner links them", (evidence) => {
    evidence.before = { crm: ids.alice, telegram: ids.aliceTelegram }
    assert.notEqual(ids.alice, ids.aliceTelegram, "no link is made by name before the owner's")
    runWorker("link")
    const after = { crm: personBy(`bitrix24:${HOST}/contact/20`), telegram: personBy("telegram:201") }
    evidence.after = after
    assert.equal(after.crm, after.telegram)
    ids.alice = after.crm
    const found = memo(["search", "people", "Alice"]).items
    evidence.search_people = found.map((one) => ({ ref: one.ref ?? one.person, name: one.name }))
    assert.equal(found.length, 1, "search people finds one Alice")
    const context = memo(["context", ids.alice]).item
    evidence.identities = context.messages.person.identities.map((one) => one.provider)
    assert.deepEqual([...new Set(evidence.identities)].sort(), ["bitrix24", "email", "telegram"])
    evidence.direct_messages = context.messages.recent.direct.length
    assert.ok(evidence.direct_messages >= 1, "the Telegram message is in her context without --source")
    const listed = memo(["people", "list"]).items.filter((one) => /^Alice\b/.test(one.name ?? ""))
    evidence.people_list = listed.map(({ ref, name }) => ({ ref, name }))
    assert.equal(listed.length, 1, "people list shows one Alice")
  })

  const reportsTo = (person) =>
    memo(["relationships", "list", "kind:reports-to", `from:${person}`]).items.map((one) => ({
      to: one.to,
      standing: one.standing,
    }))
  check(2, "Bob is Alice's manager only through the owner's link", (evidence) => {
    evidence.portal_derived = reportsTo(ids.emma)
    assert.deepEqual(evidence.portal_derived, [{ to: ids.grace, standing: "reported" }], "the portal's own line holds")
    evidence.before = reportsTo(ids.alice)
    assert.deepEqual(evidence.before, [], "no CRM source names an Acme contact's manager")
    owner(["relationships", "add", ids.alice, ids.bob, "--kind", "reports-to"])
    ids.reportsLink = memo(["relationships", "list", "kind:reports-to", `from:${ids.alice}`]).items[0]?.id
    evidence.after = reportsTo(ids.alice)
    assert.deepEqual(evidence.after, [{ to: ids.bob, standing: "confirmed" }])
    const business = memo(["context", ids.alice]).item.business
    evidence.context_reports_to = refsOf(business.reports_to)
    assert.deepEqual(evidence.context_reports_to, [ids.bob])
  })

  owner(["relationships", "add", ids.deal, ids.bob, "--kind", "related-to", "--role", "decision-maker"])
  owner(["projects", "add", "Atlas", "--key", "ATL", "--organization", ids.acme])
  owner(["deals", "update", ids.deal, "--project", "ATL"])
  owner([
    ...["invoices", "add", "1200.00", "EUR", "Atlas renewal", "--kind", "receivable"],
    ...["--organization", ids.acme, "--project", "ATL", "--occurred-time", "2026-10-10"],
  ])
  const invoice = memo(["invoices", "list"]).items[0]?.ref
  owner(["tasks", "add", "--project", "ATL", "--title", "Follow up on the Acme renewal", "--type", "chore"])
  b24(["config", "set", `crm.${PORTAL}.company-types`, "CUSTOMER=customer-of"])
  b24(["sync", "--rescan"])

  check(3, "the deal has Alice contact, Bob decision-maker and Emma owner, each with its standing", (evidence) => {
    const context = memo(["deals", "context", ids.deal]).item
    evidence.participants = rolesOf(context.participants)
    assert.equal(new Set(refsOf(context.participants)).size, context.participants.items.length, "each person once")
    assert.deepEqual(evidence.participants, {
      [ids.alice]: ["contact:reported"],
      [ids.bob]: ["decision-maker:confirmed"],
      [ids.emma]: ["owner:reported"],
    })
    evidence.owner = context.owner?.ref
    assert.equal(evidence.owner, ids.emma)
    evidence.project = context.project?.ref
    assert.equal(context.project?.name, "Atlas")
  })

  check(4, "Acme's context has its people and its deal, each once", (evidence) => {
    const context = memo(["organizations", "context", ids.acme]).item
    evidence.people = rolesOf(context.people)
    assert.equal(new Set(refsOf(context.people)).size, context.people.items.length, "each person once")
    assert.deepEqual(Object.keys(evidence.people).sort(), [ids.alice, ids.bob, ids.carol].sort())
    assert.equal(context.people.total, 3)
    evidence.deals = refsOf(context.deals)
    assert.deepEqual(evidence.deals, [ids.deal], "the deal once")
    evidence.categories = context.categories
    evidence.customer_of = refsOf(context.suppliers ?? { items: [] })
    assert.ok(evidence.categories.includes("client"), "the owner's company-types setting makes Acme a client")
    evidence.projects = refsOf(context.projects)
    assert.equal(evidence.projects.length, 1)
    const clients = memo(["organizations", "list", "category:client"]).items.map((one) => one.ref)
    evidence.category_client = clients
    assert.deepEqual(clients, [ids.acme])
  })

  check(5, "memo context person: answers for a CRM-only contact and a name-only person", (evidence) => {
    const grace = memo(["context", ids.grace]).item
    evidence.crm_only = {
      name: grace.messages.person.name,
      organizations: rolesOf(grace.business.organizations),
      direct_reports: refsOf(grace.business.direct_reports),
      coverage_accounts: grace.coverage.accounts,
    }
    assert.equal(grace.messages.person.name, "Grace Example", "a portal user's person takes the user's name")
    assert.deepEqual(evidence.crm_only.organizations, { [ids.northstar]: ["employee:reported"] })
    assert.deepEqual(evidence.crm_only.direct_reports, [ids.emma])
    owner(["people", "add", "Dana Example"])
    ids.dana = memo(["people", "list"]).items.find((one) => one.name === "Dana Example")?.ref
    evidence.search_people_finds_name_only = memo(["search", "people", "Dana"]).items.length
    const context = memo(["context", ids.dana]).item
    evidence.name_only = {
      name: context.messages.person.name,
      not_read: context.coverage.not_read.map((one) => one.source),
    }
    assert.equal(context.messages.person.name, "Dana Example")
    assert.ok(Array.isArray(context.coverage.not_read))
  })

  check(6, "the deal's context shows the meeting and messages, marked proposed", (evidence) => {
    const context = memo(["deals", "context", ids.deal]).item
    evidence.counts = context.communications.counts
    evidence.items = context.communications.items.map((one) => ({ kind: one.kind, standing: one.standing }))
    assert.ok(context.communications.counts.messages >= 1, "Alice's Telegram message")
    assert.ok(context.communications.counts.mail >= 1, "Bob's mail")
    assert.equal(context.communications.counts.meetings, 1, "the call with all three")
    assert.ok(evidence.items.length > 0)
    for (const one of evidence.items) assert.equal(one.standing, "proposed")
  })

  check(7, "the invoice shows unpaid and no payment appears", (evidence) => {
    const deal = memo(["deals", "context", ids.deal]).item.money
    const acme = memo(["organizations", "context", ids.acme]).item.money
    evidence.deal = { invoices: deal.invoices.items.map(({ ref, status, open }) => ({ ref, status, open })) }
    evidence.deal.payments = deal.payments.total
    evidence.organization = { invoices: acme.invoices.total, payments: acme.payments.total }
    assert.deepEqual(evidence.deal.invoices, [{ ref: invoice, status: "issued", open: "1200.00" }])
    assert.equal(deal.payments.total, 0)
    assert.equal(acme.payments.total, 0)
    assert.equal(acme.invoices.total, 1)
  })

  check(8, "three b24 syncs leave one link per relationship and no new revisions", (evidence) => {
    const before = { links: relationshipLinks(), revisions: revisions() }
    const runs = [b24(["sync"]), b24(["sync", "--rescan"]), b24(["sync"])]
    const after = { links: relationshipLinks(), revisions: revisions() }
    evidence.links = { before: before.links.length, after: after.links.length }
    evidence.revisions = { before: before.revisions, after: after.revisions }
    evidence.issues = runs.map((one) => one.item.issues.length)
    const keys = after.links.map((one) =>
      [one.from_type, one.from_id, one.to_type, one.to_id, one.kind, one.role, one.account_id].join("|"),
    )
    evidence.duplicate_keys = keys.length - new Set(keys).size
    assert.equal(evidence.duplicate_keys, 0)
    assert.deepEqual(after.links, before.links)
    assert.equal(after.revisions, before.revisions)
  })

  check(9, "a wrong identity link, separated by the owner, stays separated after re-sync", (evidence) => {
    const crmCarol = `bitrix24:${HOST}/contact/22`
    evidence.joined_by_sync = { crm: personBy(crmCarol), mail: personBy("carol@acme.example") }
    assert.equal(evidence.joined_by_sync.crm, evidence.joined_by_sync.mail, "the sync joined them by exact address")
    runWorker("unlink")
    touch(portal.contact[2], { post: "Front desk" })
    savePortal()
    b24(["sync"])
    b24(["sync", "--rescan"])
    evidence.after = { crm: personBy(crmCarol), mail: personBy("carol@acme.example") }
    assert.notEqual(evidence.after.crm, evidence.after.mail)
  })

  check(10, "a CRM change does not overwrite a role the owner set", (evidence) => {
    const aliceAtAcme = () =>
      relationshipLinks().filter(
        (one) =>
          one.kind === "member-of" && `person:${one.from_id}` === ids.alice && `organization:${one.to_id}` === ids.acme,
      )
    const reported = aliceAtAcme().find((one) => one.account_id !== null)
    owner(["relationships", "update", String(reported.id), "--role", "manager"])
    const overrides = () => aliceAtAcme().filter((one) => one.account_id === null)
    const override = overrides()
    const decision = relationshipLinks().filter((one) => one.role === "decision-maker")
    touch(portal.contact[0], { post: "Head of procurement" })
    touch(portal.deal[0], { contactsId: [20, 21] })
    savePortal()
    const proposals = () =>
      sql("SELECT count(*) AS n FROM proposed_actions WHERE kind LIKE 'relationship%' AND status = 'pending'")[0].n
    b24(["sync"])
    const first = { proposals: proposals(), links: relationshipLinks().length }
    b24(["sync", "--rescan"])
    const second = { proposals: proposals(), links: relationshipLinks().length }
    const pick = ({ id, role, confirmed, account_id, deleted_at }) => ({ id, role, confirmed, account_id, deleted_at })
    evidence.alice_links = aliceAtAcme().map(pick)
    evidence.after_sync = [first, second]
    assert.equal(override.length, 1, "the owner's edit made one override link")
    assert.deepEqual(overrides(), override, "two syncs leave the override as the owner made it")
    assert.equal(override[0].role, "manager")
    assert.equal(override[0].confirmed, 1)
    assert.deepEqual(second, first, "a second sync proposes and writes nothing new")
    const alice = rolesOf(memo(["organizations", "context", ids.acme]).item.people)[ids.alice]
    evidence.alice_at_acme = alice
    assert.deepEqual(alice, ["manager:confirmed"], "the CRM's contact row is hidden behind the owner's override")
    const bob = rolesOf(memo(["deals", "context", ids.deal]).item.participants)[ids.bob]
    evidence.bob_on_deal = bob
    assert.deepEqual(
      relationshipLinks().filter((one) => one.role === "decision-maker"),
      decision,
    )
    assert.ok(bob.includes("decision-maker:confirmed"), "the CRM reporting Bob as a contact leaves the owner's role")
  })

  check(11, "a group lock never reads the other group's accounts, and deals: deny hides deals", (evidence) => {
    const personal = { MEMO_GROUP_LOCK: "personal" }
    const work = { MEMO_GROUP_LOCK: "work" }
    const hits = (query, extra) => memo(["search", "all", query], extra).items.map((one) => one.ref)
    const deals = memoRan(["deals", "list"], personal)
    evidence.personal_deals_list = deals.json?.items?.length ?? deals.json?.error?.code ?? deals.code
    assert.ok(deals.code !== 0 || deals.json.items.length === 0, "no work deal under the personal lock")
    evidence.personal_search_deal = hits("Acme renewal", personal)
    assert.ok(!evidence.personal_search_deal.some((ref) => /^(deal|lead):/.test(ref)))
    evidence.personal_search_work_chat = hits("renew Atlas", personal)
    assert.ok(!evidence.personal_search_work_chat.some((ref) => ref.startsWith(`msg:telegram/${TELEGRAM.account}/`)))
    const crmOnly = memo(["search", "people", "Grace"], personal).items
    evidence.personal_search_crm_person = crmOnly.map((one) => one.ref ?? one.person)
    assert.equal(crmOnly.length, 0, "a person only the work CRM knows is not found")
    const alice = memoRan(["context", ids.alice], personal)
    evidence.personal_context_alice = alice.json?.error?.reason ?? alice.json?.item?.coverage
    assert.ok(alice.code !== 0 || alice.json.item.business.deals.total === 0, "only work accounts know Alice")
    const bob = memo(["context", ids.bob], personal).item
    evidence.personal_context_bob = {
      accounts: bob.coverage.accounts,
      organizations: bob.business.organizations.total,
      deals: bob.business.deals.total,
    }
    assert.ok(bob.coverage.accounts.includes(`email:${MAIL.account}`), "his mail is in the personal mailbox")
    assert.ok(!bob.coverage.accounts.some((one) => one === PORTAL || one === `telegram:${TELEGRAM.account}`))
    assert.equal(bob.business.deals.total, 0)
    assert.equal(bob.business.organizations.total, 0)
    evidence.work_search_personal_chat = hits("Weekend hike", work)
    assert.ok(!evidence.work_search_personal_chat.some((ref) => ref.startsWith("msg:telegram/100/")))
    evidence.work_search_mail = hits("Renewal terms", work)
    assert.ok(!evidence.work_search_mail.some((ref) => ref.startsWith("msg:email/")), "the mailbox is personal")
    // Each refusal above means something only if the same read without a lock finds the thing.
    evidence.unlocked = {
      deal: hits("Acme renewal").includes(ids.deal),
      work_chat: hits("renew Atlas").some((ref) => ref.startsWith(`msg:telegram/${TELEGRAM.account}/`)),
      // At least one: a merge's leftover person may be found too, which is check 1's subject, not this one's.
      crm_person: memo(["search", "people", "Grace"]).items.length > 0,
      personal_chat: hits("Weekend hike").some((ref) => ref.startsWith("msg:telegram/100/")),
      mail: hits("Renewal terms").some((ref) => ref.startsWith("msg:email/")),
    }
    assert.deepEqual(evidence.unlocked, {
      deal: true,
      work_chat: true,
      crm_person: true,
      personal_chat: true,
      mail: true,
    })
    // The owner's own projects, tasks and invoices are visible under either lock by design; recorded, not asserted.
    evidence.owner_made = Object.fromEntries(
      [
        ["personal", personal],
        ["work", work],
      ].map(([name, extra]) => [
        name,
        Object.fromEntries(
          [
            ["projects", ["projects", "list"]],
            ["invoices", ["invoices", "list"]],
            ["tasks", ["tasks", "list", "--project", "ATL"]],
          ].map(([kind, args]) => {
            const ran = memoRan(args, extra)
            return [kind, ran.json?.items?.length ?? ran.json?.error?.reason ?? ran.code]
          }),
        ),
      ]),
    )
    const configPath = join(env.MEMO_CONFIG_DIR, "config.json")
    mkdirSync(env.MEMO_CONFIG_DIR, { recursive: true })
    const saved = existsSync(configPath) ? readFileSync(configPath, "utf8") : null
    const config = saved ? JSON.parse(saved) : {}
    writeFileSync(configPath, JSON.stringify({ ...config, permissions: { ...config.permissions, deals: "deny" } }))
    try {
      evidence.deny_search = hits("Acme renewal")
      assert.ok(!evidence.deny_search.some((ref) => ref.startsWith("deal:")))
      const acme = memo(["organizations", "context", ids.acme]).item
      evidence.deny_organization_deals = acme.deals?.total ?? null
      assert.ok(!acme.deals || acme.deals.total === 0)
      const context = memoRan(["deals", "context", ids.deal])
      evidence.deny_deal_context = context.json?.error?.reason ?? context.code
      assert.notEqual(context.code, 0)
    } finally {
      if (saved === null) rmSync(configPath)
      else writeFileSync(configPath, saved)
    }
  })

  // Short noun phrases an agent would type are asserted; whole task sentences are recorded only.
  const NEW_COMMANDS = {
    "organizations context": ["organization context", "a client company's people, deals and money"],
    "deals context": ["deal context", "everything about one deal: people, stages, invoices"],
    "leads context": ["lead context", "one lead with its people and history"],
    "deals update": ["deal project", "set the project a deal belongs to"],
    "relationships list": ["relationships", "who reports to whom"],
    "relationships add": ["add relationship", "record that a person reports to another"],
    "relationships end": ["end relationship", "say a relationship ended"],
    "organizations list": ["organizations", "list client organizations"],
    context: ["person context", "one person's companies and deals"],
    "groups list": ["account groups", "which accounts are in the work group"],
    "groups add": ["add account to group", "put an account in a group"],
    "groups remove": ["remove account group", "take an account out of a group"],
    "groups move": ["move account groups", "move an account to another group"],
  }
  const queries = Object.values(NEW_COMMANDS).flat()
  const found = await searchTools(memoBin, guard, env, queries, ids.deal)
  check(12, "every new memo command is found by memo_tools_search over a real stdio MCP process", (evidence) => {
    evidence.ranks = Object.fromEntries(
      Object.entries(NEW_COMMANDS).map(([command, [query]]) => [query, found.results[query].indexOf(command)]),
    )
    // An agent types a task, not a command name; recorded to show how far plain words get, not asserted.
    evidence.task_phrases = Object.fromEntries(
      Object.entries(NEW_COMMANDS).map(([command, [, query]]) => [query, found.results[query].indexOf(command)]),
    )
    evidence.mcp_deal_context_matches_cli = found.dealContext === ids.deal
    const missing = Object.entries(evidence.ranks).filter(([, rank]) => rank === -1)
    assert.deepEqual(missing, [], "each command is in its search's results")
    assert.ok(evidence.mcp_deal_context_matches_cli, "memo_read deals context answers the same deal")
  })

  const memoDocs = option("--memo-docs")
  const b24Docs = option("--b24-docs")
  check(13, "each documentation example that names these commands runs as written", (evidence) => {
    assert.ok(memoDocs && b24Docs, "--memo-docs and --b24-docs name the checked-out repositories")
    const examples = docExamples({ memo: resolve(memoDocs), b24: resolve(b24Docs) })
    const substitute = (line) =>
      line
        .replace(/person:(12|7|5|3|PERSON_UID)\b/g, ids.alice)
        .replace(/person:OTHER_UID\b/g, ids.bob)
        .replace(/organization:(4|1)\b/g, ids.acme)
        .replace(/organization:2\b/g, ids.northstar)
        .replace(/deal:(7|5|<id>)/g, ids.deal)
        .replace(/\bHRB\b/g, "ATL")
        .replace(/example\.bitrix24\.com/g, HOST)
        .replace(/relationships end \d+/, `relationships end ${ids.reportsLink}`)
        .replace(/chat:telegram\/1\/123\b/g, "chat:telegram/300/201")
        .replace(/bitrix24:acme\b/g, PORTAL)
        .replace(/telegram:102\b/g, `telegram:${TELEGRAM.account}`)
    evidence.results = examples.map((example) => {
      if (example.skip) return { ...example, ran: false }
      const argv = splitWords(substitute(example.command))
      const [tool, ...args] = argv
      const ran = tool === "b24" ? spawn(b24Bin, args, {}, ["--import", portalPreload]) : ownerRan(args)
      if (ran.code === 0 && tool === "memo" && !WRITES.test(example.command)) {
        const read = spawn(memoBin, [...args, "--json"])
        ran.json = read.json
        ran.code = read.code
      }
      if (ran.code !== 0 && /^(memo|b24)( [a-z][a-z-]*)+$/.test(example.command))
        return { ...example, ran: true, code: ran.code, reference: "names the command in prose, with no arguments" }
      if (ran.code === 0 && !ran.json) return { ...example, ran: true, code: 0, shape: "text" }
      const shape = ran.json?.item ? "item" : ran.json?.items ? "items" : ran.json?.error ? "error" : "none"
      return { ...example, ran: true, code: ran.code, shape, error: ran.json?.error?.message?.slice(0, 200) }
    })
    const failed = evidence.results.filter(
      (one) => one.ran && !one.reference && (one.code !== 0 || one.shape === "error"),
    )
    evidence.counts = { examples: examples.length, ran: evidence.results.filter((one) => one.ran).length }
    assert.deepEqual(
      failed.map(({ file, command, error }) => ({ file, command, error })),
      [],
      "every example runs",
    )
  })

  const version = (directory) => JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version
  const coreVersion = (directory) => {
    const path = createRequire(join(directory, "package.json")).resolve("@wirecat/cli-core/store")
    return version(resolve(path, "../../.."))
  }
  const lock = JSON.parse(readFileSync(join(resolve(prefix), "package-lock.json"), "utf8"))
  const integrity = (name) => lock.packages[`node_modules/@wirecat/${name}`]?.integrity ?? null
  const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
  const calls = readFileSync(env.FAKE_PORTAL_LOG, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  const report = {
    node: process.version,
    script: spawnSync("script", ["--version"], { encoding: "utf8" }).stdout.trim(),
    build: option("--build") ? JSON.parse(readFileSync(option("--build"), "utf8")) : "registry",
    artifacts: {
      "bitrix24-cli": { version: version(b24Package), integrity: integrity("bitrix24-cli"), entry_sha256: sha(b24Bin) },
      "cli-memo": { version: version(memoPackage), integrity: integrity("cli-memo"), entry_sha256: sha(memoBin) },
      "cli-core": {
        version: coreVersion(memoPackage),
        b24_core: coreVersion(b24Package),
        integrity: integrity("cli-core"),
      },
    },
    first_sync: {
      synced: firstSync.item.synced.map(({ kind, saved }) => ({ kind, saved })),
      users: firstSync.item.users,
    },
    portal: {
      calls: calls.length,
      methods: [...new Set(calls.map((one) => `${one.api === 3 ? "v3" : "v2"} ${one.method}`))].sort(),
      refused: calls.filter((one) => one.status >= 400).length,
    },
    passed: checks.filter((one) => one.pass).length,
    failed: checks.filter((one) => !one.pass).map((one) => one.id),
    checks,
    coverage:
      "synthetic portal behind b24's real binary, synthetic Telegram, mail and calendar rows through cli-core's store " +
      "calls, memo's real binary and stdio MCP; no live Bitrix24, OAuth, Zoom recording, matching beyond exact email or scale",
  }
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${report.passed}/${checks.length} checks passed; ${resolve(output)}\n`)
  if (report.failed.length > 0) process.exitCode = 1
}

function splitWords(line) {
  const words = []
  for (const match of line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) words.push(match[1] ?? match[2] ?? match[3])
  return words
}
