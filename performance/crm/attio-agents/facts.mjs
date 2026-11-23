#!/usr/bin/env node
// Prints the totals the answer key needs, computed from seed-data.mjs, so no sum in key.md rests on an agent's
// arithmetic. The three deals an earlier live check left in the workspace (attio-cli's bin/seed-test-deals) count
// too: they are in Attio, so every contestant sees them.
// Usage: node facts.mjs
import * as data from "./seed-data.mjs"

const BEFORE = [
  { name: "Northwind annual renewal (WireCat test)", stage: "Lead", amount: 12000 },
  { name: "Northwind expansion (WireCat test)", stage: "In Progress", amount: 4500 },
  { name: "Bluebird pilot (WireCat test)", stage: "Lost", amount: 8000 },
]
const say = (line) => process.stdout.write(`${line}\n`)
const money = (n) => n.toLocaleString("en-US")
const deals = [...data.deals.map((d) => ({ ...d, name: `${d.name} ${data.MARKER}` })), ...BEFORE]
const open = (d) => d.stage === "Lead" || d.stage === "In Progress"

say("## Pipeline by stage (seeded + earlier)")
for (const stage of ["Lead", "In Progress", "Won 🎉", "Lost"]) {
  const mine = deals.filter((d) => d.stage === stage)
  say(`${stage}: ${mine.length} deals, ${money(mine.reduce((s, d) => s + d.amount, 0))} USD`)
}
const openDeals = deals.filter(open)
say(`open in all: ${openDeals.length} deals, ${money(openDeals.reduce((s, d) => s + d.amount, 0))} USD`)
const biggest = [...openDeals].sort((a, b) => b.amount - a.amount).slice(0, 3)
say(`biggest open: ${biggest.map((d) => `${d.name} ${money(d.amount)}`).join(" | ")}`)

say("\n## Open deals closing by 2026-11-30")
for (const d of openDeals.filter((d) => d.close && d.close <= "2026-11-30"))
  say(`${d.name}: ${d.close}, ${money(d.amount)}`)

const won = deals.filter((d) => d.stage === "Won 🎉" && d.close >= "2026-09-01" && d.close <= "2026-11-30")
say(
  `\n## Won with close date 2026-09-01..2026-11-30: ${won.length} deals, ${money(won.reduce((s, d) => s + d.amount, 0))} USD`,
)
for (const d of won.sort((a, b) => a.close.localeCompare(b.close))) say(`${d.close} ${d.name} ${money(d.amount)}`)

const lost = deals.filter((d) => d.stage === "Lost")
say(`\n## Lost: ${lost.length} deals, ${money(lost.reduce((s, d) => s + d.amount, 0))} USD`)
for (const d of lost) say(`${d.name} ${money(d.amount)}: ${d.lost ?? "(no reason recorded)"}`)

say("\n## Open tasks due before 2026-11-23")
for (const t of data.tasks.filter((t) => !t.done && t.due < data.TODAY))
  say(`${t.due.slice(0, 10)} ${t.text} (deal ${t.deal})`)
