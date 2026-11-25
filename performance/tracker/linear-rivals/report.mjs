#!/usr/bin/env node
// Turns results-*.json into the tables of README.md: hits, time, answer size and requests per contestant and form,
// and how many of each question's words appear as written in the expected item.
//
//   node report.mjs > report.md
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { documents, issues } from "./dataset.mjs"

const HERE = import.meta.dirname
const questions = JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8"))
const rows = ["words", "embed"]
  .map((phase) => join(HERE, `results-${phase}.json`))
  .filter(existsSync)
  .flatMap((file) => {
    const { phase, rows: list } = JSON.parse(readFileSync(file, "utf8"))
    return list.map((row) => ({ ...row, tool: phase === "embed" ? `${row.tool} (after sync --embed)` : row.tool }))
  })

const median = (list) => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : null)
const answerable = questions.filter((one) => one.expect.length).length
const out = []

out.push(
  `| Contestant | Form | hit@1 | hit@5 | No-answer questions with 0 hits | Median ms | Median tokens | Requests per question |`,
)
out.push(`|---|---|---|---|---|---|---|---|`)
const ORDER = [
  "ours: issues search",
  "ours: issues search (one quoted argument)",
  "ours: search",
  "ours: both",
  "ours: memo search all",
  "ours: issues search (after sync --embed)",
  "ours: issues search (one quoted argument) (after sync --embed)",
  "ours: search (after sync --embed)",
  "ours: both (after sync --embed)",
  "ours: memo search all (after sync --embed)",
  "ours: api semantic-search (live)",
  "Linear MCP",
  "Linearis",
  "schpet/linear-cli",
]
const tools = [...new Set(rows.map((row) => row.tool))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
// The per-question table keeps one column per approach an agent would really pick.
const COLUMNS = [
  "ours: issues search",
  "ours: memo search all (after sync --embed)",
  "ours: api semantic-search (live)",
  "Linear MCP",
  "Linearis",
  "schpet/linear-cli",
].filter((tool) => tools.includes(tool))
for (const tool of tools) {
  for (const form of ["keywords", "sentence"]) {
    const list = rows.filter((row) => row.tool === tool && row.form === form)
    const scored = list.filter((row) => row.expect.length)
    const empty = list.filter((row) => !row.expect.length)
    const at = (k) => scored.filter((row) => row.rank !== null && row.rank <= k).length
    const requests = list.map((row) => row.requests).filter((one) => one !== null)
    out.push(
      `| ${tool} | ${form} | ${at(1)}/${answerable} | ${at(5)}/${answerable} | ${empty.filter((row) => row.hits === 0).length}/${empty.length} | ${median(list.map((row) => row.ms))} | ${median(list.map((row) => Math.round(row.chars / 4)))} | ${requests.length ? median(requests) : "not visible"} |`,
    )
  }
}

const text = Object.fromEntries([
  ...issues.map((one) => [one.key, [one.title, one.description, ...(one.comments ?? [])].join(" ")]),
  ...documents.map((one) => [one.key, `${one.title} ${one.content}`]),
])
const STOP = new Set(
  "a an the of for to in on at is are was were do did does we i our us it its and or with about what why how who when where there any anything something someone has have had be been that this from get gets getting their them they people my me which whats status".split(
    " ",
  ),
)
const words = (value) =>
  value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !STOP.has(word))
const overlap = (sentence, key) => {
  const target = new Set(words(text[key]))
  const own = words(sentence)
  return own.length ? own.filter((word) => target.has(word)).length / own.length : 0
}

out.push("")
out.push(
  `| Question | Case | Expected | Keyword words found as written | Sentence words found as written | Rank (keywords): ${COLUMNS.join(" · ")} |`,
)
out.push(`|---|---|---|---|---|---|`)
for (const question of questions) {
  const key = question.expect[0]
  const share = (value) => (key ? `${Math.round(overlap(value, key) * 100)}%` : "–")
  const ranks = COLUMNS.map((tool) =>
    rows.find((row) => row.tool === tool && row.id === question.id && row.form === "keywords"),
  ).map((row) => (!row ? "?" : question.expect.length ? (row.rank ?? "–") : `${row.hits} hits`))
  out.push(
    `| ${question.id} | ${question.case} | ${key ?? "none"} | ${share(question.query)} | ${share(question.question)} | ${ranks.join(" · ")} |`,
  )
}
const shares = questions.filter((one) => one.expect.length).map((one) => overlap(one.query, one.expect[0]))
out.push("")
out.push(
  `Median share of keyword-query words found as written in the expected item: ${Math.round(median(shares) * 100)}%.`,
)
console.log(out.join("\n"))
