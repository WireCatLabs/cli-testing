// Times cli-core store version 76 on synthetic mail: typing N emails a store never typed (the first read after the
// upgrade), one batch under the write lock, warm filtered reads, the per-sender summary, a query-only open that works
// types out in memory, and what one trigger clears. Usage: node bench.mjs <cli-core checkout> [N]
import { mkdtempSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 100000)
const { openStore } = await import(join(repo, "dist/store/index.js"))
const { openCache } = await import(join(repo, "dist/store/open.js"))
const { storeMailTypes } = await import(join(repo, "dist/store/sqlite/email-types.js"))
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

const seeded = async () => {
  const path = join(mkdtempSync(join(tmpdir(), "mail-types-")), "store.db")
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
  return { store, path }
}

say(
  `node ${process.version}, N = ${N}, load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
const { store, path } = await time(`seed ${N} emails`, seeded)
const db = await openCache(path)
const untyped = () => Number(db.prepare("SELECT count(*) AS n FROM emails WHERE mail_type IS NULL").get().n)
say(`untyped before the first read: ${untyped()}`)

// 1. A query-only open of the untyped store: types worked out in memory for the read, nothing kept.
await store.close()
{
  const readOnly = await openStore({ path, readOnly: true })
  await time("query-only open, untyped: emails types:[order], first 50", () =>
    readOnly.mail.emails({ types: ["order"], limit: 50 }),
  )
  await time("query-only open, untyped: mailSenders reach:broadcast", () =>
    readOnly.mail.mailSenders({ reaches: ["broadcast"], limit: 50 }),
  )
  await readOnly.close()
}
const writer = await openStore({ path })

// 2. The first read that asks: every email typed, a batch of 5,000 per write.
await time(`first read: types for ${N} emails, then emails types:[order], first 50`, () =>
  writer.mail.emails({ types: ["order"], limit: 50 }),
)
say(`untyped after: ${untyped()}`)

// 3. One batch under the lock: 5,000 emails cleared, then worked out again by the same writer function.
db.prepare("UPDATE emails SET mail_type = NULL WHERE id IN (SELECT id FROM emails ORDER BY id LIMIT 5000)").run()
const raw = await openCache(path)
await time("one batch of 5,000 under the write lock", () => storeMailTypes(raw))
raw.close()

// 4. Warm reads.
await time("warm emails types:[order], first 50", () => writer.mail.emails({ types: ["order"], limit: 50 }))
await time("warm emails types:[newsletter] reaches:[broadcast], first 50", () =>
  writer.mail.emails({ types: ["newsletter"], reaches: ["broadcast"], limit: 50 }),
)
await time("warm emails, no filter, first 50", () => writer.mail.emails({ limit: 50 }))
const subs = await time("mailSenders reach:broadcast, first 50", () =>
  writer.mail.mailSenders({ reaches: ["broadcast"], limit: 50 }),
)
say(`senders with broadcast mail: ${subs.total}`)
const all = await time("mailSenders, all, first 50", () => writer.mail.mailSenders({ limit: 50 }))
say(`senders: ${all.total}`)
const counts = db.prepare("SELECT mail_type, count(*) AS n FROM emails GROUP BY 1 ORDER BY 2 DESC").all()
say(`types: ${counts.map((row) => `${row.mail_type} ${row.n}`).join(", ")}`)

// 5. A trigger: the owner's first mail to a sender clears that sender's typed mail.
const accountId = Number(db.prepare("SELECT id FROM accounts LIMIT 1").get().id)
await time("owner's first mail to shop8: save, triggers included", () =>
  writer.mail.saveThread({
    accountId,
    externalId: "reply",
    now: NOW,
    emails: [
      {
        externalId: "<reply@bench.example.com>",
        subject: "Question",
        from: { address: ME, name: "Me" },
        to: [{ address: "shop@shop8.example.com", name: null }],
        sentAt: NOW,
        receivedAt: NOW,
        bodyText: null,
        outgoing: true,
      },
    ],
  }),
)
say(`cleared by it: ${untyped()}`)

// 6. A rules change: every type worked out again.
db.prepare("DELETE FROM store_settings WHERE key = 'mail.type_rules'").run()
await time(`rules changed: ${N} emails typed again`, () => writer.mail.emails({ types: ["order"], limit: 50 }))
await writer.close()
db.close()
