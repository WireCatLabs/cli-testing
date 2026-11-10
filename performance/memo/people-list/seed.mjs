// A synthetic store the size of the owner's people list: about 113,000 people with every kind present.
// No real data, no network, no account, no CLI run. Built on ../../people/ties/bench.mjs, scaled up.
//   node seed.mjs <cli-core checkout with dist> <new store file>
import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [core, path] = process.argv.slice(2)
if (!core || !path) throw new Error("usage: node seed.mjs <cli-core checkout with dist> <new store file>")
if (existsSync(path)) throw new Error(`${path} exists; seed a new file`)
const load = (file) => import(pathToFileURL(join(core, "dist", file)).href)
const { openCache } = await load("store/open.js")
const { openStore } = await load("store/store.js")

const IDENTITIES = Number(process.env.SEED_IDENTITIES ?? 114_700)
const MESSAGES = Number(process.env.SEED_MESSAGES ?? 2_000_000)
const DIALOGS = 6_000
const SMALL_GROUPS = 600
const UNKNOWN_SIZE_GROUPS = 200
const LARGE_GROUPS = 3_000
const INCOMING_MAIL = 60_000
const OUTGOING_MAIL = 4_000
const BULK_SENDERS = 2_000
const MEETINGS = 800
const BOOK = 3_000
const CRM_RECORDS = 600
const MERGES = 1_000
const TASKS = 200
const NOW = Date.parse("2026-11-01T12:00:00Z")

let seed = 42
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
  return seed / 2_147_483_648
}
const pick = (n) => 1 + Math.floor(random() * n)

const env = { ...process.env, MESSAGING_STORE: path }
await (await openStore({ env })).close()
const db = await openCache(path)
const store = await openStore({ env })

const FIRST = ["Ivan", "Maria", "Olga", "Pedro", "Lucia", "Anna", "Sergey", "Elena", "Jorge", "Rin"]
const LAST = ["Petrov", "Garcia", "Ivanova", "Lopez", "Smirnov", "Martin", "Kuznetsova", "Sanchez"]
// Most names are people; a few are companies, programs or nothing readable, as in a real address book.
const nameOf = (n) => {
  if (n % 97 === 0) return "!"
  if (n % 89 === 0) return null
  if (n % 61 === 0) return `ООО Ромашка ${n}`
  if (n % 53 === 0) return `Harbour Bank ${n}`
  if (n % 47 === 0) return `Notifications ${n}`
  return `${FIRST[n % FIRST.length]} ${LAST[n % LAST.length]} ${n}`
}
// Mail senders are email identities; some write from no-reply or role addresses.
const MAIL_FIRST = 40_000
const MAIL_SENDERS = 6_000
const emailOf = (n) =>
  n % 11 === 0 ? `no-reply${n}@example.test` : n % 7 === 0 ? `info${n}@example.test` : `p${n}@example.test`

db.exec("BEGIN")
const tg = Number(
  db
    .prepare(
      "INSERT INTO accounts (provider, external_id, created_at, updated_at) VALUES ('telegram', '1', ?, ?) RETURNING id",
    )
    .get(NOW, NOW)?.id,
)
const mail = Number(
  db
    .prepare(
      "INSERT INTO accounts (provider, external_id, created_at, updated_at) VALUES ('email', 'me@example.test', ?, ?) RETURNING id",
    )
    .get(NOW, NOW)?.id,
)
const identity = db.prepare(
  "INSERT INTO identities (provider, external_id, name, username, email, bot, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
)
const person = db.prepare("INSERT INTO persons (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id")
const link = db.prepare(
  "INSERT INTO identity_links (identity_id, person_id, method, confidence, created_at, author, updated_at) VALUES (?, ?, 'initial', 1, ?, 'ingest', ?)",
)
const seen = db.prepare(
  "INSERT INTO account_identities (account_id, identity_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
)
for (let n = 1; n <= IDENTITIES; n++) {
  const name = nameOf(n)
  const mailSender = n >= MAIL_FIRST && n < MAIL_FIRST + MAIL_SENDERS
  const id = Number(
    identity.get(
      mailSender ? "email" : "telegram",
      mailSender ? emailOf(n) : String(n),
      name,
      !mailSender && n % 3 === 0 ? `user${n}` : null,
      mailSender ? emailOf(n) : null,
      n % 211 === 0 ? 1 : 0,
      NOW,
      NOW,
    )?.id,
  )
  const owner = Number(person.get(name, NOW, NOW)?.id)
  link.run(id, owner, NOW, NOW)
  seen.run(mailSender ? mail : tg, id, NOW, NOW)
}
const ownerIdentity = 1
db.prepare("UPDATE persons SET owner = 1 WHERE id = (SELECT person_id FROM identity_links WHERE identity_id = ?)").run(
  ownerIdentity,
)

const chat = db.prepare(
  "INSERT INTO chats (account_id, external_id, kind, participants_count, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
)
const member = db.prepare("INSERT OR IGNORE INTO chat_members (chat_id, identity_id, created_at) VALUES (?, ?, ?)")
const members = (chatId, count) => {
  member.run(chatId, ownerIdentity, NOW)
  for (let m = 0; m < count; m++) member.run(chatId, pick(IDENTITIES), NOW)
}
for (let n = 0; n < DIALOGS; n++) members(Number(chat.get(tg, `d${n}`, "dialog", 2, NOW, NOW)?.id), 1)
for (let n = 0; n < SMALL_GROUPS; n++) {
  const size = 3 + (n % 12)
  members(Number(chat.get(tg, `s${n}`, "group", size, NOW, NOW)?.id), size - 1)
}
for (let n = 0; n < UNKNOWN_SIZE_GROUPS; n++) members(Number(chat.get(tg, `u${n}`, "group", null, NOW, NOW)?.id), 5)
for (let n = 0; n < LARGE_GROUPS; n++) {
  const size = 50 + Math.floor(random() * 5_000)
  const id = Number(chat.get(tg, `l${n}`, n % 10 === 0 ? "channel" : "group", size, NOW, NOW)?.id)
  members(id, Math.min(size, 30 + Math.floor(random() * 270)))
}

