// Prints how much stored full-text mail each score threshold would rank lower; signal names and counts only.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [rowsPath, dist] = process.argv.slice(2)
const { probeMail, groupKey } = await import(pathToFileURL(join(dist, "mail/probe.js")).href)
const { WEIGHTS } = await import(pathToFileURL(join(dist, "mail/score.js")).href)
const rows = JSON.parse(readFileSync(rowsPath, "utf8"))
const items = rows.map((r) => ({
  messageId: r.id,
  threadId: "",
  receivedAt: new Date(r.at ?? 0).toISOString(),
  labels: [...JSON.parse(r.labels ?? "[]"), ...(r.o ? ["Sent"] : [])],
  ...(r.r === null ? {} : { seen: Boolean(r.r) }),
  ...(r.s === null ? {} : { size: r.s }),
  headers: {
    ...(r.f ? { from: r.f } : {}),
    ...(r.n ? { fromName: r.n } : {}),
    ...(r.l ? { listId: r.l } : {}),
    ...(r.rt ? { replyTo: r.rt } : {}),
    to: JSON.parse(r.rcpt ?? "[]"),
    bulk: Boolean(r.bulk),
    ...(r.dkim || r.dmarc
      ? { auth: { ...(r.dkim ? { dkim: r.dkim } : {}), ...(r.dmarc ? { dmarc: r.dmarc } : {}) } }
      : {}),
  },
  full: Boolean(r.fulltext),
}))
const probe = probeMail(items, Number.MAX_SAFE_INTEGER)
const byKey = new Map(probe.items.map((g) => [g.listId === null ? `from:${g.from}` : `list:${g.listId}`, g]))
// Signals of forgery or fraud, as opposed to engagement (never opened, bulk) that bills and newsletters share.
const STRONG = ["dmarc_fail", "brand_spoof", "young_domain", "reply_to_elsewhere", "disposable_domain"]
const strong = (g) => g.signals.filter((s) => STRONG.includes(s)).reduce((n, s) => n + WEIGHTS[s], g.replied ? -5 : 0)
const full = items.filter((i) => i.full && !i.labels.includes("Sent") && (i.headers.from || i.headers.listId))
const tally = (pick) => {
  const groups = new Set()
  let emails = 0
  for (const item of full) {
    const group = byKey.get(groupKey(item.headers))
    if (group && pick(group)) {
      groups.add(group)
      emails++
    }
  }
  return { groups: groups.size, emails }
}
const combos = new Map()
for (const item of full) {
  const group = byKey.get(groupKey(item.headers))
  if (group && strong(group) >= 3) combos.set(group.signals.join("+"), (combos.get(group.signals.join("+")) ?? 0) + 1)
}
process.stdout.write(
  JSON.stringify(
    {
      stored: items.length,
      fullText: full.length,
      groups: probe.groups,
      allSignalsAtLeast3: tally((g) => g.score >= 3),
      strongSignalsAtLeast3: tally((g) => strong(g) >= 3),
      strongSignalsAtLeast2: tally((g) => strong(g) >= 2),
      strongAtLeast3BySignals: [...combos].sort((a, b) => b[1] - a[1]),
    },
    null,
    1,
  ) + "\n",
)
