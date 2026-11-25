import { appendFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "vitest"
import type { Message } from "../domain/models.js"
import { openStore } from "./store.js"

const account = { provider: "telegram", account: "500" }
const TOTAL = Number(process.env.BENCH_TOTAL ?? 60_000)
const PAGE = 100
const TOP = 2_000_000

const message = (id: number): Message => ({
  id: String(id),
  chatId: "-100777",
  senderId: String(1000 + (id % 300)),
  senderName: `Member ${id % 300}`,
  timestamp: new Date(Date.UTC(2024, 0, 1) + id * 60_000).toISOString(),
  editedAt: null,
  text: `message ${id} about the release, ping @member${id % 300} and see https://example.com/${id}`,
  outgoing: false,
  attachments: [],
  replyTo: null,
  ...(id % 5 === 0 ? { replyToId: String(id + 3) } : {}),
  forwardedFrom: null,
  reactions: null,
})

it("bench", { timeout: 3_600_000 }, async () => {
  const store = await openStore({
    path: process.env.BENCH_DB ?? join(mkdtempSync(join(tmpdir(), "bench917-")), "m.db"),
  })
  if (process.env.BENCH_INDEX) {
    const { DatabaseSync } = await import("node:sqlite")
    const side = new DatabaseSync(process.env.BENCH_DB as string)
    side.exec(process.env.BENCH_INDEX)
    side.close()
  }
  await store.chats.saveChats(account, [
    {
      id: "-100777",
      title: "Big group",
      kind: "group",
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: 300,
    },
  ])
  let window = { save: 0, mark: 0, pages: 0 }
  for (let held = 0; held < TOTAL; held += PAGE) {
    const top = TOP - held
    const page = Array.from({ length: PAGE }, (_, i) => message(top - i))
    const a = performance.now()
    await store.messages.saveMessages(account, "-100777", page, { via: "history", seenAt: Date.now() })
    const b = performance.now()
    await store.sync.markRange(account, "-100777", top - PAGE + 1, TOP)
    const c = performance.now()
    window = { save: window.save + b - a, mark: window.mark + c - b, pages: window.pages + 1 }
    if ((held + PAGE) % 10_000 === 0) {
      appendFileSync(
        process.env.BENCH_OUT ?? "/dev/null",
        `held ${held + PAGE}: save ${(window.save / window.pages).toFixed(1)} ms/page, mark ${(window.mark / window.pages).toFixed(1)} ms/page\n`,
      )
      window = { save: 0, mark: 0, pages: 0 }
    }
  }
  await store.close()
})
