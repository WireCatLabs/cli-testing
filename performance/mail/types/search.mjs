// Times the type: and reach: fields of cli-core's mail search on synthetic mail: a read-only open of a store never
// typed (types worked out in memory for that search), the first such search on a writable open (every email typed
// first, a batch of 5,000 per write), and warm searches next to a plain word search.
// Usage: node search.mjs <cli-core checkout> [N]
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

const seeded = async () => {
  const path = join(mkdtempSync(join(tmpdir(), "mail-search-types-")), "store.db")
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

const search = (store, text) => searchStore(store, MAIL, { text, kind: "mail", limit: 20 })
const shown = async (label, store, text) => {
  const found = await time(label, () => search(store, text))
  say(
    `  ${found.items.length} hits, first: ${found.items[0]?.email?.mailType ?? "-"}/${found.items[0]?.email?.reach ?? "-"}`,
  )
}

say(
  `node ${process.version}, N = ${N}, load ${loadavg()
    .map((x) => x.toFixed(1))
    .join(" ")}`,
)
const { store, path } = await time(`seed ${N} emails`, seeded)
await shown("plain word search before any typing: hello, first 20", store, "hello")
await store.close()
const db = await openCache(path)
const untyped = () => Number(db.prepare("SELECT count(*) AS n FROM emails WHERE mail_type IS NULL").get().n)
say(`untyped before the first typed search: ${untyped()}`)

{
  const readOnly = await openStore({ path, readOnly: true })
  await shown("read-only open, untyped: type:order, first 20", readOnly, "type:order")
  await shown("read-only open, untyped: hello reach:direct, first 20", readOnly, "hello reach:direct")
  await readOnly.close()
}
say(`untyped after the read-only searches: ${untyped()}`)

const writer = await openStore({ path })
await shown(`first search on a writable open: types for ${N} emails, then type:order, first 20`, writer, "type:order")
say(`untyped after: ${untyped()}`)
await shown("warm type:order, first 20", writer, "type:order")
await shown("warm type:order OR type:bill, first 20", writer, "type:order OR type:bill")
await shown("warm reach:broadcast, first 20", writer, "reach:broadcast")
await shown("warm hello type:personal, first 20", writer, "hello type:personal")
await shown("warm order -type:promotion, first 20", writer, "order -type:promotion")
await shown("warm hello, no type, first 20", writer, "hello")
await writer.close()
db.close()
