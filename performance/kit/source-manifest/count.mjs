#!/usr/bin/env node
// Lines of a CLI's move to a source from wirecat.config.ts, read from git only:
//   node count.mjs <checkout> <commit before> <commit after> [hook folder, default src/sync]
// Prints JSON: the config, the hook code left after the move, and the move's diff by kind of file.
import { execFileSync } from "node:child_process"

const [repo, before, after, hooks = "src/sync"] = process.argv.slice(2)
if (!repo || !before || !after) {
  process.stderr.write("usage: node count.mjs <checkout> <commit before> <commit after> [hook folder]\n")
  process.exit(2)
}
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" })
const lines = (commit, path) => {
  try {
    return git("show", `${commit}:${path}`).split("\n").length - 1
  } catch {
    return 0
  }
}
const kind = (path) =>
  path.includes("/generated/")
    ? "generated"
    : /\.test\.ts$|\/testing\//.test(path)
      ? "tests"
      : path.startsWith("src/") || path === "wirecat.config.ts"
        ? "source"
        : path.startsWith("scripts/")
          ? "scripts"
          : path.endsWith(".md")
            ? "docs"
            : "other"
const diff = {}
for (const row of git("diff", "--numstat", "--no-renames", before, after).trim().split("\n").filter(Boolean)) {
  const [added, removed, path] = row.split("\t")
  if (path === "pnpm-lock.yaml") continue
  diff[kind(path)] ??= { added: 0, removed: 0 }
  const group = diff[kind(path)]
  // A binary file has "-" for both.
  group.added += Number(added) || 0
  group.removed += Number(removed) || 0
}
const hookFiles = git("ls-tree", "-r", "--name-only", after, hooks)
  .trim()
  .split("\n")
  .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
process.stdout.write(
  `${JSON.stringify(
    {
      before,
      after,
      config: lines(after, "wirecat.config.ts"),
      hooks: Object.fromEntries(hookFiles.map((path) => [path, lines(after, path)])),
      hook_lines: hookFiles.reduce((sum, path) => sum + lines(after, path), 0),
      diff,
    },
    null,
    2,
  )}\n`,
)
