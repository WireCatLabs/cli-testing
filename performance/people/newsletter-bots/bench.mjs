// Times the first people list when N senders of a newsletter only become bots (cli-core, owner's ruling of
// 2026-11-25), beside N humans who wrote to the owner directly. Usage: node bench.mjs <cli-core checkout> [N] [lists]
// `lists` = 0 seeds the same mail with no list headers, so nobody moves: the cost of the rule's pass alone.
import { mkdtempSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 20000)
const LISTS = process.argv[4] !== "0"
const MAILS = 2
const { openStore } = await import(join(repo, "dist/store/index.js"))
const { openCache } = await import(join(repo, "dist/store/open.js"))
const MAIL = { provider: "email", account: "me@acme.ru" }
const TG = { provider: "telegram", account: "1" }
const say = (line) => process.stdout.write(`${line}\n`)

const time = async (label, work) => {
  const start = performance.now()
  const result = await work()
  say(`${label}: ${Math.round(performance.now() - start)} ms`)
  return result
}

const seeded = async () => {
  const path = join(mkdtempSync(join(tmpdir(), "newsletter-bots-")), "store.db")
  const store = await openStore({ path })
  await store.people.savePeople(TG, [{ id: "1", name: "Me" }])
  await store.people.linkToOwner({ provider: "telegram", id: "1" })
  await store.accounts.saveAccount(MAIL, { name: null })
  const authors = Array.from({ length: N }, (_, n) => ({ id: `author${n}@letters${n % 400}.ru`, name: `Author ${n}` }))
  const humans = Array.from({ length: N }, (_, n) => ({ id: `person${n}@firm${n % 300}.ru`, name: `Person ${n}` }))
  const senders = [...authors, ...humans]
  for (let at = 0; at < senders.length; at += 2000) await store.people.savePeople(MAIL, senders.slice(at, at + 2000))
  await store.close()
  const db = await openCache(path)
  const account = db.prepare("SELECT id FROM accounts WHERE provider = 'email'").get().id
  const identity = new Map(
    db
      .prepare("SELECT id, external_id FROM identities WHERE provider = 'email'")
      .all()
      .map((row) => [row.external_id, row.id]),
  )
  const thread = db.prepare(
    "INSERT INTO email_threads (account_id, external_id, created_at, updated_at) VALUES (?, ?, 1, 1) RETURNING id",
  )
  const email = db.prepare(
    "INSERT INTO emails (account_id, email_thread_id, external_id, from_identity_id, from_address, headers, outgoing, " +
      "sent_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, 1) RETURNING id",
  )
  const to = db.prepare(
    "INSERT INTO email_recipients (email_id, address, role, position, created_at, updated_at) " +
      "VALUES (?, 'me@acme.ru', 'to', 0, 1, 1)",
  )
  db.exec("BEGIN")
  let m = 0
  for (const [list, people] of [
    [LISTS, authors],
    [false, humans],
  ])
    for (const { id } of people)
      for (let k = 0; k < MAILS; k++) {
        m += 1
        const headers = list
          ? JSON.stringify({ "list-id": `<${id.split("@")[0]}.letters.ru>`, "list-unsubscribe": true })
          : null
        const t = thread.get(account, `t${m}`).id
        to.run(email.get(account, t, `m${m}`, identity.get(id), id, headers, 1_790_000_000_000 + m).id)
      }
  db.exec("COMMIT")
  db.close()
  return { path, mails: m }
}

say(
  `node ${process.version}, N = ${N}, lists ${LISTS}, load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
const { path, mails } = await seeded()
say(`seeded ${2 * N} senders, ${mails} mails`)
const store = await openStore({ path })
await time(`first people list, ${2 * N} kinds worked out`, () => store.people.list({ limit: 50 }))
await time("warm people list, page of 50", () => store.people.list({ limit: 50 }))
const bots = await time("bots list, page of 50", () => store.people.listBots({ limit: 50 }))
await store.close()
{
  const db = await openCache(path)
  db.prepare(
    "UPDATE persons SET kind = NULL WHERE id = (SELECT max(id) FROM persons WHERE owner = 0 AND kind <> 'merged')",
  ).run()
  db.close()
}
const again = await openStore({ path })
await time("kept list after one stale kind, with every bot checked for a 1-to-1 mail", () =>
  again.people.list({ limit: 50 }),
)
say(
  `bots: ${bots.total}, newsletter-only: ${bots.items.filter((bot) => bot.reason === "newsletter-only").length} of the page`,
)
await again.close()
{
  const { ruleBotsBack } = await import(join(repo, "dist/store/sqlite/sender-bots.js"))
  const db = await openCache(path)
  for (let k = 0; k < 3; k++) {
    db.exec("BEGIN IMMEDIATE")
    await time("give-back check alone (ruleBotsBack), under the write lock", () => ruleBotsBack(db, Date.now()))
    db.exec("ROLLBACK")
  }
  db.close()
}
