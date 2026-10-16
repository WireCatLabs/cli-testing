// Usage: node spanish.mjs
// Reads the due date of every task in spanish.jsonl and counts it against the labels, then prints the due date each
// message of ../categories/spanish.json gets (that set has no due labels). Run linked.mjs on spanish.jsonl for scores.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DAY, dueOf, joinDigitGroups, normalize } from "./chain.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const dateOf = (day) => (day === null ? null : new Date(day * DAY).toISOString().slice(0, 10))

const tasks = readFileSync(join(here, "spanish.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
const verdictOf = (got, want) => {
  if (got === null) return want === null ? "none" : "missed"
  if (want === null) return "extra"
  return got === want ? "right" : "wrong"
}
const counts = { right: 0, wrong: 0, missed: 0, extra: 0, none: 0 }
const misses = []
for (const task of tasks) {
  const got = dateOf(
    dueOf(normalize(joinDigitGroups(`${task.description}\n${task.title}`)), Date.parse(task.created_at)),
  )
  const verdict = verdictOf(got, task.due)
  counts[verdict]++
  if (verdict !== "right" && verdict !== "none")
    misses.push(`${verdict}: ${task.description} → ${got} (label ${task.due})`)
}
const lines = [
  `spanish.jsonl, ${tasks.length} tasks, due date: ${JSON.stringify(counts)}`,
  ...misses.map((m) => `  ${m}`),
]

// Read as if sent on Wednesday 2026-10-14, noon in Madrid.
const sent = Date.parse("2026-10-14T10:00:00Z")
const messages = JSON.parse(readFileSync(join(here, "..", "categories", "spanish.json"), "utf8"))
const dated = messages.map(({ text }) => [text, dateOf(dueOf(normalize(text), sent))]).filter(([, due]) => due)
lines.push(`categories/spanish.json, ${messages.length} messages, ${dated.length} with a due date:`)
for (const [text, due] of dated) lines.push(`  ${due}  ${text}`)
process.stdout.write(`${lines.join("\n")}\n`)
