import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

export const HARNESS = process.env.STORE_HARNESS_DIR ?? "/var/tmp/claude/store-harness"
export const ACCOUNT = { provider: "telegram", account: "harness-1" }
export const MAIL_ACCOUNT = { provider: "email", account: "harness@example.test" }
export const CURRENT = "0.611.0"
export const MODEL = "harness-e5"
export const DIMS = 16

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

const words = (seed, n) => Array.from({ length: n }, (_, w) => BODY_WORDS[(seed * 7 + w * 3) % BODY_WORDS.length])

// Deterministic, so a vector written twice for the same text is the same vector.
export const vector = (seed) => {
  const out = new Float32Array(DIMS)
  let x = (seed * 2654435761) >>> 0
  for (let i = 0; i < DIMS; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    out[i] = x / 2 ** 32 - 0.5
  }
  return out
}

const seedOf = (text) => {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export const vectorsFor = (items) => items.map(({ hash, text }) => ({ hash, vector: vector(seedOf(hash ?? text)) }))

export const emailId = (prefix, n) => `<${prefix}.${n}@harness.test>`

// One thread per email keeps every save independent; mail sync saves a slice of threads and its resume point at once.
export const threads = (accountId, prefix, from, n, size, now) =>
  Array.from({ length: n }, (_, i) => {
    const id = from + i
    return {
      accountId,
      externalId: `thread-${prefix}-${id}`,
      now,
      emails: [
        {
          externalId: emailId(prefix, id),
          subject: `Harness ${words(id, 4).join(" ")}`,
          from: { address: `sender${id % 23}@example.test`, name: `Sender ${id % 23}` },
          to: [{ address: "harness@example.test", name: "Harness" }],
          sentAt: Date.UTC(2026, 0, 1) + id * 60_000,
          bodyText: `${words(id, Math.ceil(size / 6)).join(" ")} ${id}`,
          mailboxes: [{ externalId: "INBOX", name: "INBOX", kind: "inbox" }],
        },
      ],
    }
  })

export const notePath = (prefix, n) => `${prefix}/note-${n}.md`

export const noteFiles = (folderId, prefix, from, n, size) =>
  Array.from({ length: n }, (_, i) => {
    const id = from + i
    const text = `# Note ${id}\n\n${words(id, Math.ceil(size / 6)).join(" ")} ${id}\n`
    return { folderId, path: notePath(prefix, id), title: `Note ${id}`, text, contentHash: `h-${prefix}-${id}` }
  })

const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 32)

// Embeds what the last writes left without a vector, as each CLI's own embed step does after its sync.
export const embed = {
  messages: async (store, key, after = 0) => {
    const page = await store.vectors.messagesToEmbed(key, { model: MODEL, after, limit: 500 })
    const items = page
      .filter(({ text }) => text)
      .map(({ messagePk, text, sentAt }) => ({
        messagePk,
        hash: hashOf(text),
        length: text.length,
        occurredAt: sentAt,
      }))
    if (items.length === 0) return { n: 0, after }
    await store.vectors.saveMessageVectors(
      key,
      MODEL,
      DIMS,
      items.map((item) => ({ ...item, vector: vector(seedOf(item.hash)) })),
    )
    return { n: items.length, after: page.at(-1).messagePk }
  },
  mail: async (store) => {
    const chunks = await store.mail.chunksToEmbed(MODEL, { limit: 500 })
    if (chunks.length) await store.vectors.saveVectors(MODEL, DIMS, vectorsFor(chunks))
    return { n: chunks.length }
  },
  notes: async (store) => {
    const chunks = await store.notes.chunksToEmbed(MODEL, { limit: 500 })
    if (chunks.length) await store.vectors.saveVectors(MODEL, DIMS, vectorsFor(chunks))
    return { n: chunks.length }
  },
}
