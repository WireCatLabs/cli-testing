// Times the first mail search after a large save, and what saving costs, on synthetic mail. Five parts:
// 1. seed N emails through store.mail.saveThreads, 2,000 per save, then the first plain search, the first type:
//    search on a read-only open and on a writable open;
// 2. sync-sized saves on that store: 20 saves of 50 new threads of 2 emails (mail sync saves 50 threads per write);
// 3. a store upgraded to version 76 (every type cleared), one sync-sized save, then the same first searches;
// 4. the same with the catch-up that mail sync runs once it has saved (builds that have it);
// 5. every email queued for its words again too, as a stemmer change leaves a store, one save and its catch-up.
// Usage: node first-search.mjs <cli-core checkout> [N]
import { mkdtempSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 100000)
const { openStore } = await import(join(repo, "dist/store/index.js"))
const { openCache } = await import(join(repo, "dist/store/open.js"))
const { searchStore } = await import(join(repo, "dist/services/messages-archive-search.js"))
const ME = "owner@home.example.com"
const MAIL = { provider: "email", account: ME }
const NOW = Date.parse("2026-11-25T12:00:00Z")
const say = (line) => process.stdout.write(`${line}\n`)

const time = async (label, work) => {
  const start = performance.now()
  const result = await work()
  say(`${label}: ${Math.round(performance.now() - start)} ms`)
  return result
}

const ONE_CLICK = { "list-unsubscribe": true, "list-unsubscribe-post": true }

// About the mix of a real inbox: most mail is lists and shops, a fifth is people.
const emailOf = (n) => {
  const at = NOW - n * 60_000
  const base = { externalId: `<m${n}@bench.example.com>`, sentAt: at, receivedAt: at, bodyText: null }
  const to = [{ address: ME, name: null }]
  const slot = n % 20
  if (slot < 8) {
    const list = n % 200
    return {
      ...base,
      subject: `Issue ${n}`,
      from: { address: `editor@list${list}.example.com`, name: `List ${list}` },
      to,
      headers: { "list-id": `list${list}.example.com`, "list-unsubscribe": true },
    }
  }
  if (slot < 12) {
    const shop = n % 300
    return {
      ...base,
      subject: `Winter sale ${n}: 30% off`,
      from: { address: `shop@shop${shop}.example.com`, name: `Shop ${shop}` },
      to,
      headers: ONE_CLICK,
    }
  }
  if (slot < 15) {
    const shop = n % 300
    return {
      ...base,
      subject: `Thank you for your order #${n}`,
      from: { address: `shop@shop${shop}.example.com`, name: `Shop ${shop}` },
      to,
    }
  }
  if (slot === 15)
    return {
      ...base,
      subject: "New sign-in to your account",
      from: { address: `security@bank${n % 50}.example.com`, name: "Bank" },
      to,
    }
  if (slot === 16)
    return {
      ...base,
      subject: `Re: plan ${n}`,
      from: { address: ME, name: "Me" },
      to: [{ address: `person${n % 2000}@firm${n % 300}.example.com`, name: null }],
      outgoing: true,
    }
  return {
    ...base,
    subject: `Hello ${n}`,
    from: { address: `person${n % 2000}@firm${n % 300}.example.com`, name: `Person ${n % 2000}` },
    to,
  }
}

