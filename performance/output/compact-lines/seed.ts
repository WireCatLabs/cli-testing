// One invented Telegram chat of 1,000 Cyrillic messages, about 150 characters each, plus four small chats, for the
// account "100" of the profile "bench". Nothing here reads a real account, store or message.
//
//   node seed.ts <cli-core dir with dist/> <store.db> <tg state dir: $XDG_DATA_HOME/tg-cli>
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [core, path, stateDir] = process.argv.slice(2)
if (!core || !path || !stateDir)
  throw new Error("usage: node seed.ts <cli-core dir> <store.db> <tg state dir: $XDG_DATA_HOME/tg-cli>")
const { openStore } = await import(join(core, "dist/store/index.js"))

const account = { provider: "telegram", account: "100" }
const SENDERS = ["Анна Пример", "Борис Образец", "Вера Тестова", "Глеб Выдуманный"]
const OPENERS = ["Коллеги, коротко:", "Напоминаю всем:", "По проекту Гавань:", "Короче,", "Добрый день!", "Итак,"]
const BODIES = [
  "макет главной страницы согласовали, осталось поправить шапку и поменять цвет кнопки заявки",
  "счёт за сентябрь отправил на почту бухгалтерии, жду подтверждения оплаты до конца недели",
  "интеграцию с каталогом проверили на тестовом сервере, ошибок в выгрузке цен больше нет",
  "фотографии для карточек товаров будут в пятницу, фотограф обещал обработать их за два дня",
  "встречу с клиентом перенесли на вторник, повестку пришлю отдельным сообщением сегодня вечером",
]
const TAILS = [
  "Вопросы есть?",
  "Спасибо всем за терпение.",
  "Если что — пишите.",
  "Подробности в общем документе.",
  "Обсудим на созвоне в четверг.",
]
const pick = <T>(list: readonly T[], at: number) => list[at % list.length] as T
const text = (at: number) =>
  `${pick(OPENERS, at)} ${pick(BODIES, at * 3 + 1)}. ${pick(TAILS, at * 7 + 2)} (пункт ${at + 1}, этап ${(at % 7) + 1})`

const chats = [
  { id: "1", title: "Проект Гавань", kind: "group", size: 1000 },
  { id: "2", title: "Анна Пример", kind: "private", size: 50 },
  { id: "3", title: "Бухгалтерия", kind: "group", size: 50 },
  { id: "4", title: "Фотографы", kind: "group", size: 50 },
  { id: "5", title: "Соседи", kind: "group", size: 50 },
]
const START = Date.UTC(2026, 8, 1)

const store = await openStore({ path })
await store.chats.saveChats(
  account,
  chats.map(({ id, title, kind }) => ({ id, title, kind, unreadCount: 0, lastMessageAt: null, participantsCount: 9 })),
)
await store.people.savePeople(
  account,
  SENDERS.map((name, at) => ({ id: String(200 + at), name })),
)
for (const chat of chats) {
  const batch = Array.from({ length: chat.size }, (_, at) => {
    const sender = chat.kind === "private" ? 0 : (at * 5 + 1) % SENDERS.length
    return {
      id: String(at + 1),
      chatId: chat.id,
      senderId: String(200 + sender),
      senderName: SENDERS[sender] as string,
      timestamp: new Date(START + at * 47 * 60_000).toISOString(),
      editedAt: null,
      text: text(at + Number(chat.id)),
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
  })
  for (let at = 0; at < batch.length; at += 500)
    await store.messages.saveMessages(account, chat.id, batch.slice(at, at + 500), { via: "history" })
}
await store.close()

mkdirSync(join(stateDir, "accounts"), { recursive: true })
writeFileSync(join(stateDir, "accounts", "bench.json"), `${JSON.stringify({ account: "100" })}\n`)
process.stdout.write(`seeded ${chats.reduce((sum, chat) => sum + chat.size, 0)} messages at ${path}\n`)
