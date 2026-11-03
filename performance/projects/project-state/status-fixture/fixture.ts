// HRB, an invented harbour-site project shaped like the owner's real one by its totals only: a client group of about
// 800 messages, the owner's dialog with the client lead, a contractor dialog in a second account held in part, and a
// noisy leads group with no role. Every name, number and text is made up.
//
//   node fixture.ts <cli-core dir with dist/> <store.db>
import { join } from "node:path"

export const D = "2026-10-19"
export const BEFORE = "2026-11-02T10:00:00.000Z"
const CLIENT = { provider: "max", account: "11" }
const CONTRACTOR = { provider: "telegram", account: "22" }
const DAY = 86_400_000

const day = (offset: number, time = "09:00") =>
  new Date(Date.parse(`${D}T${time}:00.000Z`) + offset * DAY).toISOString()

interface Said {
  id: number
  at: string
  from: string
  sender: string
  text: string
}

const message = (chatId: string, { id, at, from, sender, text }: Said) => ({
  id: String(id),
  chatId,
  senderId: from === "me" ? "1" : sender,
  senderName: from === "me" ? "Owner" : from,
  timestamp: at,
  editedAt: null,
  text,
  outgoing: from === "me",
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const SUBJECTS = ["Макет главной", "Карточка товара", "Форма заявки", "Страница доставки", "Каталог", "Шапка сайта"]
const STATES = ["почти готов", "ждёт правок", "согласован", "на проверке", "переделан", "выглядит лучше"]
const TAILS = [
  "посмотрю вечером",
  "давайте обсудим на неделе",
  "фото пришлю позже",
  "цвета оставим как есть",
  "текст поправит Мия",
  "всё понятно, спасибо",
  "кнопку сделаем крупнее",
]
const PEOPLE = [
  ["Ana", "31"],
  ["Kai", "40"],
  ["Mia", "41"],
] as const

const filler = (at: number) =>
  `${SUBJECTS[at % SUBJECTS.length]} ${STATES[(at * 5 + 1) % STATES.length]}, ${TAILS[(at * 3 + 2) % TAILS.length]}`

/** About 800 messages from D−55 to D+8, four planted ones among them. */
const clientGroup = (): Said[] => {
  const planted: Said[] = [
    { id: 0, at: day(-7, "11:00"), from: "Ana", sender: "31", text: "Что с интеграцией 1C? Ждём новостей" },
    { id: 0, at: day(-5, "12:00"), from: "me", sender: "1", text: "1C подключим, как только закроем счёт" },
    { id: 0, at: day(0, "10:00"), from: "me", sender: "1", text: "Оплатите, пожалуйста, счёт на 1 200 € за сентябрь" },
    { id: 0, at: day(7, "10:00"), from: "me", sender: "1", text: "Напоминаю: счёт на 1 200 € ждёт оплаты" },
  ]
  const start = Date.parse(day(-55, "08:00"))
  const step = (63 * DAY) / 797
  const fill: Said[] = Array.from({ length: 797 }, (_, at) => {
    const [from, sender] = at % 9 === 0 ? ["me", "1"] : (PEOPLE[at % PEOPLE.length] as readonly [string, string])
    return { id: 0, at: new Date(start + at * step).toISOString(), from, sender, text: filler(at) }
  })
  return [...fill, ...planted].sort((a, b) => a.at.localeCompare(b.at)).map((one, at) => ({ ...one, id: at + 1 }))
}

const leads = (): Said[] =>
  Array.from({ length: 200 }, (_, at) => ({
    id: at + 1,
    at: new Date(Date.parse(day(-40)) + at * 5 * 3_600_000).toISOString(),
    from: `Visitor ${at % 23}`,
    sender: String(500 + (at % 23)),
    text: `Здравствуйте, хочу заказать ${["сайт", "лендинг", "магазин", "визитку"][at % 4]}, сколько стоит?`,
  }))

export const CHATS = [
  {
    account: CLIENT,
    id: "-900",
    title: "Harbour group",
    kind: "group",
    role: "client",
    whole: true,
    said: clientGroup(),
  },
  {
    account: CLIENT,
    id: "501",
    title: "Ana",
    kind: "dialog",
    role: "client",
    whole: true,
    said: [
      { id: 1, at: day(-3), from: "Ana", sender: "31", text: "Пришлите договор, пожалуйста" },
      { id: 2, at: day(-2), from: "me", sender: "1", text: "Ана, договор у вас на почте, жду подписи" },
    ],
  },
  {
    account: CONTRACTOR,
    id: "555",
    title: "Lev",
    kind: "dialog",
    role: "contractor",
    whole: false,
    said: [
      { id: 40, at: day(1), from: "me", sender: "1", text: "Лев, как там отчёт за сентябрь?" },
      { id: 41, at: day(2), from: "Lev", sender: "77", text: "Пришлю отчёт завтра" },
      { id: 42, at: day(9), from: "Lev", sender: "77", text: "Отчёт готов. Посмотрите, всё ли верно?" },
    ],
  },
  { account: CLIENT, id: "-950", title: "Leads", kind: "group", whole: true, said: leads() },
] as const

export const seed = async (core: string, path: string) => {
  const { openStore } = await import(join(core, "dist/store/index.js"))
  const { historyStartKey } = await import(join(core, "dist/store/exports.js"))
  const store = await openStore({ path })
  const project = await store.knowledge.addProject({ name: "Harbour site", key: "HRB" })
  for (const chat of CHATS) {
    const messages = chat.said.map((one) => message(chat.id, one))
    await store.chats.saveChats(chat.account, [
      {
        id: chat.id,
        title: chat.title,
        kind: chat.kind,
        unreadCount: 0,
        lastMessageAt: messages.at(-1)?.timestamp ?? null,
        participantsCount: chat.kind === "dialog" ? 2 : 12,
      },
    ])
    await store.messages.saveMessages(chat.account, chat.id, messages, { via: "history" })
    const ids = chat.said.map((one) => one.id)
    await store.sync.markRange(chat.account, chat.id, Math.min(...ids), Math.max(...ids))
    if (chat.whole) await store.sync.setSyncState(chat.account, historyStartKey(chat.id), String(Math.min(...ids)))
    await store.knowledge.relate(null, {
      by: "owner",
      from: `chat:${chat.account.provider}/${chat.account.account}/${chat.id}`,
      to: project.ref,
      kind: "member-of",
      confirmed: true,
      ...("role" in chat ? { role: chat.role } : {}),
    })
  }
  await store.close()
  return CHATS.reduce((sum, chat) => sum + chat.said.length, 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [core, path] = process.argv.slice(2)
  if (!core || !path) throw new Error("usage: node fixture.ts <cli-core dir with dist/> <store.db>")
  process.stdout.write(`seeded ${await seed(core, path)} messages at ${path}\n`)
}
