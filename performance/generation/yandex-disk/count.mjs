#!/usr/bin/env node
// Counts a CLI's lines the way the cli-factory inventory counted notion-cli (4,531 by hand): production TypeScript
// under src/ without src/generated, tests and fakes apart. With a baseline commit it also counts what was written on
// top of it, so the template's own lines are told from the builder's.
//
//   node count.mjs <cli repository> [<baseline commit>]
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

const [repo, baseline] = process.argv.slice(2)
if (!repo) {
  process.stderr.write("usage: node count.mjs <cli repository> [<baseline commit>]\n")
  process.exit(2)
}

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [],
  )
const kindOf = (path) =>
  path.startsWith("src/generated/")
    ? "generated"
    : path.endsWith(".test.ts") || path.startsWith("src/testing/")
      ? "tests"
      : "production"
const lines = (path) => readFileSync(path, "utf8").split("\n").length - 1

const totals = { production: 0, tests: 0, generated: 0 }
for (const path of files(join(repo, "src"))) totals[kindOf(relative(repo, path))] += lines(path)

const written = { production: 0, tests: 0, scripts: 0 }
if (baseline) {
  const numstat = execFileSync("git", ["-C", repo, "diff", "--numstat", baseline, "--", "src", "scripts"], {
    encoding: "utf8",
  })
  for (const line of numstat.trim().split("\n").filter(Boolean)) {
    const [added, , path] = line.split("\t")
    const kind = path.startsWith("scripts/") ? "scripts" : kindOf(path)
    if (kind !== "generated") written[kind] += Number(added)
  }
}
process.stdout.write(
  `${JSON.stringify({ repo, baseline: baseline ?? null, totals, ...(baseline ? { written } : {}) }, null, 2)}\n`,
)
