#!/usr/bin/env node
// Asks every question of questions.json through every contestant's own search, in both forms (the user's sentence
// and the keywords an agent would type), and records where the expected item ranks.
//
//   node bench.mjs <phase> [--only <names>]   phase: words (after a plain sync) or embed (after sync --embed)
//
// Raw answers stay in WORK_DIR/raw: they hold the workspace's URLs and the account's email. The committed
// results-<phase>.json holds only seed keys, times, sizes and request counts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { mcpClient, run, token, tools, VERSIONS } from "./tools.mjs"

const HERE = import.meta.dirname
const WORK = process.env.LINEAR_BENCH_WORK ?? "/var/tmp/wirecat-bench/linear-rivals"
const MAP_FILE =
  process.env.LINEAR_BENCH_MAP ?? join(process.env.HOME, ".cache/wirecat-bench/linear-rivals/seed-map.json")
const RAW = join(WORK, "raw")
const LIMIT = 10
// searchIssues and its siblings allow 30 requests a minute per key, shared by the three live contestants.
const LIVE_SPACING_MS = 2500
const LOCAL_REPEATS = 3

const phase = process.argv[2]
if (!["words", "embed"].includes(phase)) throw new Error("usage: node bench.mjs words|embed")
const questions = JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8"))
const map = JSON.parse(readFileSync(MAP_FILE, "utf8"))
const t = tools(WORK)
mkdirSync(RAW, { recursive: true })

// An answer's items in order: each seed item is placed where its id, key, slug or exact title first appears.
const needles = Object.entries(map)
  .filter(([key]) => !key.startsWith("project:"))
  .map(([key, one]) => [
    key,
    [one.id, one.identifier, one.slug, one.title, JSON.stringify(one.title).slice(1, -1)].filter(Boolean),
  ])
export const ranked = (text) =>
  needles
    .map(([key, list]) => [
      key,
      Math.min(...list.map((needle) => text.indexOf(needle)).map((at) => (at < 0 ? Infinity : at))),
    ])
    .filter(([, at]) => at < Infinity)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key)

let lastLive = 0
const paced = async (fn) => {
  const wait = lastLive + LIVE_SPACING_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastLive = Date.now()
  return fn()
}
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]

const secret = token()
const mcp = await mcpClient(WORK, secret)
const scrub = (text) => text.replaceAll(secret, "***")

const words = (q) => q.split(/\s+/).filter(Boolean)
const ours = (args) => run(t.bins.ours, ["bench", ...args, "--json"], { ...t.ours, node: true })
// Each contestant: a list of searches an agent would run for one question; their answers are merged in order.
const contestants = {
  // One quoted argument is matched as a phrase, words in that order next to each other; separate words are each
  // matched anywhere. Both are measured: the command's own example quotes its words.
  "ours: issues search": {
    local: true,
    searches: (q) => [() => ours(["issues", "search", ...words(q), "--limit", String(LIMIT)])],
  },
  "ours: issues search (one quoted argument)": {
    local: true,
    searches: (q) => [() => ours(["issues", "search", q, "--limit", String(LIMIT)])],
  },
  "ours: search": { local: true, searches: (q) => [() => ours(["search", q, "--limit", String(LIMIT)])] },
  "ours: memo search all": {
    local: true,
    searches: (q) => [
      () => run(t.bins.memo, ["search", "all", q, "--limit", String(LIMIT), "--json"], { ...t.ours, node: true }),
    ],
  },
  "ours: both": {
    local: true,
    searches: (q) => [
      () => ours(["issues", "search", ...words(q), "--limit", String(LIMIT)]),
      () => ours(["search", q, "--limit", String(LIMIT)]),
    ],
  },
  ...(phase === "words"
    ? {
        "ours: api semantic-search (live)": {
          searches: (q) => [
            () => paced(() => ours(["api", "semantic-search", "--query", q, "--max-results", String(LIMIT)])),
          ],
        },
        "Linear MCP": {
          searches: (q) => [
            () => paced(() => mcp.call("list_issues", { query: q, limit: LIMIT })),
            () => paced(() => mcp.call("list_documents", { query: q, limit: LIMIT })),
          ],
        },
        Linearis: {
          searches: (q) => [
            () =>
              paced(() =>
                run(t.bins.linearis, ["issues", "search", q, "--limit", String(LIMIT)], {
                  ...t.linearis,
                  env: { ...t.linearis.env, LINEAR_API_TOKEN: secret },
                  node: true,
                }),
              ),
          ],
        },
        "schpet/linear-cli": {
          searches: (q) => [
            () =>
              paced(() =>
                run(
                  t.bins.schpet,
                  [
                    "issue",
                    "query",
                    "--search",
                    q,
                    "--search-comments",
                    "--all-teams",
                    "--limit",
                    String(LIMIT),
                    "--json",
                    "--no-pager",
                  ],
                  { ...t.schpet, env: { ...t.schpet.env, LINEAR_API_KEY: secret } },
                ),
              ),
          ],
        },
      }
    : {}),
}

