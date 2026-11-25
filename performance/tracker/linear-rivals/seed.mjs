#!/usr/bin/env node
// Puts dataset.mjs into the owner's Linear test workspace, once. Every issue carries the wc-bench label, so a rerun
// finds what exists by title and creates only what is missing. The token is read from the keyring in this process
// and goes only into the Authorization header, never to the screen or a file.
//
//   LINEAR_BENCH_ACCOUNT=<keyring account> node seed.mjs
//
// Writes the map from seed keys to Linear ids into MAP_FILE and one status row per item into STATUS_CSV.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { cycles, documents, issues, LABEL, projects } from "./dataset.mjs"
import { token as keyringToken } from "./tools.mjs"

const TEAM_KEY = "VIA"
const OUT_DIR = process.env.LINEAR_BENCH_DIR ?? join(homedir(), ".cache/wirecat-bench/linear-rivals")
const MAP_FILE = join(OUT_DIR, "seed-map.json")
const STATUS_CSV = join(OUT_DIR, "seed-status.csv")
// Linear allows more, but the owner's other checks share the key: 40 requests a minute at most.
const SPACING_MS = 1600

const token = keyringToken()

let last = 0
let calls = 0
const gql = async (query, variables = {}) => {
  const wait = last + SPACING_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  last = Date.now()
  calls += 1
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({ query, variables }),
  })
  const answer = await response.json()
  if (answer.errors?.length) throw new Error(`Linear: ${answer.errors.map((one) => one.message).join("; ")}`)
  return answer.data
}

mkdirSync(OUT_DIR, { recursive: true })
if (!existsSync(STATUS_CSV)) writeFileSync(STATUS_CSV, "key,status,detail,time\n")
console.log(`status: ${STATUS_CSV}`)
const done = new Set(
  readFileSync(STATUS_CSV, "utf8")
    .split("\n")
    .slice(1)
    .filter((line) => line.split(",")[1] === "done")
    .map((line) => line.split(",")[0]),
)
const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, "utf8")) : {}
const record = (key, status, detail) => {
  appendFileSync(STATUS_CSV, `${key},${status},${String(detail).replaceAll(",", ";")},${new Date().toISOString()}\n`)
  writeFileSync(MAP_FILE, `${JSON.stringify(map, null, 2)}\n`)
}

const base = await gql(
  `query($key: String!) {
    viewer { id }
    teams(filter: { key: { eq: $key } }) { nodes { id
      states { nodes { id name } }
      labels { nodes { id name } }
      cycles { nodes { id number } } } }
    issueLabels(filter: { name: { eq: "${LABEL}" } }) { nodes { id } }
    projects(first: 50) { nodes { id name } }
  }`,
  { key: TEAM_KEY },
)
const team = base.teams.nodes[0]
const stateId = Object.fromEntries(team.states.nodes.map((one) => [one.name, one.id]))
const labelId = Object.fromEntries(team.labels.nodes.map((one) => [one.name, one.id]))
labelId[LABEL] =
  base.issueLabels.nodes[0]?.id ??
  (
    await gql(
      `mutation($name: String!) { issueLabelCreate(input: { name: $name, color: "#888888" }) { issueLabel { id } } }`,
      {
        name: LABEL,
      },
    )
  ).issueLabelCreate.issueLabel.id

const projectId = {}
for (const project of projects) {
  const found = base.projects.nodes.find((one) => one.name === project.name)
  projectId[project.key] =
    found?.id ??
    (
      await gql(`mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { project { id } } }`, {
        input: { name: project.name, description: project.description, teamIds: [team.id] },
      })
    ).projectCreate.project.id
  map[`project:${project.key}`] = { id: projectId[project.key], title: project.name }
}
const cycleId = Object.fromEntries(
  cycles.map((cycle) => [cycle.key, team.cycles.nodes.find((one) => one.number === cycle.number)?.id]),
)

const existing = await gql(
  `query($label: String!) { issues(first: 250, filter: { labels: { name: { eq: $label } } }) { nodes {
    id identifier title comments { nodes { body } } } } }`,
  { label: LABEL },
)
const byTitle = new Map(existing.issues.nodes.map((one) => [one.title, one]))

let count = 0
const started = Date.now()
const progress = () => {
  count += 1
  if (count % 10 === 0) console.log(`${count} items, ${calls} requests, ${Math.round((Date.now() - started) / 1000)} s`)
}

for (const issue of issues) {
  if (done.has(issue.key) && map[issue.key]) {
    progress()
    continue
  }
  let found = byTitle.get(issue.title)
  if (!found) {
    const input = {
      teamId: team.id,
      title: issue.title,
      description: issue.description,
      stateId: stateId[issue.state],
      priority: issue.priority,
      labelIds: [labelId[issue.label], labelId[LABEL]],
      ...(issue.project ? { projectId: projectId[issue.project] } : {}),
      ...(issue.assignee === "me" ? { assigneeId: base.viewer.id } : {}),
      ...(issue.cycle ? { cycleId: cycleId[issue.cycle] } : {}),
    }
    found = (
      await gql(
        `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier title } } }`,
        { input },
      )
    ).issueCreate.issue
    found.comments = { nodes: [] }
  }
  const bodies = new Set(found.comments.nodes.map((one) => one.body))
  for (const body of issue.comments ?? []) {
    if (bodies.has(body)) continue
    await gql(`mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`, {
      input: { issueId: found.id, body },
    })
  }
  map[issue.key] = { id: found.id, identifier: found.identifier, title: issue.title }
  record(issue.key, "done", found.identifier)
  progress()
}

const docs = await gql(`{ documents(first: 100) { nodes { id slugId title } } }`)
for (const document of documents) {
  let found = docs.documents.nodes.find((one) => one.title === document.title)
  if (!found) {
    found = (
      await gql(
        `mutation($input: DocumentCreateInput!) { documentCreate(input: $input) { document { id slugId title } } }`,
        { input: { title: document.title, content: document.content, projectId: projectId[document.project] } },
      )
    ).documentCreate.document
  }
  map[document.key] = { id: found.id, slug: found.slugId, title: document.title }
  record(document.key, "done", found.slugId)
  progress()
}
console.log(`seeded: ${issues.length} issues, ${documents.length} documents, ${calls} requests; map: ${MAP_FILE}`)