const cpuMs = (since) => {
  const { user, system } = process.cpuUsage(since)
  return (user + system) / 1000
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const seeded = async () => {
  const path = join(mkdtempSync(join(tmpdir(), "mail-first-search-")), "store.db")
  const store = await openStore({ path })
  const accountId = await store.accounts.saveAccount(MAIL, { name: null })
  const saves = []
  const cpus = []
  for (let at = 0; at < N; at += 2000) {
    const threads = []
    for (let t = at; t < Math.min(N, at + 2000); t += 100)
      threads.push({
        accountId,
        externalId: `t${t}`,
        now: NOW,
        emails: Array.from({ length: Math.min(100, N - t) }, (_, i) => emailOf(t + i)),
      })
    const start = performance.now()
    const cpu = process.cpuUsage()
    await store.mail.saveThreads(threads)
    saves.push(performance.now() - start)
    cpus.push(cpuMs(cpu))
  }
  say(`  CPU per save: median ${Math.round(median(cpus))} ms`)
  say(
    `  ${saves.length} saves of 2,000 emails: median ${Math.round(median(saves))} ms, max ${Math.round(Math.max(...saves))} ms`,
  )
  return { store, path, accountId }
}

const syncSlices = async (store, accountId, from) => {
  const saves = []
  const cpus = []
  for (let slice = 0; slice < 20; slice++) {
    const threads = Array.from({ length: 50 }, (_, t) => {
      const n = from + (slice * 50 + t) * 2
      return { accountId, externalId: `s${n}`, now: NOW, emails: [emailOf(n), emailOf(n + 1)] }
    })
    const start = performance.now()
    const cpu = process.cpuUsage()
    await store.mail.saveThreads(threads)
    saves.push(performance.now() - start)
    cpus.push(cpuMs(cpu))
  }
  say(`  CPU per save: median ${Math.round(median(cpus))} ms`)
  say(
    `  20 sync-sized saves (50 threads, 100 emails): median ${Math.round(median(saves))} ms, max ${Math.round(Math.max(...saves))} ms`,
  )
}

const search = (store, text) => searchStore(store, MAIL, { text, kind: "mail", limit: 20 })
const shown = async (label, store, text) => {
  try {
    const found = await time(label, () => search(store, text))
    say(
      `  ${found.items.length} hits, first: ${found.items[0]?.email?.mailType ?? "-"}/${found.items[0]?.email?.reach ?? "-"}`,
    )
  } catch (error) {
    say(`  failed: ${error.message}`)
  }
}

const firstSearches = async (path, db) => {
  const count = (sql) => Number(db.prepare(sql).get().n)
  const left = () =>
    `untyped ${count("SELECT count(*) AS n FROM emails WHERE mail_type IS NULL")}, ` +
    `queued for words ${count("SELECT count(*) AS n FROM email_index_pending WHERE indexable_type = 'email'")}`
  say(`  ${left()}`)
  const readOnly = await openStore({ path, readOnly: true })
  await shown("  read-only open: type:order, first 20", readOnly, "type:order")
  await shown("  read-only open: hello reach:direct, first 20", readOnly, "hello reach:direct")
  await readOnly.close()
  const writer = await openStore({ path })
  await shown("  writable open: first plain search, hello, first 20", writer, "hello")
  await shown("  writable open: first type:order, first 20", writer, "type:order")
  await shown("  warm type:order, first 20", writer, "type:order")
  await shown("  warm hello, first 20", writer, "hello")
  say(`  ${left()}`)
  return writer
}

say(
  `node ${process.version}, N = ${N}, load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
say("1. fresh store")
const { store, path, accountId } = await time(`  seed ${N} emails`, seeded)
await store.close()
const db = await openCache(path)
let writer = await firstSearches(path, db)
say("2. sync-sized saves")
await syncSlices(writer, accountId, N)
await writer.close()
const clearTypes = () =>
  db.exec("UPDATE emails SET mail_type = NULL, reach = NULL, type_signal = NULL, sort_checked = NULL")
const queueWords = () =>
  db.exec("INSERT OR IGNORE INTO email_index_pending (indexable_type, id) SELECT 'email', id FROM emails")
let next = N + 10_000
const oneSlice = async () => {
  writer = await openStore({ path })
  await time("  one sync-sized save", () =>
    writer.mail.saveThreads(
      Array.from({ length: 50 }, () => {
        next += 2
        return { accountId, externalId: `u${next}`, now: NOW, emails: [emailOf(next), emailOf(next + 1)] }
      }),
    ),
  )
}
const catchUp = async () => {
  if (typeof writer.mail.catchUp === "function")
    await time("  catch-up at the end of the sync", () => writer.mail.catchUp())
  else say("  this build has no catch-up step")
  await writer.close()
}
say("3. store upgraded to version 76: every type cleared, one sync-sized save, then the first searches")
clearTypes()
await oneSlice()
await writer.close()
writer = await firstSearches(path, db)
await writer.close()
say("4. the same upgrade, one sync-sized save and its catch-up, then the first searches")
clearTypes()
await oneSlice()
await catchUp()
writer = await firstSearches(path, db)
await writer.close()
say("5. every email queued for its words again (a stemmer change) and every type cleared, one save and its catch-up")
clearTypes()
queueWords()
await oneSlice()
await catchUp()
writer = await firstSearches(path, db)
await writer.close()
say(
  `load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
db.close()
