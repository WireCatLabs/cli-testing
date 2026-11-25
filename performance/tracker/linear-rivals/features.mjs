#!/usr/bin/env node
// Checks the feature table by running each tool: documents, cycles, a filter, and a write (one issue and one comment
// per tool, labelled wc-bench-write so it never enters the search set). Run after bench.mjs.
//
//   node features.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { issues } from "./dataset.mjs"
import { mcpClient, run, token, tools } from "./tools.mjs"

const HERE = import.meta.dirname
const WORK = process.env.LINEAR_BENCH_WORK ?? "/var/tmp/wirecat-bench/linear-rivals"
const MAP_FILE =
  process.env.LINEAR_BENCH_MAP ?? join(process.env.HOME, ".cache/wirecat-bench/linear-rivals/seed-map.json")
const WRITE_LABEL = "wc-bench-write"
const OPEN = ["Backlog", "Todo", "In Progress", "In Review"]

const map = JSON.parse(readFileSync(MAP_FILE, "utf8"))
const t = tools(WORK)
const secret = token()
const scrub = (text) => text.replaceAll(secret, "***")

const gql = async (query, variables = {}) => {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: secret },
    body: JSON.stringify({ query, variables }),
  })
  return (await response.json()).data
}
const labels = await gql(`{ issueLabels(filter: { name: { eq: "${WRITE_LABEL}" } }) { nodes { id } } }`)
if (!labels.issueLabels.nodes.length) {
  await gql(`mutation { issueLabelCreate(input: { name: "${WRITE_LABEL}", color: "#444444" }) { success } }`)
}

const expectedBugs = issues
  .filter((one) => one.label === "Bug" && one.assignee === null && OPEN.includes(one.state))
  .map((one) => map[one.key].identifier)
const identifiers = (text) => [...new Set(text.match(/\bVIA-\d+\b/g) ?? [])]
const filterScore = (text) => {
  const found = identifiers(text)
  return `${found.filter((id) => expectedBugs.includes(id)).length}/${expectedBugs.length} found, ${found.filter((id) => !expectedBugs.includes(id)).length} other`
}
const has = (text, ...needles) => needles.every((needle) => text.includes(needle))
const pause = () => new Promise((resolve) => setTimeout(resolve, 2500))

const ours = (...args) => run(t.bins.ours, ["bench", ...args, "--json"], { ...t.ours, node: true })
const linearis = (...args) =>
  run(t.bins.linearis, args, { ...t.linearis, env: { ...t.linearis.env, LINEAR_API_TOKEN: secret }, node: true })
const schpet = (...args) =>
  run(t.bins.schpet, args, {
    ...t.schpet,
    env: { ...t.schpet.env, LINEAR_API_KEY: secret },
  })
const mcp = await mcpClient(WORK, secret)
const team = map.b01 && (await gql(`{ teams { nodes { id key } } }`)).teams.nodes.find((one) => one.key === "VIA").id

