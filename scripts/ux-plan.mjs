import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

// The CLI repositories own follow-up commands; these immutable documentation links identify the checked instructions.
const tools = [
  ["max", "max-cli", "0.71.0"],
  ["tg", "tg-cli", "0.84.0"],
  ["memo", "cli-memo", "0.90.0"],
  ["wa", "whatsapp-cli", "0.6.0"],
  ["drive", "drive-cli", "0.26.0"],
  ["zm", "zoom-cli", "0.39.0"],
]
if (!process.env.npm_execpath?.endsWith("npm-cli.js")) throw new Error("Run with npm run ux:plan")
const directory = resolve(process.argv[2] ?? ".install-tooling")
mkdirSync(directory, { recursive: true })
const plan = {
  reason: "Check packed release installation across package managers and supported systems before launch",
  managers: ["npm", "pnpm", "bun"],
  tools: [],
}
for (const [name, repo, version] of tools) {
  const packageName = `@wirecat/${repo}`
  // npm pack has no account access; all child package execution happens later in the isolated suite.
  const output = execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "pack",
      `${packageName}@${version}`,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      directory,
    ],
    { encoding: "utf8" },
  )
  const [{ filename }] = JSON.parse(output)
  plan.tools.push({
    name,
    package: packageName,
    version,
    tarball: join(directory, filename),
    command: name,
    afterInstall: ["--help"],
    documentation: `https://github.com/WireCatLabs/${repo}/blob/v${version}/docs/installation.md`,
  })
}
writeFileSync(join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`)