const bulk = Number(
  db
    .prepare(
      "INSERT INTO mailboxes (account_id, external_id, name, kind, created_at, updated_at) VALUES (?, 'promo', 'Promotions', 'bulk', ?, ?) RETURNING id",
    )
    .get(mail, NOW, NOW)?.id,
)
const inBulk = db.prepare("INSERT INTO email_mailboxes (email_id, mailbox_id, created_at) VALUES (?, ?, ?)")
const thread = db.prepare(
  "INSERT INTO email_threads (account_id, external_id, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id",
)
const email = db.prepare(
  "INSERT INTO emails (account_id, email_thread_id, external_id, from_identity_id, outgoing, body_text, sent_at, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
)
const recipient = db.prepare(
  "INSERT INTO email_recipients (email_id, identity_id, address, role, position, created_at, updated_at) VALUES (?, ?, ?, 'to', ?, ?, ?)",
)
const body = "Synthetic body text. ".repeat(20)
for (let n = 0; n < INCOMING_MAIL + OUTGOING_MAIL; n++) {
  const outgoing = n >= INCOMING_MAIL
  const threadId = Number(thread.get(mail, `t${n}`, NOW, NOW)?.id)
  const sender = outgoing ? ownerIdentity : MAIL_FIRST + (n % MAIL_SENDERS)
  const id = Number(email.get(mail, threadId, `m${n}`, sender, outgoing ? 1 : 0, body, NOW - n, NOW, NOW)?.id)
  if (!outgoing && sender - MAIL_FIRST < BULK_SENDERS) inBulk.run(id, bulk, NOW)
  const to = outgoing ? [pick(IDENTITIES), MAIL_FIRST + BULK_SENDERS + (n % 500)] : [ownerIdentity]
  for (const [at, who] of to.entries()) recipient.run(id, who, `p${who}@example.test`, at, NOW, NOW)
}

const meeting = db.prepare(
  "INSERT INTO meetings (account_id, external_id, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id",
)
const participant = db.prepare(
  "INSERT OR IGNORE INTO meeting_participants (meeting_id, identity_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
)
for (let n = 0; n < MEETINGS; n++) {
  const id = Number(meeting.get(mail, `meet${n}`, NOW, NOW)?.id)
  for (let p = 0; p < 4; p++) participant.run(id, pick(IDENTITIES), NOW, NOW)
}
db.prepare(
  `UPDATE account_identities SET address_book = 1 WHERE account_id = ? AND identity_id IN (SELECT id FROM identities ORDER BY random() LIMIT ${BOOK})`,
).run(tg)
db.prepare(
  "UPDATE account_identities SET mail_signals = '[\"bulk_never_replied\"]' WHERE identity_id IN " +
    `(SELECT id FROM identities WHERE provider = 'email' AND id % 13 = 0)`,
).run()
const record = db.prepare(
  "INSERT INTO records (account_id, type, external_id, fields, fingerprint, batch_id, entity_type, entity_id, created_at, updated_at) " +
    "VALUES (?, 'person', ?, '{}', ?, 'b', 'person', (SELECT person_id FROM identity_links WHERE identity_id = ?), ?, ?)",
)
for (let n = 0; n < CRM_RECORDS; n++) record.run(mail, `r${n}`, `f${n}`, pick(IDENTITIES), NOW, NOW)

// A third of the messages from anyone, the rest from 2,000 busy people; every seventh has no sender (a channel post).
db.exec("PRAGMA foreign_keys = OFF")
db.prepare(
  "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) " +
    "INSERT INTO messages (chat_id, account_id, external_id, sender_identity_id, sent_at, text, outgoing, " +
    "created_at, source, updated_at) SELECT 1 + (i % (SELECT count(*) FROM chats)), 1, 'm' || i, " +
    "CASE WHEN i % 7 = 0 THEN NULL WHEN i % 3 = 0 THEN 1 + abs(random()) % (SELECT count(*) FROM identities) " +
    "ELSE 1 + (i % 2000) END, 1700000000000 + i * 1000, 'hello', 0, 0, 'sync', 0 FROM n",
).run(MESSAGES)
db.exec("COMMIT")
db.exec("PRAGMA foreign_keys = ON")

for (let n = 0; n < MERGES; n++)
  await store.people.linkIdentities(
    { provider: "telegram", id: String(2 * n + 2) },
    { provider: "telegram", id: String(2 * n + 3) },
    { method: "manual", by: "owner" },
  )
await store.knowledge.addProject({ name: "Harbour", key: "HRB", type: "work" })
for (let n = 0; n < TASKS; n++) {
  const task = await store.tasks.create({ project: "HRB", title: `T${n}`, type: "chore" }, "owner")
  await store.tasks.assign(task.id, { to: `person:${10 + n * 37}`, role: "assignee" }, "owner")
}
for (let n = 0; n < 20; n++) await store.people.add({ name: `Hand Added ${n}` })
await store.close()

const count = (table) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
process.stdout.write(
  `${JSON.stringify({ persons: count("persons"), identities: count("identities"), messages: count("messages"), emails: count("emails") })}\n`,
)
