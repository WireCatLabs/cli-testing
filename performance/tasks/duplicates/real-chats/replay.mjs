// node replay.mjs — adds drafts.jsonl to the store copy in time order and records what the duplicate check said.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = new URL(".", import.meta.url).pathname
const env = { ...process.env, MESSAGING_STORE: join(dir, "store.db"), WIRECAT_CONFIG_DIR: join(dir, "cfg") }
const bins = { telegram: join(dir, "tg-cli/dist/bin/tg.js"), max: join(dir, "max-cli/dist/bin/max.js") }

const drafts = readFileSync(join(dir, "drafts.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .sort((a, b) => a.sent.localeCompare(b.sent) || a.n - b.n)

const run = (draft, extra = []) => {
  const provider = draft.source.slice(4).split("/")[0]
  const args = [bins[provider], "default", "tasks", "add", draft.source, "--type", draft.type, "--title", draft.title]
  if (draft.description) args.push("--description", draft.description)
  if (draft.category && draft.category !== "other") args.push("--category", draft.category)
  const out = spawnSync("node", [...args, ...extra, "--json"], { env, encoding: "utf8" })
  let json = null
  try {
    json = JSON.parse(out.stdout || out.stderr)
  } catch {}
  return { code: out.status, json, raw: json ? undefined : (out.stdout + out.stderr).slice(0, 2000) }
}

const results = []
for (const draft of drafts) {
  const first = run(draft)
  const row = { n: draft.n, chat: draft.chat, sent: draft.sent, first }
  if (first.code !== 0) row.kept = run(draft, ["--new"])
  results.push(row)
  process.stderr.write(`${draft.n} ${first.code}${row.kept ? `/${row.kept.code}` : ""}\n`)
}
writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 1)}\n`, { mode: 0o600 })
process.stdout.write(
  `${results.length} drafts, ${results.filter((r) => r.first.code !== 0).length} refused on first add\n`,
)
