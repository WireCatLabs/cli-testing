// Times cli-core store version 77 mail sorting rules on synthetic mail: what the rule check adds to typing every
// email, and how long a domain rule takes to apply to past mail (a type rule on a company domain and on a free-mail
// domain, and a rule that moves a domain's senders to bots). Usage: node bench.mjs <cli-core checkout> [N] [senders]
import { mkdtempSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 100000)
const SENDERS = Number(process.argv[4] ?? 20000)
const { openStore } = await import(join(repo, "dist/store/index.js"))
const { openCache } = await import(join(repo, "dist/store/open.js"))
const { typesOf } = await import(join(repo, "dist/store/sqlite/email-types.js"))
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

// 30% of senders on one free-mail domain, 500 on one shop, the rest over 2,000 company domains.
const FREE = Math.round(SENDERS * 0.3)
const SHOP = 500
const addressOf = (s) =>
  s < FREE ? `user${s}@gmail.com` : s < FREE + SHOP ? `desk${s}@bigshop.example` : `person${s}@org${s % 2000}.example`

const emailOf = (n) => {
  const at = NOW - n * 60_000
  const s = n % SENDERS
  const list = n % 10 < 3
  return {
    externalId: `<m${n}@bench.example.com>`,
    subject: list ? `Issue ${n}` : n % 10 === 3 ? `Your order #${n}` : `Hello ${n}`,
    from: { address: addressOf(s), name: `Sender ${s}` },
    to: [{ address: ME, name: null }],
    sentAt: at,
    receivedAt: at,
    bodyText: null,
    headers: list ? { "list-id": `list${n % 300}.example.com`, "list-unsubscribe": true } : {},
  }
}

const seeded = async () => {
  const path = join(mkdtempSync(join(tmpdir(), "mail-rules-")), "store.db")
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
  `node ${process.version}, N = ${N}, senders = ${SENDERS}, load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
const { store, path } = await time(`seed ${N} emails from ${SENDERS} senders`, seeded)
const db = await openCache(path)
const count = (sql) => Number(db.prepare(sql).get().n)
const ids = db
  .prepare("SELECT id FROM emails ORDER BY id")
  .all()
  .map((row) => Number(row.id))

// The fastest of three, after one warm-up pass, so the JIT and the page cache do not favour the second measurement.
const inMemory = async (label) => {
  const pass = () => {
    const start = performance.now()
    const senders = new Map()
    for (let at = 0; at < ids.length; at += 5000) typesOf(db, ids.slice(at, at + 5000), senders)
    return performance.now() - start
  }
  pass()
  const best = Math.min(pass(), pass(), pass())
  say(`${label}: typesOf over all ${N} in memory, nothing kept, best of 3: ${Math.round(best)} ms`)
}

// 1. The rule check's cost, apart from disk: typing in memory with no rule, then with 50.
await inMemory("no rules")
await time("first typed read, no rules (types kept)", () => store.mail.emails({ types: ["order"], limit: 50 }))
const rules = [
  ...Array.from({ length: 20 }, (_, i) => ({ scope: "address", value: addressOf(FREE + SHOP + i * 37) })),
  ...Array.from({ length: 20 }, (_, i) => ({ scope: "domain", value: `org${i * 13}.example` })),
  ...Array.from({ length: 5 }, (_, i) => ({ scope: "list", value: `list${i * 7}.example.com` })),
  ...Array.from({ length: 5 }, (_, i) => ({ scope: "subject", value: `winter sale ${i}` })),
]
await time("50 rules added (address, domain, list, subject)", async () => {
  for (const rule of rules) await store.mail.sorting.add({ ...rule, mailType: "promotion", applyTo: "all" }, "owner")
})
await inMemory("50 rules")
db.prepare("UPDATE emails SET mail_type = NULL, reach = NULL, type_signal = NULL").run()
await time("first typed read, 50 rules (types kept)", () => store.mail.emails({ types: ["order"], limit: 50 }))
say(`typed by a rule: ${count("SELECT count(*) AS n FROM emails WHERE type_signal LIKE 'rule:%'")}`)

// 2. A type rule on a company domain, applied to past mail.
const company = "org1999.example"
const small = await time(`domain rule ${company}: add, past mail cleared`, () =>
  store.mail.sorting.add({ scope: "domain", value: company, mailType: "bill", applyTo: "all" }, "owner"),
)
say(`  touches ${small.preview.addresses} addresses, ${small.preview.emails} emails`)
await time("  next typed read", () => store.mail.emails({ types: ["bill"], limit: 50 }))

// 3. A type rule on the free-mail domain: dry run, then the add with its confirm, then the next read.
const free = { scope: "domain", value: "gmail.com", mailType: "newsletter", applyTo: "all" }
const dry = await time("free-mail domain rule gmail.com: dry run", () =>
  store.mail.sorting.add(free, "owner", { dryRun: true }),
)
say(`  touches ${dry.preview.addresses} addresses, ${dry.preview.emails} emails, retypes ${dry.preview.retyped}`)
await time("  add with confirm, past mail cleared", () =>
  store.mail.sorting.add(free, "owner", { confirm: dry.preview.confirm }),
)
say(`  untyped after the add: ${count("SELECT count(*) AS n FROM emails WHERE mail_type IS NULL")}`)
await time("  next typed read: retyped", () => store.mail.emails({ types: ["newsletter"], limit: 50 }))

// 4. Undo of that rule: its mail typed again without it.
await time("undo the gmail.com rule", () => store.mail.sorting.undo("owner"))
await time("  next typed read", () => store.mail.emails({ types: ["newsletter"], limit: 50 }))

// 5. A rule that moves a domain's 500 senders to bots, each through moveToBot.
const bots = await time(`sender rule bigshop.example → bot: ${SHOP} senders moved`, () =>
  store.mail.sorting.add({ scope: "domain", value: "bigshop.example", sender: "bot", applyTo: "all" }, "owner"),
)
say(`  moved ${bots.preview.senders}, bots now ${count("SELECT count(*) AS n FROM sender_bots")}`)
await time("  next typed read (bot moves cleared their mail's types)", () =>
  store.mail.emails({ types: ["order"], limit: 50 }),
)
await time("  remove it: senders moved back", () => store.mail.sorting.remove(bots.rule.id, "owner"))
say(
  `  bots holding an identity after the removal: ${count("SELECT count(DISTINCT bot_id) AS n FROM sender_bot_identities")}`,
)

await store.close()
db.close()
