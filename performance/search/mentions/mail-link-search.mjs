// Times `url:` (a whole tracking link) and `link:` (its path) in mail search on a copy of a store, after the url
// rebuild. Prints totals only: never a link, a subject or a text.
// node mail-link-search.mjs <cli-core dist> <store copy> [sample] [--no-rebuild]
import { DatabaseSync } from "node:sqlite"

const [, , dist, path, size = "30", skip] = process.argv
const { openStore } = await import(`${dist}/store/store.js`)
const { findMentions, trackedOrigin } = await import(`${dist}/domain/mentions.js`)

const store = await openStore({ path })
const t = Date.now()
if (skip !== "--no-rebuild") await store.rebuildMentions({ kinds: ["url"] })
const rebuildSeconds = (Date.now() - t) / 1000

const raw = new DatabaseSync(path, { readOnly: true })
const accounts = raw
  .prepare("SELECT provider, external_id AS account FROM accounts WHERE provider = 'email'")
  .all()
  .map(({ provider, account }) => ({ provider, account }))
const letters = raw
  .prepare(
    `SELECT e.id, e.external_id, coalesce(e.subject, '') || char(10, 10) || coalesce(e.body_text, '') AS text
     FROM emails e WHERE e.deleted_at IS NULL AND e.id IN (SELECT source_id FROM mentions
       WHERE source_type = 'email' AND kind = 'url' AND value NOT LIKE '%://%/%')
     ORDER BY random() LIMIT ?`,
  )
  .all(Number(size))
raw.close()

const run = async (field, value) => {
  const started = process.hrtime.bigint()
  const page = await store.matchQuery({
    root: { kind: "predicate", field, operator: "phrase", value, span: { start: 0, end: 1 } },
    accounts,
    limit: 50,
    corpus: "mail",
  })
  return {
    ms: Number(process.hrtime.bigint() - started) / 1e6,
    ids: page.items.map(({ id }) => id),
    more: page.hasMore,
  }
}

const stats = { url: [], link: [], domain: [] }
const found = { url: 0, link: 0 }
const full = { url: 0, link: 0 }
for (const letter of letters) {
  const link = findMentions(String(letter.text)).find(
    (one) => one.kind === "url" && trackedOrigin(one.value) !== undefined,
  )
  if (!link) continue
  const written = String(letter.text).slice(link.start, link.end)
  const url = await run("url", written)
  stats.url.push(url.ms)
  if (url.ids.includes(letter.external_id) || url.more) found.url++
  if (url.more) full.url++
  const part = new URL(link.value).pathname
  if (part.length > 1) {
    const linked = await run("link", part)
    stats.link.push(linked.ms)
    if (linked.ids.includes(letter.external_id) || linked.more) found.link++
    if (linked.more) full.link++
  }
  stats.domain.push((await run("domain", link.domain)).ms)
}
await store.close()

const summary = (list) => {
  const sorted = [...list].sort((a, b) => a - b)
  return {
    n: sorted.length,
    medianMs: Math.round(sorted[sorted.length >> 1] ?? 0),
    maxMs: Math.round(sorted.at(-1) ?? 0),
  }
}
process.stdout.write(
  `${JSON.stringify({
    rebuildSeconds,
    mailAccounts: accounts.length,
    sampled: letters.length,
    url: { ...summary(stats.url), foundTheLetterOrPageFull: found.url, pageFull: full.url },
    link: { ...summary(stats.link), foundTheLetterOrPageFull: found.link, pageFull: full.link },
    domain: summary(stats.domain),
  })}\n`,
)