// --only "<name>,<name>" reruns some contestants and keeps the other rows of an earlier run.
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null
const resultsFile = join(HERE, `results-${phase}.json`)
const rows = only ? JSON.parse(readFileSync(resultsFile, "utf8")).rows.filter((row) => !only.includes(row.tool)) : []
for (const [name, contestant] of Object.entries(contestants)) {
  if (only && !only.includes(name)) continue
  for (const question of questions) {
    for (const form of ["keywords", "sentence"]) {
      const text = form === "keywords" ? question.query : question.question
      const answers = []
      for (const search of contestant.searches(text)) {
        const tries = []
        for (let i = 0; i < (contestant.local ? LOCAL_REPEATS : 1); i += 1) tries.push(await search())
        const ms = median(tries.map((one) => one.ms))
        answers.push({ ...tries[0], ms })
      }
      const stdout = answers.map((one) => scrub(one.stdout)).join("\n")
      const failed = answers
        .filter((one) => one.status !== 0)
        .map((one) => scrub(one.stderr || one.stdout).slice(0, 300))
      const file = `${phase}-${name.replace(/[^a-z0-9]+/gi, "_")}-${question.id}-${form}.txt`
      writeFileSync(join(RAW, file), `${stdout}\n--- stderr\n${failed.join("\n")}\n`)
      // An agent reads each search's list on its own, so the expected item ranks by its best place in any of them.
      const lists = answers.map((one) => ranked(scrub(one.stdout)))
      const keys = [...new Set(lists.flat())]
      const places = lists
        .map((list) => list.findIndex((key) => question.expect.includes(key)) + 1)
        .filter((at) => at > 0)
      const rank = places.length ? Math.min(...places) : 0
      const requests = answers.every((one) => one.requests !== null)
        ? answers.reduce((sum, one) => sum + one.requests, 0)
        : null
      rows.push({
        tool: name,
        id: question.id,
        form,
        expect: question.expect,
        ranked: lists.map((list) => list.slice(0, LIMIT)),
        rank: question.expect.length && rank > 0 ? rank : null,
        hits: keys.length,
        ms: Math.round(answers.reduce((sum, one) => sum + one.ms, 0)),
        chars: stdout.length,
        requests,
        error: failed.length
          ? failed
              .join(" | ")
              .replace(/https?:\/\/\S+/g, "<url>")
              .replace(/\S+@\S+/g, "<email>")
          : null,
      })
      const last = rows.at(-1)
      console.log(
        `${phase} ${name} ${question.id} ${form}: rank ${last.rank ?? "-"} of ${last.hits}, ${last.ms} ms${last.error ? `, error ${last.error.slice(0, 80)}` : ""}`,
      )
    }
  }
}
await mcp.close()

writeFileSync(
  resultsFile,
  `${JSON.stringify(
    {
      phase,
      ran_at: new Date().toISOString(),
      versions: VERSIONS,
      node: process.version,
      mcp_tools: { count: mcp.toolCount, chars: mcp.toolsChars },
      rows,
    },
    null,
    1,
  )}\n`,
)
console.log(`wrote results-${phase}.json, raw answers in ${RAW}`)
