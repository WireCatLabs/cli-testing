#!/usr/bin/env node
// Writes the memo reads each Desktop page sends on open, as WireCat Desktop 32681529 builds them, to the file given.
// The Clients reads need the busiest deal pipeline, so it is looked up in the store; the file then holds that
// pipeline's ref and stays on the machine (never commit it).
// Usage: node make-commands.mjs /path/outside/the/repo/commands.json
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const out = process.argv[2]
if (!out) throw new Error("usage: make-commands.mjs <output file>")
const bin = process.env.MEMO_BIN ?? "memo"
const listed = JSON.parse(
  execFileSync(bin, ["pipelines", "list", "--json", "--no-record", "--", "kind:deal"], { encoding: "utf8" }),
)
const open = (p) => p.stages.reduce((a, s) => a + (s.open ?? 0), 0)
const ref = listed.items.reduce((b, p) => (open(p) >= open(b) ? p : b)).ref
const scope = `pipeline:"${ref}" `
const KINDS = ["person", "organization", "automated", "stranger", "unsorted"]
const commands = [
  { label: "Memory: memories list --limit 500", argv: ["memories", "list", "--limit", "500"] },
  { label: "Memory: facts list --limit 500", argv: ["facts", "list", "--limit", "500"] },
  { label: "Memory: actions list --limit 500 --brief", argv: ["actions", "list", "--limit", "500", "--brief"] },
  { label: "Memory: agents list --limit 30", argv: ["agents", "list", "--limit", "30"] },
  { label: "Memory: relationships list confirmed:false", argv: ["relationships", "list", "confirmed:false"] },
  { label: "Memory: relationships list include:ended", argv: ["relationships", "list", "include:ended"] },
  { label: "Memory: relationships roles list", argv: ["relationships", "roles", "list"] },
  { label: "Clients: pipelines list kind:deal", argv: ["pipelines", "list"], query: "kind:deal" },
  { label: "Clients: pipelines show <busiest>", argv: ["pipelines", "show", ref] },
  {
    label: "Clients: deals list open --limit 500",
    argv: ["deals", "list", "--limit", "500"],
    query: `${scope}status:open`,
  },
  {
    label: "Clients: deals list won --limit 20",
    argv: ["deals", "list", "--limit", "20"],
    query: `${scope}status:won`,
  },
  {
    label: "Clients: deals list lost --limit 20",
    argv: ["deals", "list", "--limit", "20"],
    query: `${scope}status:lost`,
  },
  ...KINDS.map((k) => ({
    label: `People: people list kind:${k} --limit 1`,
    argv: ["people", "list", `kind:${k}`, "--limit", "1"],
  })),
  { label: "People: people review --limit 500", argv: ["people", "review", "--limit", "500"] },
  {
    label: "People: people list kind:person --sort interactions --limit 5000",
    argv: ["people", "list", "kind:person", "--sort", "interactions", "--limit", "5000"],
  },
  {
    label: "Tasks: tasks list --sort priority --limit 500 project:*",
    argv: ["tasks", "list", "--sort", "priority", "--limit", "500"],
    query: "project:*",
  },
  { label: "Tasks: tasks counts project:*", argv: ["tasks", "counts"], query: "project:*" },
  { label: "Tasks: tasks list --limit 500 (chats)", argv: ["tasks", "list", "--limit", "500"] },
  { label: "Tasks: people list --limit 5000", argv: ["people", "list", "--limit", "5000"] },
  { label: "Tasks: projects list kind:project", argv: ["projects", "list"], query: "kind:project" },
  { label: "Digests: digest list", argv: ["digest", "list"] },
  { label: "Logs: runs list --limit 500", argv: ["runs", "list", "--limit", "500", "--page", "1"] },
  { label: "Groups: groups list", argv: ["groups", "list"] },
]
writeFileSync(out, JSON.stringify(commands))
process.stdout.write(`${`${commands.length} commands written`}\n`)
