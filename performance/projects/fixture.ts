// The synthetic store both project measurements read: one project "Harbour Bureau" (key HBB, alias Харбор) and
// 13 labelled texts in Telegram, mail and an imported notes folder (labels: evidence/baseline.json). Invented only.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const seedProjectStore = async (memo: string) => {
  const { openStore } = await import(join(memo, "node_modules/@wirecat/cli-core/dist/store/index.js"))
  const home = mkdtempSync(join(tmpdir(), "project-evidence-"))
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_STATE_HOME: join(home, "state"),
    MESSAGING_STORE: join(home, "store.db"),
  }
  const DAY = 86_400_000
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
  const telegram = { provider: "telegram", account: "100" }
  const message = (id: string, chatId: string, sender: string, text: string, days: number) => ({
    id,
    chatId,
    senderId: sender === "Rita Example" ? "21" : "22",
    senderName: sender,
    timestamp: ago(days),
    editedAt: null,
    text,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  })

  const refs: Record<string, string> = {}
  const store = await openStore({ env })
  const core = [
    ["t-alias-latin", "1", "HBB pilot with the bank starts on Monday", 5],
    ["t-alias-cyrillic", "2", "Бухгалтера для Харбор всё ещё ищем", 4],
    ["t-name", "3", "Harbour Bureau landing page is live", 3],
    ["t-reply", "4", "Ok, I will check it tomorrow", 3],
    ["t-alias-noise", "5", "Bought an HBB cable for the TV", 2],
    ["t-old", "6", "Harbour Bureau founding call notes", 200],
  ] as const
  await store.messages.saveMessages(
    telegram,
    "10",
    core.map(([, id, text, days]) => message(id, "10", "Oleg Sample", text, days)),
    { via: "history" },
  )
  for (const [key, id] of core) refs[key] = `msg:telegram/100/10/${id}`
  await store.messages.saveMessages(
    telegram,
    "20",
    [message("7", "20", "Rita Example", "Rita Example here, sending the tracker you asked for", 2)],
    {
      via: "history",
    },
  )
  refs["t-rita-dm"] = "msg:telegram/100/20/7"
  await store.messages.saveMessages(
    telegram,
    "30",
    [message("8", "30", "Rita Example", "Rita Example will water the garden plan", 1)],
    {
      via: "history",
    },
  )
  refs["t-rita-garden"] = "msg:telegram/100/30/8"

  const mailId = await store.accounts.saveAccount({ provider: "email", account: "me@example.com" }, { name: "Me" })
  const email = (thread: string, id: string, subject: string, body: string, days: number) =>
    store.mail.saveThread({
      accountId: mailId,
      externalId: thread,
      now: Date.now(),
      emails: [
        {
          externalId: id,
          subject,
          from: { address: "sender@example.com", name: null },
          to: [{ address: "me@example.com", name: null }],
          cc: [],
          sentAt: Date.parse(ago(days)),
          receivedAt: Date.parse(ago(days)),
          references: [],
          bodyText: body,
          outgoing: false,
          read: true,
          mailboxes: [{ externalId: "INBOX", name: "INBOX", kind: null }],
        },
      ],
    })
  await email("th1", "e1", "Bank tracker", "The bank tracker for HBB is updated", 6)
  await email("th2", "e2", "Weekly deals", "HBB cables on sale this week", 1)
  refs["m-tracker"] = "msg:email/me%40example.com/th1/e1"
  refs["m-newsletter"] = "msg:email/me%40example.com/th2/e2"

  const folder = await store.notes.addFolder({ name: "Harbour drive" })
  const method = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "method.md",
    title: "Harbour Bureau methodology",
    text: "How Harbour Bureau checks a company, written a year ago",
  })
  const garden = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "garden.md",
    title: "Garden plan",
    text: "Beds and water",
  })
  refs["d-method"] = method.note.ref
  refs["d-garden"] = garden.note.ref
  refs["n-own"] = (await store.notes.addNote({ text: "HBB idea: a second bank" })).ref

  const project = await store.knowledge.addProject({ name: "Harbour Bureau", key: "HBB" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Харбор")
  await store.fillSearchIndex?.()
  await store.close()
  return { env, refs, folder }
}
