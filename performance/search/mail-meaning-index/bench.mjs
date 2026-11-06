// node bench.mjs <cli-core checkout with dist> [threads] [rounds]
import { createHash } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [core, threadsArg = "20000", roundsArg = "5"] = process.argv.slice(2)
const { openStore } = await import(join(core, "dist/store/index.js"))
const THREADS = Number(threadsArg)
const ROUNDS = Number(roundsArg)
const DIMS = 384
const MODEL = "bench:random:384"

let seed = 42
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
const unit = () => {
  const v = new Float32Array(DIMS).map(() => random() - 0.5)
  const length = Math.hypot(...v)
  return v.map((x) => x / length)
}
const WORDS = "invoice budget offsite venue roadmap contract delivery payment schedule report".split(" ")
const sentence = () => Array.from({ length: 30 }, () => WORDS[Math.floor(random() * WORDS.length)]).join(" ")

const store = await openStore({ path: join(mkdtempSync(join(tmpdir(), "mail-index-")), "store.db") })
const accountId = await store.accounts.saveAccount({ provider: "email", account: "bench@example.com" }, { name: null })
const day = (n) => Date.UTC(2026, 0, 1) + n * 3_600_000
let started = performance.now()
for (let t = 0; t < THREADS; t++)
  await store.mail.saveThread({
    accountId,
    externalId: `thread-${t}`,
    now: day(t),
    emails: [0, 1].map((n) => ({
      externalId: `<${t}-${n}@example.com>`,
      subject: `Thread ${t}`,
      from: { address: `p${n}@example.com`, name: null },
      to: [{ address: "owner@example.com", name: null }],
      sentAt: day(t) + n,
      receivedAt: day(t) + n,
      bodyText: `${sentence()}\n\n${sentence()}`,
    })),
  })
const saved = performance.now() - started
started = performance.now()
let pieces = 0
for (;;) {
  const chunks = await store.mail.chunksToEmbed(MODEL, { limit: 2000 })
  if (!chunks.length) break
  pieces += chunks.length
  await store.vectors.saveVectors(
    MODEL,
    DIMS,
    chunks.map(({ hash }) => ({ hash, vector: unit() })),
  )
}
const embedded = performance.now() - started
const times = []
let refs
const answers = createHash("sha256")
for (let r = 0; r < ROUNDS; r++) {
  const query = unit()
  const t0 = performance.now()
  const found = await store.mail.nearest(MODEL, query, { accountId, limit: 100 })
  times.push(performance.now() - t0)
  if (r === 0) refs = found.length
  answers.update(found.map(({ externalId }) => externalId).join(","))
}
times.sort((a, b) => a - b)
process.stdout.write(
  `${JSON.stringify({
    threads: THREADS,
    vectors: pieces,
    setup_s: Math.round((saved + embedded) / 1000),
    results: refs,
    answers: answers.digest("hex").slice(0, 12),
    median_ms: Math.round(times[Math.floor(times.length / 2)]),
    max_ms: Math.round(times.at(-1)),
  })}\n`,
)
await store.close()
