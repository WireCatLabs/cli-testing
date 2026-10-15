// Synthetic store for the output-size test: 5,000 invented messages in five chats, for the profile "bench".
//
//   node seed.ts <cli-core dir with dist/> <store.db> <tg state dir: $XDG_DATA_HOME/tg-cli>
//
// Nothing here reads a real account, store or message. Names, phones and addresses are invented
// (phones in the 555-01xx range, addresses at example.test).
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [root, path, stateDir] = process.argv.slice(2)
if (!root || !path || !stateDir)
  throw new Error("usage: node seed.ts <cli-core dir> <store.db> <tg state dir: $XDG_DATA_HOME/tg-cli>")
const { openStore } = await import(join(root, "dist/store/index.js"))

const WORDS = ["heron", "ledger", "invoice", "river", "budget", "census", "meeting", "report", "garden", "schedule"]
const SENDERS = ["Alice Example", "Bob Sample", "Carol Test", "Dan Invented", "Eve Placeholder"]
const account = { provider: "telegram", account: "100" }
const chats = [
  { id: "1", title: "Alice Example", kind: "private" },
  { id: "2", title: "Garden club", kind: "group" },
  { id: "3", title: "Project Heron", kind: "group" },
  { id: "4", title: "Reading circle", kind: "group" },
  { id: "5", title: "Budget team", kind: "group" },
]
const PER_CHAT = 1000
const word = (at: number) => WORDS[at % WORDS.length] as string

const store = await openStore({ path })
await store.saveChats(
  account,
  chats.map((chat) => ({
    ...chat,
    unreadCount: 0,
    lastMessageAt: "2026-02-01T00:00:00.000Z",
    participantsCount: null,
  })),
)
await store.savePeople(
  account,
  SENDERS.map((name, at) => ({ id: String(200 + at), name })),
)
for (const chat of chats) {
  const batch = []
  for (let at = 0; at < PER_CHAT; at++) {
    const extra =
      at % 25 === 0
        ? ` call +1 555 010 ${String(at % 100).padStart(2, "0")} or write to person${at}@example.test`
        : at % 40 === 0
          ? ` see https://example.test/docs/${at}`
          : ""
    const sender = chat.kind === "private" ? 0 : at % SENDERS.length
    batch.push({
      id: String(at + 1),
      chatId: chat.id,
      senderId: String(200 + sender),
      senderName: SENDERS[sender] as string,
      timestamp: new Date(Date.UTC(2026, 0, 1) + (Number(chat.id) * PER_CHAT + at) * 60_000).toISOString(),
      editedAt: null,
      text: `Update on the ${word(at)} and the ${word(at * 7 + 3)}: we agreed on item ${at}, the owner will confirm it before the end of the week.${extra}`,
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    })
  }
  for (let at = 0; at < batch.length; at += 500)
    await store.saveMessages(account, chat.id, batch.slice(at, at + 500), { via: "history" })
}
await store.fillSearchIndex?.()
await store.close()

mkdirSync(join(stateDir, "accounts"), { recursive: true })
writeFileSync(join(stateDir, "accounts", "bench.json"), `${JSON.stringify({ account: "100" })}\n`)
process.stdout.write(`seeded ${chats.length * PER_CHAT} messages in ${chats.length} chats at ${path}\n`)
