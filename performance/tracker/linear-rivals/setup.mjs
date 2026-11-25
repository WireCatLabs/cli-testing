#!/usr/bin/env node
// Installs the pinned contestants under WORK_DIR, signs ours in with a file credential in its own folder (the token on
// its stdin) and syncs its copy. With --embed it also downloads EmbeddingGemma into that folder and runs sync --embed.
//
//   node setup.mjs            install, sign in, sync
//   node setup.mjs --embed    then build the vectors
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { token, tools } from "./tools.mjs"

const WORK = process.env.LINEAR_BENCH_WORK ?? "/var/tmp/wirecat-bench/linear-rivals"
const SCHPET_URL =
  "https://github.com/schpet/linear-cli/releases/download/v3.1.0/linear-x86_64-unknown-linux-gnu.tar.xz"
const SCHPET_SHA256 = "bf7712097ce6a01e8a379de8357eca66d5748050201d336ba787b6ad3687f3e7"
const NPM = {
  ours: "@wirecat/linear-cli@0.3.1",
  memo: "@wirecat/cli-memo@0.152.0",
  linearis: "linearis@2026.8.0",
  mcp: "@modelcontextprotocol/sdk@1.20.0",
}

const sh = (command, args, options = {}) => execFileSync(command, args, { stdio: "inherit", ...options })
for (const [name, spec] of Object.entries(NPM)) {
  const dir = join(WORK, "rivals", name)
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(dir, "package.json"))) writeFileSync(join(dir, "package.json"), "{}\n")
  sh("npm", ["install", "--no-fund", "--no-audit", "--save-exact", spec], { cwd: dir })
}
const schpet = join(WORK, "rivals/schpet")
mkdirSync(schpet, { recursive: true })
const archive = join(schpet, "linear.tar.xz")
if (!existsSync(archive)) writeFileSync(archive, Buffer.from(await (await fetch(SCHPET_URL)).arrayBuffer()))
if (createHash("sha256").update(readFileSync(archive)).digest("hex") !== SCHPET_SHA256)
  throw new Error(`${archive}: checksum differs`)
sh("tar", ["xf", archive], { cwd: schpet })

const t = tools(WORK)
const ours = (args, input) => {
  const answer = spawnSync(process.execPath, [t.bins.ours, "bench", ...args, "--json"], {
    ...t.ours,
    input,
    encoding: "utf8",
  })
  if (answer.status !== 0) throw new Error(`linear bench ${args.join(" ")}: ${answer.stderr.slice(0, 400)}`)
  return JSON.parse(answer.stdout)
}
mkdirSync(t.ours.env.WCLINEAR_CONFIG_DIR, { recursive: true })
// The bench profile's own settings: the raw API and the issue writes run without a question.
writeFileSync(
  join(t.ours.env.WCLINEAR_CONFIG_DIR, "config.json"),
  `${JSON.stringify({ profiles: { bench: { permissions: { api: "allow" } } } })}\n`,
)
ours(["session", "start", "--credential-storage", "file"], `${token()}\n`)
ours(["folders", "add", "linear:all"])
ours(["folders", "add", "linear:elsewhere"])

const embed = process.argv.includes("--embed")
if (embed) {
  // memo downloads into the folders of t.ours.env, which point away from the owner's WireCat folder.
  sh(process.execPath, [t.bins.memo, "models", "download", "embeddinggemma", "--json"], {
    env: t.ours.env,
    cwd: t.ours.cwd,
  })
}
const started = Date.now()
const sync = ours(["sync", ...(embed ? ["--embed"] : [])]).item
console.log(
  `sync${embed ? " --embed" : ""}: ${sync.state}, ${Math.round((Date.now() - started) / 1000)} s;`,
  sync.synced.map((one) => `${one.kind} ${one.saved}`).join(", "),
  `; documents ${sync.documents?.saved}`,
  embed ? `; embedded ${JSON.stringify(sync.embedded ?? sync.embed ?? null)}` : "",
)
