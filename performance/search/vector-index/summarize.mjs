// usage: node summarize.mjs results-100000.jsonl   prints the README tables from one run's JSON lines
import { readFileSync } from "node:fs"

const print = (line) => process.stdout.write(`${line}\n`)

const rows = readFileSync(process.argv[2], "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
const measured = rows.filter((r) => r.case && r.firstMs !== undefined)
const pairs = []
for (const r of measured) {
  const last = pairs.at(-1)
  const same =
    last?.cold &&
    !last.warm &&
    last.cold.case === r.case &&
    last.cold.variant === r.variant &&
    last.cold.runtime === r.runtime
  if (r.label === "warm" && same) last.warm = r
  else pairs.push({ [r.label]: r })
}
print(
  "| case | runtime | variant | cold first query, ms | warm first query, ms | warm median, ms | SQL / score / finish, ms | rows | recall@10 / @50 |",
)
print("|---|---|---|---:|---:|---:|---|---:|---|")
// A process pays for opening an index or loading the extension before its first query: counted in.
const first = (r) => (r ? Math.round((r.firstMs + (r.openIndexMs ?? 0) + (r.extensionLoadMs ?? 0)) * 10) / 10 : "–")
for (const g of pairs) {
  const any = g.warm ?? g.cold
  const s = any.split
  const recall = any.recall ? `${any.recall.at10} / ${any.recall.at50}` : "exact"
  print(
    `| ${any.case} | ${any.runtime.split(" ")[0]} | ${any.variant} | ${first(g.cold)} | ${first(g.warm)} | ${any.warmMs} | ${s.sqlMs} / ${s.scoreMs} / ${s.finishMs} | ${s.rows} | ${recall} |`,
  )
}
for (const r of rows.filter((r) => r.buildMs !== undefined || r.command === "build"))
  print(JSON.stringify(r.counts ? { ...r, counts: undefined } : r))
for (const r of rows.filter((r) => r.plan)) print(`${r.case} ${r.variant} index=${r.index}: ${r.plan.join(" → ")}`)
