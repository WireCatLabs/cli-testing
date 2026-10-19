// Usage: node bench.mjs <cli-core checkout with dist> [chat counts, comma-separated] [messages per chat] [merge share]
// Synthetic data only. Times the re-keys the first `wa serve` after upgrading saves: every phone-form chat the store
// holds is re-keyed to a LID, through cli-core's own `stored` wrapper.
import { fork } from "node:child_process"
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath, pathToFileURL } from "node:url"

const [core, countsArg = "2000,10000", perChatArg = "20", mergeArg = "0.1"] = process.argv.slice(2)
const load = (entry) => import(pathToFileURL(join(core, "dist", entry)).href)
const { openStore } = await load("store/index.js")
const { stored } = await load("cli/index.js")
const { RecipientList } = await load("sends/index.js")

const perChat = Number(perChatArg)
const TASKS = 300
const mergeShare = Number(mergeArg)
const owner = { provider: "whatsapp", account: "500@lid" }
const other = { provider: "whatsapp", account: "600@lid" }
const PHONE_BASE = 34600000000
const phone = (i) => `${PHONE_BASE + i}@s.whatsapp.net`
const lid = (i) => `${900000 + i}@lid`
// The keys cli-core's archive writes (src/store/sqlite/completeness.ts); not exported.
const historyStartKey = (id) => `history_start:${id}`
const fetchedKey = (id) => `fetched:${id}`
const indexOf = (phoneId) => Number(phoneId.split("@")[0]) - PHONE_BASE
const dialog = (id) => ({
  id,
  title: `Person ${id}`,
  kind: "dialog",
  unreadCount: 0,
  lastMessageAt: "2026-10-18T10:00:00.000Z",
  participantsCount: 2,
})
const message = (id, chatId, minute) => ({
  id,
  chatId,
  senderId: "7",
  senderName: "Ana",
  timestamp: new Date(Date.UTC(2026, 9, 1) + minute * 60_000).toISOString(),
  editedAt: null,
  text: `message ${id} about the trip to Valencia and the dinner on Friday`,
  outgoing: minute % 3 === 0,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})
const ms = (value) => `${value.toFixed(value < 10 ? 2 : 0)} ms`
const count = (value) => value.toLocaleString("en")
const sorted = (values) => [...values].sort((a, b) => a - b)
const at = (values, q) => values[Math.min(values.length - 1, Math.floor(values.length * q))] ?? 0
const sum = (values) => values.reduce((a, b) => a + b, 0)

const seed = async (path, n) => {
  const store = await openStore({ path })
  const phones = n / 2
  const ids = Array.from({ length: n }, (_, i) => (i < phones ? phone(i) : lid(i)))
  for (let i = 0; i < n; i += 1000) await store.chats.saveChats(owner, ids.slice(i, i + 1000).map(dialog))
  for (const id of ids)
    await store.messages.saveMessages(
      owner,
      id,
      Array.from({ length: perChat }, (_, m) => message(`M${m}`, id, m)),
      { via: "history" },
    )
  // A chat already split in two: its LID twin holds one message the phone-form chat also has, and two of its own.
  const twins = Math.round(phones * mergeShare)
  await store.chats.saveChats(
    owner,
    Array.from({ length: twins }, (_, i) => dialog(lid(i))),
  )
  for (let i = 0; i < twins; i++)
    await store.messages.saveMessages(
      owner,
      lid(i),
      [message("M0", lid(i), 0), message("T1", lid(i), 500), message("T2", lid(i), 501)],
      { via: "update" },
    )
  await store.chats.saveChats(
    other,
    Array.from({ length: 100 }, (_, i) => dialog(phone(i))),
  )
  // Each chat an archive run has walked keeps two cursors; the re-key renames them by a scan of the account's cursors.
  for (const id of ids) {
    await store.sync.setSyncState(owner, historyStartKey(id), "M0")
    await store.sync.setSyncState(owner, fetchedKey(id), "M19")
  }
  await store.close()
  const raw = new DatabaseSync(path)
  raw
    .prepare(
      "INSERT INTO projects (key, name, type, scope, created_at, updated_at) VALUES ('T', 'T', 'work', 'work', 0, 0)",
    )
    .run()
  const locator = (i) => `msg:whatsapp/500%40lid/${encodeURIComponent(phone(i))}/M1`
  const task = raw.prepare(
    "INSERT INTO tasks (project_id, number, key, title, type, status, author_type, author_id, source, source_locator, source_group, created_at, updated_at) VALUES (1, ?, ?, 'reply', 'request', 'open', 'person', 1, 'rule', ?, ?, 0, 0)",
  )
  const link = raw.prepare(
    "INSERT INTO links (from_type, from_id, kind, source, target_text, target_folded, created_at, updated_at) VALUES ('task', ?, 'evidence', 'owner', ?, ?, 0, 0)",
  )
  for (let t = 1; t <= TASKS; t++) {
    const i = (t * 7) % phones
    task.run(t, `T-${t}`, locator(i), phone(i))
    link.run(t, locator(i).replace("/M1", "/M2"), locator(i).replace("/M1", "/m2"))
  }
  raw.close()
  return { phones, twins }
}

