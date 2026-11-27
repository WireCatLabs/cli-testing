// Times read-only type: and reach: searches on a store whose mail is not typed yet, as an upgrade to version 76 leaves
// it: three searches each on a fresh read-only open, then three on one open (as an MCP server keeps it). Seeds N
// synthetic emails (a smaller mix than first-search.mjs: lists, shops, orders, people), or reuses the store at <path>.
// Usage: node type-search-budget.mjs <cli-core checkout> [N] [store path]
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const repo = process.argv[2]
const N = Number(process.argv[3] ?? 100000)
const keep = process.argv[4]
const { openStore } = await import(join(repo, "dist/store/index.js"))
const { openCache } = await import(join(repo, "dist/store/open.js"))
const { searchStore } = await import(join(repo, "dist/services/messages-archive-search.js"))
const ME = "owner@home.example.com"
const MAIL = { provider: "email", account: ME }
const NOW = Date.parse("2026-11-25T12:00:00Z")
const say = (line) => process.stdout.write(`${line}\n`)
const emailOf = (n) => {
  const at = NOW - n * 60_000
  const base = { externalId: `<m${n}@bench.example.com>`, sentAt: at, receivedAt: at, bodyText: null }
  const to = [{ address: ME, name: null }]
  const slot = n % 20
  if (slot < 8)
    return {
      ...base,
      subject: `Issue ${n}`,
      from: { address: `editor@list${n % 200}.example.com`, name: "L" },
      to,
      headers: { "list-id": `list${n % 200}.example.com`, "list-unsubscribe": true },
    }
  if (slot < 12)
    return {
      ...base,
      subject: `Winter sale ${n}`,
      from: { address: `shop@shop${n % 300}.example.com`, name: "S" },
      to,
      headers: { "list-unsubscribe": true, "list-unsubscribe-post": true },
    }
  if (slot < 15)
    return {
      ...base,
      subject: `Thank you for your order #${n}`,
      from: { address: `shop@shop${n % 300}.example.com`, name: "S" },
      to,
    }
  return {
    ...base,
    subject: `Hello ${n}`,
    from: { address: `person${n % 2000}@firm${n % 300}.example.com`, name: "P" },
    to,
  }
}
let path = keep && existsSync(keep) ? keep : undefined
if (!path) {
  path = keep ?? join(mkdtempSync(join(tmpdir(), "mail-probe-")), "store.db")
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
  await store.close()
  say(`seeded ${path}`)
}
const db = await openCache(path)
db.exec("UPDATE emails SET mail_type = NULL, reach = NULL, type_signal = NULL, sort_checked = NULL")
for (const text of ["type:order", "hello reach:direct", "type:order"]) {
  const ro = await openStore({ path, readOnly: true })
  const start = performance.now()
  try {
    const found = await searchStore(ro, MAIL, { text, kind: "mail", limit: 20 })
    say(
      `read-only ${text}: ${Math.round(performance.now() - start)} ms, ${found.items.length} hits, total ${JSON.stringify(found.total)}`,
    )
  } catch (error) {
    say(`read-only ${text}: ${Math.round(performance.now() - start)} ms, failed: ${error.message}`)
  }
  await ro.close()
}
db.close()
const one = await openStore({ path, readOnly: true })
for (const text of ["type:order", "hello reach:direct", "type:order"]) {
  const start = performance.now()
  const found = await searchStore(one, MAIL, { text, kind: "mail", limit: 20 })
  say(`one open ${text}: ${Math.round(performance.now() - start)} ms, total ${JSON.stringify(found.total)}`)
}
await one.close()
