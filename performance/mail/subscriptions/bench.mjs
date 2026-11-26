// Times cli-core's subscriptions read (store.mail.subscriptions: broadcast mail grouped by List-Id, else by sender,
// paged in SQL) and the bots filter by what a bot sends (people.listBots sends), on synthetic mail.
// Usage: node bench.mjs <cli-core checkout> [N] [runs]
import { mkdtempSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 100000)
const RUNS = Number(process.argv[4] ?? 5)
const { openStore } = await import(join(repo, "dist/store/index.js"))
const { openCache } = await import(join(repo, "dist/store/open.js"))
const ME = "owner@home.example.com"
const MAIL = { provider: "email", account: ME }
const NOW = Date.parse("2026-11-25T12:00:00Z")
const say = (line) => process.stdout.write(`${line}\n`)

const once = async (work) => {
  const start = performance.now()
  const result = await work()
  return { ms: performance.now() - start, result }
}

const time = async (label, work) => {
  const { ms, result } = await once(work)
  say(`${label}: ${Math.round(ms)} ms`)
  return result
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const warm = async (label, work) => {
  const times = []
  let result
  for (let run = 0; run < RUNS; run += 1) {
    const done = await once(work)
    times.push(done.ms)
    result = done.result
  }
  say(
    `${label}: median ${Math.round(median(times))} ms, min ${Math.round(Math.min(...times))}, max ${Math.round(Math.max(...times))}`,
  )
  return result
}

const target = (domain, n) => ({
  "list-unsubscribe": true,
  "list-unsubscribe-https": `https://${domain}/u/${n}`,
  "list-unsubscribe-mailto": `mailto:leave@${domain}`,
})

// The mix of search.mjs in ../types, most mail lists and shops and a fifth people, with more senders: 1,000 lists and
// 600 shops. Half the lists and every shop name a signed unsubscribe target; the sales add one-click.
const emailOf = (n) => {
  const at = NOW - n * 60_000
  const base = { externalId: `<m${n}@bench.example.com>`, sentAt: at, receivedAt: at, bodyText: null }
  const to = [{ address: ME, name: null }]
  const slot = n % 20
  if (slot < 8) {
    const list = Math.floor(n / 20) % 1000
    const domain = `list${list}.example.com`
    return {
      ...base,
      subject: `Issue ${n}`,
      from: { address: `editor@${domain}`, name: `List ${list}` },
      to,
      headers: { "list-id": domain, ...(list % 2 === 0 ? target(domain, n) : { "list-unsubscribe": true }) },
    }
  }
  if (slot < 12) {
    const shop = Math.floor(n / 20) % 600
    const domain = `shop${shop}.example.com`
    return {
      ...base,
      subject: `Winter sale ${n}: 30% off`,
      from: { address: `shop@${domain}`, name: `Shop ${shop}` },
      to,
      headers: { ...target(domain, n), "list-unsubscribe-post": true },
    }
  }
  if (slot < 15) {
    const shop = Math.floor(n / 20) % 600
    return {
      ...base,
      subject: `Thank you for your order #${n}`,
      from: { address: `noreply@shop${shop}.example.com`, name: `Shop ${shop}` },
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

const seeded = async () => {
  const path = join(mkdtempSync(join(tmpdir(), "mail-subscriptions-")), "store.db")
  const store = await openStore({ path })
  const accountId = await store.accounts.saveAccount(MAIL, { name: null })
  for (let at = 0; at < N; at += 2000) {
    const threads = []
    for (let t = at; t < Math.min(N, at + 2000); t += 100)
      threads.push({
        accountId,
        externalId: `t${t}`,
        now: NOW,
        emails: Array.from({ length: Math.min(100, N - t) }, (_, i) => emailOf(t + i)),
      })
    await store.mail.saveThreads(threads)
  }
  await store.people.savePeople({ provider: "telegram", account: "1" }, [
    ...Array.from({ length: 40 }, (_, i) => ({ id: String(100 + i), name: `Helper ${i}`, isBot: true })),
  ])
  return { store, path }
}

say(
  `node ${process.version}, N = ${N}, runs = ${RUNS}, load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
const { store, path } = await time(`seed ${N} emails`, seeded)
await store.close()
const db = await openCache(path)
const untyped = () => Number(db.prepare("SELECT count(*) AS n FROM emails WHERE mail_type IS NULL").get().n)
say(`untyped emails before the first read: ${untyped()}`)

{
  const readOnly = await openStore({ path, readOnly: true })
  const page = await time("read-only open, untyped: subscriptions, first 50", () =>
    readOnly.mail.subscriptions({ limit: 50 }),
  )
  say(`  ${page.total} groups, first: ${page.items[0]?.key} (${page.items[0]?.emails} emails)`)
  await readOnly.close()
}
say(`untyped after the read-only read: ${untyped()}`)

const writer = await openStore({ path })
const first = await time(`writable open, first read: types for ${N} emails, then subscriptions, first 50`, () =>
  writer.mail.subscriptions({ limit: 50 }),
)
say(`  untyped after: ${untyped()}, ${first.total} groups`)
const broadcast = Number(db.prepare("SELECT count(*) AS n FROM emails WHERE reach = 'broadcast'").get().n)
say(`  broadcast emails: ${broadcast}`)
const withTarget = first.items.filter((item) => item.unsubscribe !== null).length
say(
  `  first page: ${withTarget} of ${first.items.length} groups can unsubscribe, one-click: ${first.items.filter((item) => item.unsubscribe?.oneClick).length}`,
)

await warm("warm subscriptions, first 50", () => writer.mail.subscriptions({ limit: 50 }))
await warm("warm subscriptions, page 10 of 50 (offset 450)", () =>
  writer.mail.subscriptions({ limit: 50, offset: 450 }),
)
await warm("warm subscriptions, past the end (offset 5000)", () =>
  writer.mail.subscriptions({ limit: 50, offset: 5000 }),
)
await warm("warm subscriptions, first 500", () => writer.mail.subscriptions({ limit: 500 }))
await warm("warm subscriptions, types [promotion], first 50", () =>
  writer.mail.subscriptions({ limit: 50, types: ["promotion"] }),
)
await warm("warm subscriptions, last 7 days, first 50", () =>
  writer.mail.subscriptions({ limit: 50, since: NOW - 7 * 86_400_000 }),
)
await warm("warm mailSenders reach [broadcast], first 50 (for comparison)", () =>
  writer.mail.mailSenders({ reaches: ["broadcast"], limit: 50 }),
)

await time("people list: sorts senders into bots", () => writer.people.list({ limit: 0 }))
const bots = await writer.people.listBots({ limit: 1 })
say(`  bots: ${bots.total}`)
for (const sends of [["alerts"], ["receipts"], ["marketing"], ["messenger"], ["alerts", "receipts", "messenger"]]) {
  const found = await warm(`warm listBots sends [${sends.join(", ")}], first 50`, () =>
    writer.people.listBots({ limit: 50, sends }),
  )
  say(`  ${found.total} bots`)
}
await warm("warm listBots, no filter, first 50", () => writer.people.listBots({ limit: 50 }))
await writer.close()
db.close()