const neighbourOf = async (path) => {
  const child = fork(join(dirname(fileURLToPath(import.meta.url)), "neighbour.mjs"), [core, path])
  await new Promise((resolve) => child.once("message", resolve))
  return () =>
    new Promise((resolve) => {
      child.once("message", resolve)
      child.send("stop")
    })
}

const run = async (path, recipients, twins) => {
  const stopNeighbour = await neighbourOf(path)
  const store = await openStore({ path })
  const pending = new Set()
  const renames = []
  const merges = []
  let last = 0
  let handOver
  const held = new Promise((resolve) => {
    handOver = resolve
  })
  const messenger = {
    storedChats: (ids) => handOver(ids),
    feed: async (onBatch) => {
      const ids = await held
      last = performance.now()
      const rekeys = ids
        .filter((id) => id.endsWith("@s.whatsapp.net"))
        .map((id) => ({ from: id, to: lid(indexOf(id)) }))
      onBatch({ rekeys })
    },
  }
  const list = recipients ? new RecipientList(recipients, "wa", 250) : undefined
  const adapter = stored(messenger, {
    account: owner,
    store: async () => store,
    warn: (text) => process.stderr.write(`warn: ${text}\n`),
    events: () => {},
    pending,
    announcing: new Set(),
    rekeyed: async (from, to) => {
      await list?.rekey(from, to)
      const now = performance.now()
      ;(indexOf(from) < twins ? merges : renames).push(now - last)
      last = now
    },
  })
  const started = performance.now()
  await adapter.feed(() => {}, new AbortController().signal)
  while (pending.size > 0) await Promise.all([...pending])
  const total = performance.now() - started
  const { waits, failures } = await stopNeighbour()
  const left = (await store.forAccount(owner).chats.chats({})).items.filter((c) => c.id.endsWith("@s.whatsapp.net"))
  const untouched = (await store.forAccount(other).chats.chats({})).items.filter((c) =>
    c.id.endsWith("@s.whatsapp.net"),
  )
  await store.close()
  return { total, renames: sorted(renames), merges: sorted(merges), waits: sorted(waits), failures, left, untouched }
}

process.stdout.write(
  [
    "| chats | messages | re-keys (merges) | recipient list | total | rename median / p99 | merge median / p99 | time in merges | longest gap between saved re-keys | neighbour writes: median / worst wait | phone-form left | other account kept |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    "",
  ].join("\n"),
)
for (const n of countsArg.split(",").map(Number)) {
  const dir = mkdtempSync(join(tmpdir(), "rekey-batch-"))
  const seeded = join(dir, "seeded.db")
  const { phones, twins } = await seed(seeded, n)
  for (const withList of [false, true]) {
    const path = join(dir, `run-${withList}.db`)
    copyFileSync(seeded, path)
    let recipients
    if (withList) {
      recipients = join(dir, "recipients.json")
      const chats = Array.from({ length: 200 }, (_, i) => ({ id: phone(i * 3), title: null, addedAt: "2026-10-01" }))
      writeFileSync(recipients, JSON.stringify({ chats }))
    }
    const { total, renames, merges, waits, failures, left, untouched } = await run(path, recipients, twins)
    for (const failure of failures) process.stderr.write(`neighbour gave up after ${failure}\n`)
    const slowest = Math.max(renames.at(-1) ?? 0, merges.at(-1) ?? 0)
    process.stdout.write(
      `| ${count(n)} | ${count(n * perChat)} | ${count(phones)} (${count(twins)}) | ${withList ? "200 ids" : "none"} | ${ms(total)} | ${ms(at(renames, 0.5))} / ${ms(at(renames, 0.99))} | ${ms(at(merges, 0.5))} / ${ms(at(merges, 0.99))} | ${ms(sum(merges))} | ${ms(slowest)} | ${ms(at(waits, 0.5))} / ${ms(waits.at(-1) ?? 0)} (${waits.length} writes, ${failures.length} gave up) | ${left.length} | ${untouched.length} of 100 |\n`,
    )
  }
}