const d2 = map.d2
const checks = {
  "ours (@wirecat/linear-cli)": {
    "documents list": async () => [
      await ours("documents", "list"),
      (s) => has(s, map.d1.title, d2.title, map.d3.title),
    ],
    "document read": async () => [await ours("documents", "show", d2.id), (s) => has(s, "Staged rollout")],
    "document search": async () => [await ours("search", "staged rollout"), (s) => has(s, d2.title)],
    cycles: async () => [await ours("api", "cycles"), (s) => /"number":\s*1\b/.test(s)],
    "filter: open bugs, no assignee (label by name)": async () => [
      await ours("issues", "list", "label:Bug", "assignee:none", "--limit", "100"),
      filterScore,
    ],
    // label: takes the label's id, not its name, and the list shows a state as an id: an agent first reads both lists.
    "filter: open bugs, no assignee": async () => {
      const answers = [await ours("labels", "list")]
      const bug = JSON.parse(answers[0].stdout).items.find((one) => one.name === "Bug").external_id
      for (const type of ["backlog", "unstarted", "started"]) {
        answers.push(await ours("issues", "list", `label:${bug}`, "assignee:none", `type:${type}`, "--limit", "100"))
      }
      const stdout = answers
        .slice(1)
        .map((one) => one.stdout)
        .join("\n")
      return [
        {
          ...answers[1],
          stdout,
          ms: answers.reduce((sum, one) => sum + one.ms, 0),
          note: "labels list, then one list per state type",
        },
        filterScore,
      ]
    },
    "create issue": async () => {
      const first = await ours(
        "issues",
        "create",
        "--title",
        "wc-bench write check: ours",
        "--team",
        "VIA",
        "--label",
        WRITE_LABEL,
      )
      if (first.status === 0) return [first, (s) => identifiers(s).length > 0]
      // A label made after the last sync is not in the copy yet, and create looks labels up there.
      await ours("sync")
      const second = await ours(
        "issues",
        "create",
        "--title",
        "wc-bench write check: ours",
        "--team",
        "VIA",
        "--label",
        WRITE_LABEL,
      )
      return [
        {
          ...second,
          note: `first try refused (${JSON.parse(first.stderr || "{}").error?.reason ?? "error"}); passed after sync`,
        },
        (s) => identifiers(s).length > 0,
      ]
    },
  },
  "Linear MCP": {
    "documents list": async () => [
      await mcp.call("list_documents", { limit: 50 }),
      (s) => has(s, map.d1.title, d2.title, map.d3.title),
    ],
    "document read": async () => [await mcp.call("get_document", { id: d2.id }), (s) => has(s, "Staged rollout")],
    "document search": async () => [
      await mcp.call("list_documents", { query: "staged rollout" }),
      (s) => has(s, d2.title),
    ],
    cycles: async () => [await mcp.call("list_cycles", { teamId: team }), (s) => /"number":\s*1\b/.test(s)],
    "filter: open bugs, no assignee": async () => [
      await mcp.call("list_issues", { assignee: null, label: "Bug", limit: 100 }),
      filterScore,
    ],
    "create issue": async () => [
      await mcp.call("save_issue", { title: "wc-bench write check: Linear MCP", team: "VIA", labels: [WRITE_LABEL] }),
      (s) => identifiers(s).length > 0,
    ],
  },
  Linearis: {
    "documents list": async () => [
      await linearis("documents", "list"),
      (s) => has(s, map.d1.title, d2.title, map.d3.title),
    ],
    "document read": async () => [await linearis("documents", "read", d2.id), (s) => has(s, "Staged rollout")],
    "document search": async () => [
      { status: null, stdout: "", stderr: "", ms: 0, note: "no search option on documents" },
      () => false,
    ],
    cycles: async () => [await linearis("cycles", "list", "--team", "VIA"), (s) => /"number":\s*1\b/.test(s)],
    "filter: open bugs, no assignee": async () => [
      await linearis("issues", "list", "--label", "Bug", "--unassigned", "--limit", "100"),
      filterScore,
    ],
    "create issue": async () => [
      await linearis("issues", "create", "wc-bench write check: Linearis", "--team", "VIA", "--labels", WRITE_LABEL),
      (s) => identifiers(s).length > 0,
    ],
  },
  "schpet/linear-cli": {
    "documents list": async () => [
      await schpet("document", "list", "--json"),
      (s) => has(s, map.d1.title, d2.title, map.d3.title),
    ],
    "document read": async () => [await schpet("document", "view", d2.slug, "--json"), (s) => has(s, "Staged rollout")],
    "document search": async () => [
      { status: null, stdout: "", stderr: "", ms: 0, note: "no search option on documents" },
      () => false,
    ],
    cycles: async () => [await schpet("cycle", "list", "--team", "VIA", "--json"), (s) => /"number":\s*1\b/.test(s)],
    "filter: open bugs, no assignee": async () => [
      await schpet(
        "issue",
        "query",
        "--all-teams",
        "--unassigned",
        "--label",
        "Bug",
        "-s",
        "backlog",
        "-s",
        "unstarted",
        "-s",
        "started",
        "--limit",
        "100",
        "--json",
        "--no-pager",
      ),
      filterScore,
    ],
    "create issue": async () => [
      await schpet(
        "issue",
        "create",
        "--title",
        "wc-bench write check: schpet",
        "--team",
        "VIA",
        "--label",
        WRITE_LABEL,
        "--no-input",
      ),
      (s) => identifiers(s).length > 0,
    ],
  },
}

const comment = {
  "ours (@wirecat/linear-cli)": (id) => ours("issues", "comments", "create", id, "--text", "wc-bench write check"),
  "Linear MCP": (id) => mcp.call("save_comment", { issueId: id, body: "wc-bench write check" }),
  Linearis: (id) => linearis("issues", "discuss", id, "--body", "wc-bench write check"),
  "schpet/linear-cli": (id) => schpet("issue", "comment", "add", id, "--body", "wc-bench write check"),
}

// --tool <name> reruns one tool's checks and keeps the other rows of an earlier run.
const only = process.argv.includes("--tool") ? process.argv[process.argv.indexOf("--tool") + 1] : null
const resultsFile = join(HERE, "results-features.json")
const rows = only ? JSON.parse(readFileSync(resultsFile, "utf8")).rows.filter((row) => row.tool !== only) : []
for (const [tool, list] of Object.entries(checks)) {
  if (only && tool !== only) continue
  for (const [check, step] of Object.entries(list)) {
    const [answer, judge] = await step()
    const stdout = scrub(answer.stdout ?? "")
    const verdict = judge(stdout)
    const result = typeof verdict === "string" ? verdict : verdict && answer.status === 0 ? "yes" : "no"
    rows.push({
      tool,
      check,
      result,
      status: answer.status,
      ms: Math.round(answer.ms),
      chars: stdout.length,
      note: answer.note ?? null,
    })
    console.log(
      `${tool} · ${check}: ${result}${
        answer.status
          ? ` (exit ${answer.status}: ${scrub(answer.stderr ?? "")
              .replace(/https?:\/\/\S+/g, "<url>")
              .slice(0, 160)})`
          : ""
      }`,
    )
    if (check === "create issue" && identifiers(stdout).length) {
      await pause()
      const reply = await comment[tool](identifiers(stdout)[0])
      rows.push({
        tool,
        check: "comment",
        result: reply.status === 0 ? "yes" : "no",
        status: reply.status,
        ms: Math.round(reply.ms),
        chars: reply.stdout.length,
        note: null,
      })
      console.log(
        `${tool} · comment: ${reply.status === 0 ? "yes" : `no (${scrub(reply.stderr ?? "").slice(0, 160)})`}`,
      )
    }
    await pause()
  }
}
await mcp.close()
writeFileSync(
  resultsFile,
  `${JSON.stringify({ ran_at: new Date().toISOString(), expected_open_unassigned_bugs: expectedBugs.length, rows }, null, 1)}\n`,
)
