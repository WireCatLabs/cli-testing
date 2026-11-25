// Times store version 75 on synthetic senders: the v74 -> v75 upgrade with N bots, the rule pass that moves N
// program senders to bots, and warm reads of the people and bots lists. Usage: node bench.mjs <repo> [N]
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 20000)
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

const seeded = async (programs, humans) => {
  const path = join(mkdtempSync(join(tmpdir(), "bot-scale-")), "store.db")
  const store = await openStore({ path })
  await store.people.savePeople(TG, [{ id: "1", name: "Me" }])
  await store.people.linkToOwner({ provider: "telegram", id: "1" })
  await store.accounts.saveAccount(MAIL, { name: null })
  const senders = [
    ...Array.from({ length: programs }, (_, n) => ({ id: `noreply-${n}@shop${n % 500}.ru`, name: `Shop ${n}` })),
    ...Array.from({ length: humans }, (_, n) => ({ id: `person${n}@firm${n % 300}.ru`, name: `Person ${n}` })),
  ]
  for (let at = 0; at < senders.length; at += 2000) await store.people.savePeople(MAIL, senders.slice(at, at + 2000))
  return { store, path }
}

say(
  `node ${process.version}, N = ${N}, load ${(await import("node:os"))
    .loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)

// 1. The rule pass: N program senders and N humans, kinds never worked out, then the first list.
{
  const { store } = await seeded(N, N)
  await time(`first people list, ${N} programs moved to bots + ${N} humans sorted`, () =>
    store.people.list({ limit: 50 }),
  )
  await time("warm people list, page of 50", () => store.people.list({ limit: 50 }))
  await time("warm people list kind:all, page of 50", () => store.people.list({ limit: 50, kind: "all" }))
  await time("people counts", () => store.people.counts())
  const bots = await time("bots list, page of 50", () => store.people.listBots({ limit: 50 }))
  await time("bots list, query", () => store.people.listBots({ limit: 50, query: "shop1" }))
  await time("bot show", () => store.people.showBot(bots.items[0].bot))
  say(`bots: ${bots.total}`)
  await store.close()
}

// 2. The upgrade: a version 74 store whose N bots are person rows holding their identities.
{
  const { store, path } = await seeded(N, N)
  await store.close()
  const db = await openCache(path)
  db.exec(
    "DROP TRIGGER person_kind_sender_bot_origin_au; DROP TRIGGER sender_bot_identity_link_bi; " +
      "DROP TRIGGER sender_bot_identity_link_au; " +
      "DROP TRIGGER sender_bot_identity_person_ai; DROP TRIGGER sender_bot_identities_linked_bi; " +
      "DROP TRIGGER sender_bots_holding_bd; DROP TRIGGER sender_bot_identities_identity_ad; " +
      "DROP TRIGGER sender_bots_emptied_ad; DROP TRIGGER sender_bots_emptied_au; " +
      "DROP INDEX sender_bot_moves_by_from_person_id; DROP TABLE sender_bot_identities; " +
      "DELETE FROM schema_migrations WHERE version >= 75;",
  )
  db.prepare(
    "INSERT INTO sender_bots (person_id, author, reason, created_at, updated_at) SELECT l.person_id, 'rules', 'no-reply', 1, 1 " +
      "FROM identity_links l JOIN identities i ON i.id = l.identity_id WHERE i.external_id LIKE 'noreply-%'",
  ).run()
  say(`version 74 bots: ${db.prepare("SELECT count(*) AS n FROM sender_bots").get().n}`)
  db.close()
  const upgraded = await time(`open with the upgrade to 75, ${N} bots`, () => openStore({ path }))
  const after = await openCache(path)
  say(
    `after: ${after.prepare("SELECT count(*) AS n FROM sender_bot_identities").get().n} bot identities, ` +
      `${after.prepare("SELECT count(*) AS n FROM sender_bots WHERE person_id > 0").get().n} positive person_id`,
  )
  after.close()
  await time("first people list after the upgrade", () => upgraded.people.list({ limit: 50 }))
  await upgraded.close()
}
