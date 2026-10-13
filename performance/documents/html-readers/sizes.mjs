// Installs each engine's dependencies alone into a temporary folder and measures it.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const pinned = JSON.parse(readFileSync("package.json", "utf8")).dependencies
const sets = { A: ["linkedom", "defuddle"], B: ["linkedom", "@mozilla/readability", "turndown"], C: [] }

const countPackages = (modules) =>
  readdirSync(join(modules, ".pnpm"), { withFileTypes: true }).filter(
    (e) => e.isDirectory() && e.name !== "node_modules",
  ).length

const sizes = {}
for (const [key, names] of Object.entries(sets)) {
  if (!names.length) {
    sizes[key] = { kb: 0, packages: 0, dependencies: {} }
    continue
  }
  const dir = mkdtempSync(join(tmpdir(), `html-readers-${key}-`))
  const dependencies = Object.fromEntries(names.map((n) => [n, pinned[n]]))
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `size-${key}`, private: true, dependencies }))
  execFileSync("pnpm", ["install", "--ignore-workspace", "--silent"], { cwd: dir, stdio: "ignore" })
  const kb = Number(
    execFileSync("du", ["-sk", join(dir, "node_modules")])
      .toString()
      .split("\t")[0],
  )
  sizes[key] = { kb, packages: countPackages(join(dir, "node_modules")), dependencies }
  rmSync(dir, { recursive: true, force: true })
}
writeFileSync("sizes.json", `${JSON.stringify(sizes, null, 2)}\n`)
console.log(sizes)
