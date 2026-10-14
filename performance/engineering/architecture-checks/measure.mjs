import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const usage = "usage: node measure.mjs --date YYYY-MM-DD --repo <name>=<checkout> [--repo …]"
const args = process.argv.slice(2)
const repos = []
let date
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === "--date") date = args[i + 1]
  else if (args[i] === "--repo") {
    const [name, path] = args[i + 1].split("=")
    repos.push({ name, path })
  } else throw new Error(usage)
}
if (!date || !repos.length) throw new Error(usage)

const SOURCE = /\.(ts|tsx|mts|js|mjs)$/
const TEST = /(^|\/)(test|tests|__tests__)\/|\.test\.|\.spec\./
// Generated or vendored code is exempt from the lint limit, so it is left out here too.
const SKIP =
  /(^|\/)(generated|snowball|drizzle|dist|node_modules|bench|config\/wirecat|lint\/baseline)\/|\.generated\.|\.d\.ts$/

const json = (path) => JSON.parse(readFileSync(path, "utf8"))
const lines = (path) => (readFileSync(path, "utf8").match(/\n/g) ?? []).length

const lintRules = (biome) => {
  const top = biome.linter?.rules ?? {}
  const overrides = (biome.overrides ?? []).map((o) => o.linter?.rules ?? {})
  const size = top.style?.noExcessiveLinesPerFile
  const messages = new Set()
  for (const rules of [top, ...overrides]) {
    const options = rules.style?.noRestrictedImports?.options ?? {}
    for (const pattern of options.patterns ?? []) messages.add(pattern.message)
    for (const [path, value] of Object.entries(options.paths ?? {}))
      messages.add(typeof value === "string" ? value : (value.message ?? path))
  }
  return {
    loopRule: Boolean(top.suspicious?.noImportCycles && top.suspicious.noImportCycles !== "off"),
    sizeLimit: size && size !== "off" ? (size.options?.maxLines ?? "default") : null,
    sizeExceptions: overrides.filter((r) => typeof r.style?.noExcessiveLinesPerFile === "object").length,
    boundaryRules: messages.size,
  }
}

const measure = ({ name, path }) => {
  const pkg = json(join(path, "package.json"))
  const files = execFileSync("git", ["-C", path, "ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => SOURCE.test(file) && !SKIP.test(file))
    .map((file) => ({ file, lines: lines(join(path, file)), test: TEST.test(file) }))
    .sort((a, b) => b.lines - a.lines)
  const source = files.filter((f) => !f.test)
  return {
    name,
    commit: execFileSync("git", ["-C", path, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim(),
    version: pkg.version,
    corePin: pkg.dependencies?.["@wirecat/cli-core"] ?? null,
    // Only a tool built on cli-core has a command contract to check.
    contractsCheck: pkg.dependencies?.["@wirecat/cli-core"]
      ? Boolean(pkg.scripts?.["contracts:check"] || pkg.scripts?.["lint:commands"])
      : null,
    ...lintRules(json(join(path, "biome.json"))),
    sourceFiles: source.length,
    over1000: source.filter((f) => f.lines > 1000),
    over500: source.filter((f) => f.lines > 500 && f.lines <= 1000),
    testsOver1000: files.filter((f) => f.test && f.lines > 1000),
  }
}

const results = repos.map(measure)
const yes = (value) => (value ? "yes" : "no")
const out = [
  `### ${date}`,
  "",
  "| Repo | Commit | Version | cli-core pin | Loop rule | Size limit | Size exceptions | Boundary rules | Contracts check | Source files | Over 1000 | 501–1000 | Tests over 1000 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...results
    .map((r) =>
      [
        r.name,
        r.commit,
        r.version,
        r.corePin ?? "—",
        yes(r.loopRule),
        r.sizeLimit ?? "no",
        r.sizeExceptions,
        r.boundaryRules,
        r.contractsCheck === null ? "—" : yes(r.contractsCheck),
        r.sourceFiles,
        r.over1000.length,
        r.over500.length,
        r.testsOver1000.length,
      ].join(" | "),
    )
    .map((row) => `| ${row} |`),
  "",
  "Files over 500 lines (source, then tests over 1000):",
  "",
  ...results.flatMap((r) =>
    [...r.over1000, ...r.over500, ...r.testsOver1000].map((f) => `- ${r.name} \`${f.file}\` ${f.lines}`),
  ),
  "",
]
process.stdout.write(out.join("\n"))
