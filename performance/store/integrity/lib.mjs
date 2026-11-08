import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

export const HARNESS = process.env.STORE_HARNESS_DIR ?? "/var/tmp/claude/store-harness"
export const ACCOUNT = { provider: "telegram", account: "harness-1" }

const coreDir = (version) => join(HARNESS, "cores", version, "node_modules", "@wirecat", "cli-core")

// Each version gets its own folder so writers on different cli-core versions run side by side.
export const installCore = (version) => {
  if (existsSync(join(coreDir(version), "package.json"))) return
  const dir = join(HARNESS, "cores", version)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "package.json"), '{"private":true}\n')
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", `@wirecat/cli-core@${version}`], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  })
}

export const loadCore = (version, path) => import(pathToFileURL(join(coreDir(version), "dist", path)).href)

export const args = (argv) => {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i]
    else out._.push(argv[i])
  }
  return out
}

export const chatOf = (role, pid) => `${role}-${pid}`

const BODY_WORDS = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november".split(" ")

export const messages = (chatId, from, n, size) =>
  Array.from({ length: n }, (_, i) => {
    const id = from + i
    const words = Array.from({ length: Math.ceil(size / 6) }, (_, w) => BODY_WORDS[(id * 7 + w) % BODY_WORDS.length])
    return {
      id: String(id),
      chatId,
      senderId: `sender-${id % 17}`,
      senderName: `Sender ${id % 17}`,
      timestamp: new Date(Date.UTC(2026, 0, 1) + id * 1000).toISOString(),
      editedAt: null,
      text: `${words.join(" ")} ${id}`,
      outgoing: id % 5 === 0,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
  })
