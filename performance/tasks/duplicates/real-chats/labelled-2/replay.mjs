// node replay.mjs — adds drafts.jsonl to the store copy in time order and records what the duplicate check said.
// Then asks `tasks related` for every task, so the whole candidate pool is kept, the "different" band included.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = process.argv[2] ?? new URL(".", import.meta.url).pathname
const env = { ...process.env, MESSAGING_STORE: join(dir, "store.db"), WIRECAT_CONFIG_DIR: join(dir, "cfg") }
const bin = process.env.TG_BIN ?? "tg"
const profile = "personal"

const drafts = readFileSync(join(dir, "drafts.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .sort((a, b) => a.sent.localeCompare(b.sent) || a.n - b.n)

const tg = (args) => {
  const out = spawnSync(bin, [profile, "--offline", ...args, "--json"], { env, encoding: "utf8" })
  let json = null
  try {
    json = JSON.parse(out.stdout || out.stderr)
  } catch {}
  return { code: out.status, json, raw: json ? undefined : (out.stdout + out.stderr).slice(0, 2000) }
}

const add = (draft, extra = []) => {
  const args = ["tasks", "add", draft.source, "--type", draft.type, "--title", draft.title]
  if (draft.description) args.push("--description", draft.description)
  args.push("--category", draft.category || "other")
  return tg([...args, ...extra])
}

const results = []
for (const draft of drafts) {
  const first = add(draft)
  const row = { n: draft.n, chat: draft.chat, sent: draft.sent, first }
  if (first.code !== 0) row.kept = add(draft, ["--new"])
  results.push(row)
  process.stderr.write(`${draft.n} ${first.code}${row.kept ? `/${row.kept.code}` : ""}\n`)
}
writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 1)}\n`, { mode: 0o600 })

const keyOf = (answer) => (answer?.json?.item?.created ? answer.json.item.key : undefined)
const related = results.map((row) => {
  const key = keyOf(row.kept ?? row.first)
  return { n: row.n, key, related: key ? tg(["tasks", "related", key, "--limit", "40"]) : null }
})
writeFileSync(join(dir, "related.json"), `${JSON.stringify(related, null, 1)}\n`, { mode: 0o600 })
process.stdout.write(
  `${results.length} drafts, ${results.filter((r) => r.first.code !== 0).length} refused on first add, ` +
    `${related.filter((r) => r.key).length} with related\n`,
)
