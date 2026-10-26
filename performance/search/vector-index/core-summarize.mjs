// usage: node core-summarize.mjs core-results-<n>.jsonl   prints the build line and the query table as Markdown
import { readFileSync } from "node:fs"

const print = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const lines = readFileSync(process.argv[2], "utf8").trim().split("\n").map(JSON.parse)
const build = lines.find((line) => line.build)?.build
print("Build:", JSON.stringify({ ...build, counts: undefined, params: undefined }))
const runs = lines.filter((line) => line.mode)
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const pick = (mode, kase, label, field) =>
  median(runs.filter((r) => r.mode === mode && r.case === kase && r.label === label).map((r) => r[field]))
// Query q of every process uses the same vector, so the index's answers to it must equal the scan's.
const same = (kase) => {
  const answers = (mode) => {
    const byQuery = new Map()
    for (const run of runs.filter((r) => r.mode === mode && r.case === kase))
      for (const [q, answer] of run.answers.entries()) byQuery.set(`${q}:${answer}`, q)
    return byQuery
  }
  const index = answers("index")
  const scan = answers("scan")
  return [...index.keys()].every((key) => scan.has(key)) && index.size === scan.size ? "same" : "DIFFERENT"
}
print(
  "| Search | Scan cold first | Index cold first | Scan warm first | Index warm first | Scan warm median | Index warm median | Answers |",
)
print("|---|---:|---:|---:|---:|---:|---:|---|")
for (const [kase, name] of [
  ["all", "account 1, no filter"],
  ["recent", "account 1, newest 1 %"],
  ["chat", "one chat"],
])
  print(
    `| ${name} | ${pick("scan", kase, "cold", "first_ms")} | ${pick("index", kase, "cold", "first_ms")} | ${pick("scan", kase, "warm", "first_ms")} | ${pick("index", kase, "warm", "first_ms")} | ${pick("scan", kase, "warm", "median_ms")} | ${pick("index", kase, "warm", "median_ms")} | ${same(kase)} |`,
  )
print(
  "Open (store, cold / warm, index runs):",
  pick("index", "all", "cold", "open_ms"),
  "/",
  pick("index", "all", "warm", "open_ms"),
)
