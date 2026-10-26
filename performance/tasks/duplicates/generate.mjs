// Usage: node generate.mjs > tasks.jsonl
// Synthetic only: invented people, chats and amounts. Day 0 is Tuesday 2026-09-01.
const BASE = Date.UTC(2026, 8, 1)
const DAY = 86_400_000
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

const people = {
  ivan: "Иван Пример",
  maria: "Мария Образцова",
  petr: "Пётр Тестов",
  olga: "Ольга Шаблонова",
  dmitry: "Дмитрий Макетов",
  nina: "Нина Пробная",
  alice: "Alice Example",
  bob: "Bob Sample",
  carol: "Carol Demo",
  anon: null,
}
const groups = new Set(["grp-house", "grp-team", "grp-school", "grp-family"])

let seed = 20261014
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

const iso = (day, hour = 12, minute = 0) => new Date(BASE + day * DAY + (hour * 60 + minute) * 60_000).toISOString()
const date = (day) => iso(day).slice(0, 10)
const resolveDue = (spec, day) => {
  if (spec === undefined || spec === null) return null
  if (typeof spec === "number") return date(spec)
  if (spec === "tomorrow") return date(day + 1)
  const target = WEEKDAYS.indexOf(spec)
  for (let next = day + 1; ; next++) if ((2 + next) % 7 === target) return date(next)
}

// t(day, hour, who, chat, category, title, text, { amount, cur, due, reply, closed, g })
const t = (day, hour, who, chat, category, title, text, extra = {}) => ({
  day,
  hour,
  who,
  chat,
  category,
  title,
  text,
  ...extra,
})

const scenarios = []
const S = (kind, subtype, tasks, { dup = kind !== "lookalike" && kind !== "busy" } = {}) =>
  scenarios.push({ kind, subtype, tasks, dup })

// (a) one task written differently
S("dup", "a.digits", [
  t(
    2,
    10,
    "ivan",
    "dm-ivan",
    "money",
    "Оплатить счёт за электричество",
    "Оплати, пожалуйста, счёт за электричество, там 4 300 ₽",
    { amount: 4300, cur: "RUB" },
  ),
  t(
    3,
    19,
    "ivan",
    "dm-ivan",
    "money",
    "Оплата счета за электричество",
    "Счет за электричество 4300 руб так и не оплачен",
    { amount: 4300, cur: "RUB" },
  ),
])
S("dup", "a.synonym", [
  t(
    5,
    11,
    "maria",
    "dm-maria",
    "money",
    "Оплатить счёт за ремонт кухни",
    "Оплати счёт за ремонт кухни, 15 000 руб, до пятницы",
    { amount: 15000, cur: "RUB", due: "fri" },
  ),
  t(
    6,
    9,
    "maria",
    "dm-maria",
    "money",
    "Перевести Марии за кухню",
    "переведи за счёт по кухне 15000 р., край — пятница",
    { amount: 15000, cur: "RUB", due: "fri" },
  ),
])
S("dup", "a.lang", [
  t(
    4,
    15,
    "alice",
    "dm-alice",
    "documents",
    "Send signed contract to Alice",
    "Hi! Could you send me the signed contract by Friday?",
    { due: "fri" },
  ),
  t(
    6,
    10,
    "alice",
    "dm-alice",
    "documents",
    "Отправить Алисе подписанный договор",
    "Still waiting for the signed contract, by Friday please",
    { due: "fri" },
  ),
])
S("dup", "a.typo", [
  t(
    7,
    13,
    "petr",
    "dm-petr",
    "access",
    "Дать доступ Петру к репозиторию",
    "Дай мне доступ к репозиторию проекта, плиз",
  ),
  t(9, 17, "petr", "dm-petr", "access", "Доступ к репозитрию для Петра", "доступ к репозитрию так и не дал(("),
])
S("dup", "a.forms", [
  t(
    8,
    20,
    "olga",
    "grp-school",
    "money",
    "Сдать деньги на экскурсию в музей",
    "Родители, сдаём по 2 500 руб на экскурсию в музей до 15.09",
    { amount: 2500, cur: "RUB", due: 14, closed: 15 },
  ),
  t(
    10,
    8,
    "olga",
    "grp-school",
    "money",
    "Сдача денег на экскурсию",
    "Напоминаю: деньги на экскурсию 2500 р. сдать до 15.09",
    { amount: 2500, cur: "RUB", due: 14, closed: 15 },
  ),
  t(
    13,
    21,
    "olga",
    "grp-school",
    "money",
    "Деньги на экскурсию",
    "Кто ещё не сдал на экскурсию — завтра последний день!",
    { due: "tomorrow", closed: 15 },
  ),
])
S("dup", "a.k", [
  t(11, 22, "bob", "dm-bob", "money", "Pay Bob back for concert tickets", "you owe me 120$ for the concert tickets", {
    amount: 120,
    cur: "USD",
  }),
  t(14, 12, "bob", "dm-bob", "money", "Return 120 USD to Bob", "reminder: 120 usd for the tickets :)", {
    amount: 120,
    cur: "USD",
  }),
])
S("dup", "a.k", [
  t(12, 18, "dmitry", "dm-dmitry", "money", "Вернуть Дмитрию 15к", "верни 15к до конца месяца", {
    amount: 15000,
    due: 29,
  }),
  t(
    16,
    10,
    "dmitry",
    "dm-dmitry",
    "money",
    "Вернуть долг Дмитрию 15 000 ₽",
    "Про 15 000 ₽ не забыл? До конца месяца надо",
    { amount: 15000, cur: "RUB", due: 29 },
  ),
])
S("dup", "a.reminder", [
  t(
    13,
    10,
    "maria",
    "dm-maria",
    "meeting",
    "Согласовать встречу с Марией",
    "Когда сможешь встретиться на неделе обсудить проект?",
  ),
  t(15, 16, "maria", "dm-maria", "meeting", "Ответить Марии про встречу", "Ну что, когда встречаемся по проекту?"),
])
S("dup", "a.late", [
  t(10, 14, "ivan", "dm-ivan", "documents", "Отправить Ивану скан паспорта", "Скинь скан паспорта для визы"),
  t(
    28,
    11,
    "ivan",
    "dm-ivan",
    "documents",
    "Скан паспорта для Ивана",
    "Ты так и не прислал скан паспорта, без него визу не подать",
  ),
])
S("dup", "a.synonym", [
  t(
    9,
    9,
    "carol",
    "dm-carol",
    "delivery",
    "Pick up parcel from post office",
    "Your parcel is waiting at the post office, pick it up by Sep 12",
    { due: 11 },
  ),
  t(
    10,
    18,
    "carol",
    "dm-carol",
    "delivery",
    "Collect the package at the post office",
    "the package is still at the post office, deadline 12 September",
    { due: 11 },
  ),
])
S("dup", "a.forms", [
  t(
    14,
    19,
    "nina",
    "grp-family",
    "personal",
    "Позвонить Нине насчёт дня рождения",
    "Позвони мне вечером, обсудим день рождения папы",
  ),
  t(
    16,
    21,
    "nina",
    "grp-family",
    "personal",
    "Созвониться с Ниной про ДР папы",
    "Ты обещал позвонить про день рождения папы",
  ),
])
S("dup", "a.reminder", [
  t(
    15,
    11,
    "bob",
    "dm-bob",
    "meeting",
    "Schedule call with Bob about Q4 budget",
    "can we set up a call this week about the Q4 budget?",
  ),
  t(17, 15, "bob", "dm-bob", "meeting", "Call Bob re Q4 budget", "still need that call on the q4 budget"),
])
S("dup", "a.digits", [
  t(
    12,
    9,
    "petr",
    "grp-house",
    "money",
    "Оплатить взнос на ремонт подъезда",
    "Соседи, сдаём на ремонт подъезда по 3000 ₽ до 20 сентября",
    { amount: 3000, cur: "RUB", due: 19 },
  ),
  t(
    17,
    20,
    "petr",
    "grp-house",
    "money",
    "Взнос за ремонт подъезда",
    "Кто ещё не сдал 3 000 р. за подъезд — до 20.09",
    { amount: 3000, cur: "RUB", due: 19 },
  ),
])
S("dup", "a.typo", [
  t(
    18,
    10,
    "alice",
    "dm-alice",
    "documents",
    "Review the lease agreement",
    "can you review the lease agreement before I sign it?",
  ),
  t(19, 18, "alice", "dm-alice", "documents", "Reveiw lease agreemnt", "did you get to the lease agreemnt?"),
])
S("dup", "a.synonym", [
  t(
    19,
    12,
    "bob",
    "dm-bob",
    "money",
    "Pay the plumber invoice",
    "the plumber sent the invoice, 180 EUR, can you pay it?",
    { amount: 180, cur: "EUR" },
  ),
  t(21, 9, "bob", "dm-bob", "money", "Transfer money to the plumber", "please transfer the 180 € for the plumber", {
    amount: 180,
    cur: "EUR",
  }),
])
S("dup", "a.forms", [
  t(
    20,
    11,
    "maria",
    "dm-maria",
    "documents",
    "Подписать акт выполненных работ",
    "Нужно подписать акт выполненных работ за август",
  ),
  t(22, 16, "maria", "dm-maria", "documents", "Подпись акта за август", "Акт за август подписал?"),
])
S("dup", "a.lang", [
  t(
    21,
    14,
    "carol",
    "dm-carol",
    "money",
    "Pay Carol's design invoice",
    "Hi, could you pay the invoice for the design work, 250 EUR?",
    { amount: 250, cur: "EUR" },
  ),
  t(
    23,
    10,
    "carol",
    "dm-carol",
    "money",
    "Оплатить счёт Кэрол за дизайн",
    "Счёт на 250 € за дизайн оплатишь? Sorry for my Russian",
    { amount: 250, cur: "EUR" },
  ),
])
S("dup", "a.forms", [
  t(
    22,
    12,
    "dmitry",
    "dm-dmitry",
    "delivery",
    "Забрать посылку из пункта выдачи СДЭК",
    "Посылка пришла в пункт выдачи СДЭК, забери до четверга",
    { due: "thu" },
  ),
  t(23, 19, "dmitry", "dm-dmitry", "delivery", "Забрать посылку", "Посылку забрал? В четверг её вернут отправителю", {
    due: "thu",
  }),
])
S("dup", "a.three", [
  t(20, 10, "ivan", "dm-ivan", "money", "Вернуть Ивану 5000", "Верни 5000 рублей, которые брал в августе", {
    amount: 5000,
    cur: "RUB",
  }),
  t(22, 20, "ivan", "dm-ivan", "money", "Вернуть долг Ивану", "Про 5 000 руб помнишь?", { amount: 5000, cur: "RUB" }),
  t(25, 9, "ivan", "dm-ivan", "money", "Долг Ивану 5000 ₽", "жду 5000₽", { amount: 5000, cur: "RUB" }),
])
S("dup", "a.reminder", [
  t(
    24,
    10,
    "alice",
    "grp-team",
    "meeting",
    "Prepare slides for Monday demo",
    "can you prepare the slides for the demo on Monday?",
    { due: "mon" },
  ),
  t(25, 17, "alice", "grp-team", "meeting", "Demo slides", "how are the demo slides going? Monday is close", {
    due: "mon",
  }),
])
S("dup", "a.typo", [
  t(
    25,
    12,
    "maria",
    "dm-maria",
    "personal",
    "Купить билеты на поезд в Казань",
    "Купи нам билеты на поезд в Казань на 25-е",
  ),
  t(26, 22, "maria", "dm-maria", "personal", "Билеты на поед в Казань", "Билеты на поед купил?"),
])
S("dup", "a.forms", [
  t(26, 9, "nina", "dm-nina", "personal", "Встретить Нину в аэропорту", "Встретишь меня в аэропорту в субботу?", {
    due: "sat",
  }),
  t(27, 13, "nina", "dm-nina", "personal", "Забрать Нину из аэропорта", "Так встретишь в субботу в аэропорту?", {
    due: "sat",
  }),
])
S("dup", "a.digits", [
  t(27, 15, "bob", "dm-bob", "documents", "Send Bob the tax documents", "I need your tax documents by the 30th", {
    due: 29,
  }),
  t(28, 19, "bob", "dm-bob", "documents", "Tax docs for Bob", "tax docs?? deadline 30.09", { due: 29 }),
])
S("dup", "a.reminder", [
  t(
    29,
    11,
    "alice",
    "dm-alice",
    "delivery",
    "Return the projector to Alice",
    "could you bring back my projector this week?",
  ),
  t(31, 16, "alice", "dm-alice", "delivery", "Bring projector back", "projector pls :)"),
])
S("dup", "a.digits", [
  t(
    30,
    10,
    "carol",
    "dm-carol",
    "money",
    "Pay the venue deposit 1,500 EUR",
    "the venue deposit is 1,500 EUR, due Friday",
    { amount: 1500, cur: "EUR", due: "fri" },
  ),
  t(31, 12, "carol", "dm-carol", "money", "Venue deposit", "the 1500€ venue deposit is due by Friday", {
    amount: 1500,
    cur: "EUR",
    due: "fri",
  }),
])
S("dup", "a.synonym", [
  t(32, 14, "maria", "dm-maria", "meeting", "Подтвердить созвон в среду", "Созвон в среду в 15:00 тебе ок?", {
    due: "wed",
  }),
  t(33, 9, "maria", "dm-maria", "meeting", "Ответить Марии про время созвона", "Среда 15:00 подтверждаешь?", {
    due: "wed",
  }),
])
S("dup", "a.synonym", [
  t(
    34,
    10,
    "dmitry",
    "dm-dmitry",
    "access",
    "Сбросить Дмитрию пароль от почты",
    "Не могу войти, сбрось пароль от почты",
  ),
  t(
    35,
    11,
    "dmitry",
    "dm-dmitry",
    "access",
    "Восстановить доступ к почте Дмитрия",
    "Почта так и не открывается, пароль не подходит",
  ),
])
S("dup", "a.forms", [
  t(36, 9, "petr", "grp-house", "money", "Оплатить вывоз мусора", "За вывоз мусора по 450 руб с квартиры", {
    amount: 450,
    cur: "RUB",
  }),
  t(38, 18, "petr", "grp-house", "money", "Сдать за вывоз мусора 450", "Кто не сдал 450р за мусор — сдайте", {
    amount: 450,
    cur: "RUB",
  }),
])
S("dup", "a.lang", [
  t(
    37,
    12,
    "bob",
    "dm-bob",
    "access",
    "Give Bob access to the analytics dashboard",
    "can you give me access to the analytics dashboard?",
  ),
  t(
    39,
    10,
    "bob",
    "dm-bob",
    "access",
    "Доступ Бобу к дашборду аналитики",
    "still no access to analytics, can you check?",
  ),
])
S("dup", "a.k", [
  t(
    40,
    13,
    "olga",
    "dm-olga",
    "money",
    "Вернуть Ольге 2,5к за кружок",
    "Верни 2,5 тыс за кружок, я за тебя заплатила",
    { amount: 2500 },
  ),
  t(42, 19, "olga", "dm-olga", "money", "Вернуть Ольге за кружок 2500 руб", "Напоминаю про 2500 руб за кружок", {
    amount: 2500,
    cur: "RUB",
  }),
])
S("dup", "a.late", [
  t(
    30,
    9,
    "carol",
    "dm-carol",
    "documents",
    "Send Carol the brand guidelines",
    "can you send me the brand guidelines PDF?",
  ),
  t(
    47,
    15,
    "carol",
    "dm-carol",
    "documents",
    "Brand guidelines for Carol",
    "still need the brand guidelines, the client is asking",
  ),
])
S("dup", "a.three", [
  t(
    44,
    10,
    "maria",
    "dm-maria",
    "documents",
    "Отправить Марии счёт-фактуру",
    "Пришли счёт-фактуру за сентябрь до 10 октября",
    { due: 39 },
  ),
  t(45, 15, "maria", "dm-maria", "documents", "Счёт-фактура за сентябрь", "Счет-фактуру за сентябрь жду, до 10.10", {
    due: 39,
  }),
  t(47, 11, "maria", "dm-maria", "documents", "Прислать счёт фактуру", "Счёт фактура где?? Срок 10 октября", {
    due: 39,
  }),
])

S("dup", "a.three", [
  t(
    2,
    9,
    "alice",
    "grp-team",
    "documents",
    "Send Alice the quarterly KPI sheet",
    "can you send me the quarterly KPI sheet by Thursday?",
    { due: "thu" },
  ),
  t(3, 16, "alice", "grp-team", "documents", "KPI sheet for Alice", "KPI sheet please, need it Thursday", {
    due: "thu",
  }),
  t(4, 10, "alice", "dm-alice", "documents", "Quarterly KPIs to Alice", "still waiting for the quarterly KPIs"),
])
S("dup", "a.typo", [
  t(
    4,
    19,
    "nina",
    "dm-nina",
    "personal",
    "Записать Нину к стоматологу",
    "Запиши меня к стоматологу на следующей неделе",
  ),
  t(6, 12, "nina", "dm-nina", "personal", "Запись к стомотологу для Нины", "Ты записал меня к стомотологу?"),
])
S("dup", "a.digits", [
  t(5, 13, "petr", "dm-petr", "money", "Вернуть Петру за билеты 7 400 ₽", "Скинь 7 400 ₽ за билеты на матч", {
    amount: 7400,
    cur: "RUB",
  }),
  t(7, 18, "petr", "dm-petr", "money", "Перевести Петру 7400 за матч", "За матч 7400 р. переведёшь?", {
    amount: 7400,
    cur: "RUB",
  }),
  t(9, 10, "petr", "dm-petr", "money", "Деньги Петру за билеты", "Напоминаю про 7400 за билеты", { amount: 7400 }),
])
S("dup", "a.lang", [
  t(
    7,
    11,
    "maria",
    "dm-maria",
    "documents",
    "Отправить Марии отчёт по продажам",
    "Пришли, пожалуйста, отчёт по продажам за август",
  ),
  t(
    8,
    15,
    "maria",
    "dm-maria",
    "documents",
    "Send Maria the August sales report",
    "Отчёт по продажам за август ещё нужен",
  ),
])
S("dup", "a.synonym", [
  t(
    8,
    10,
    "bob",
    "dm-bob",
    "delivery",
    "Ship the laptop back to Bob",
    "please ship my laptop back, the courier can pick it up Friday",
    { due: "fri" },
  ),
  t(
    9,
    14,
    "bob",
    "dm-bob",
    "delivery",
    "Return Bob's laptop by courier",
    "can the courier collect the laptop on Friday?",
    { due: "fri" },
  ),
])
S("dup", "a.forms", [
  t(
    14,
    9,
    "olga",
    "grp-school",
    "personal",
    "Принести поделку на выставку",
    "Каждый приносит поделку на выставку к пятнице",
    { due: "fri" },
  ),
  t(16, 20, "olga", "grp-school", "personal", "Поделки на выставку", "Поделки для выставки приносим до пятницы", {
    due: "fri",
  }),
])
S("dup", "a.k", [
  t(
    17,
    12,
    "carol",
    "dm-carol",
    "money",
    "Pay Carol 2k for the photo shoot",
    "the photo shoot was 2k EUR, invoice attached",
    { amount: 2000, cur: "EUR" },
  ),
  t(
    20,
    9,
    "carol",
    "dm-carol",
    "money",
    "Photo shoot invoice 2,000 EUR",
    "reminder about the 2,000 EUR photo shoot invoice",
    { amount: 2000, cur: "EUR" },
  ),
])
S("dup", "a.reminder", [
  t(
    18,
    15,
    "dmitry",
    "dm-dmitry",
    "personal",
    "Посмотреть машину с Дмитрием",
    "Съездишь со мной посмотреть машину в субботу?",
    { due: "sat" },
  ),
  t(20, 11, "dmitry", "dm-dmitry", "personal", "Ответить Дмитрию про субботу", "Так что, в субботу едем?", {
    due: "sat",
  }),
])
S("dup", "a.three", [
  t(
    21,
    10,
    "petr",
    "grp-house",
    "access",
    "Сделать Петру дубликат ключа от чердака",
    "Нужен дубликат ключа от чердака, у тебя есть оригинал",
  ),
  t(22, 14, "petr", "dm-petr", "access", "Дубликат ключа от чердака", "Дубликат ключа от чердака сделаешь?"),
  t(24, 9, "petr", "dm-petr", "access", "Ключ от чердака Петру", "Ключ от чердака нужен до выходных"),
])
S("dup", "a.digits", [
  t(
    23,
    9,
    "ivan",
    "dm-ivan",
    "money",
    "Оплатить Ивану ремонт машины 32 500 руб",
    "Ремонт машины вышел 32 500 руб, оплатишь половину?",
    { amount: 32500, cur: "RUB" },
  ),
  t(26, 18, "ivan", "dm-ivan", "money", "Ремонт машины Ивана", "Про ремонт машины 32500 не забудь", { amount: 32500 }),
])
S("dup", "a.typo", [
  t(
    28,
    14,
    "bob",
    "grp-team",
    "documents",
    "Sign the partnership agreement",
    "the partnership agreement is ready to sign",
  ),
  t(29, 11, "bob", "grp-team", "documents", "Sign partnership agreemnet", "partnership agreemnet signed yet?"),
])
S("dup", "a.lang", [
  t(29, 9, "alice", "dm-alice", "meeting", "Встреча с Алисой по бюджету", "Can we meet tomorrow about the budget?", {
    due: "tomorrow",
  }),
  t(29, 18, "alice", "dm-alice", "meeting", "Meet Alice about the budget", "so are we meeting tomorrow re budget?", {
    due: "tomorrow",
  }),
])
S("dup", "a.three", [
  t(
    33,
    10,
    "olga",
    "grp-school",
    "money",
    "Сдать на подарок к дню учителя",
    "Собираем на подарок ко дню учителя по 700 руб до 3 октября",
    { amount: 700, cur: "RUB", due: 32 },
  ),
  t(34, 19, "olga", "grp-school", "money", "Подарок учителю — сдать 700", "Кто ещё не сдал 700 р на день учителя?", {
    amount: 700,
    cur: "RUB",
  }),
  t(
    35,
    8,
    "olga",
    "dm-olga",
    "money",
    "Сдать Ольге на подарок учителю",
    "Вы за день учителя 700 руб не сдали, до 3.10",
    { amount: 700, cur: "RUB", due: 32 },
  ),
])
S("dup", "a.synonym", [
  t(37, 11, "maria", "dm-maria", "meeting", "Перенести встречу с Марией", "Давай перенесём встречу на четверг?", {
    due: "thu",
  }),
  t(38, 9, "maria", "dm-maria", "meeting", "Ответить Марии про перенос", "Так переносим на четверг или нет?", {
    due: "thu",
  }),
])
S("dup", "a.reminder", [
  t(
    39,
    15,
    "carol",
    "dm-carol",
    "documents",
    "Give feedback on Carol's mockups",
    "here are the new mockups, feedback welcome",
  ),
  t(41, 10, "carol", "dm-carol", "documents", "Mockup feedback for Carol", "any feedback on the mockups?"),
])
S("dup", "a.forms", [
  t(42, 12, "nina", "grp-family", "delivery", "Отвезти бабушке лекарства", "Кто отвезёт бабушке лекарства в среду?", {
    due: "wed",
  }),
  t(42, 20, "nina", "dm-nina", "delivery", "Лекарства бабушке", "Отвезёшь лекарства бабушке в среду?", { due: "wed" }),
])
S("dup", "a.k", [
  t(
    44,
    14,
    "bob",
    "dm-bob",
    "money",
    "Pay Bob back 1.2k for the flights",
    "flights came to 1.2k USD, can you send your half?",
    { amount: 1200, cur: "USD" },
  ),
  t(46, 10, "bob", "dm-bob", "money", "Flights money for Bob", "1200 usd for the flights when you can", {
    amount: 1200,
    cur: "USD",
  }),
])
S("dup", "a.late", [
  t(
    25,
    10,
    "petr",
    "dm-petr",
    "other",
    "Помочь Петру настроить роутер",
    "Поможешь настроить роутер? Интернет пропадает",
  ),
  t(44, 16, "petr", "dm-petr", "other", "Роутер Петра", "Роутер так и не настроили, интернет опять пропадает"),
])
S("dup", "a.three", [
  t(
    46,
    9,
    "dmitry",
    "dm-dmitry",
    "documents",
    "Отправить Дмитрию доверенность",
    "Пришли доверенность на машину до понедельника",
    { due: "mon" },
  ),
  t(47, 13, "dmitry", "dm-dmitry", "documents", "Доверенность для Дмитрия", "Доверенность сделал?"),
  t(48, 18, "dmitry", "dm-dmitry", "documents", "Доверенность на машину", "Нотариус ждёт доверенность в понедельник", {
    due: "mon",
  }),
])
S("dup", "a.typo", [
  t(49, 10, "ivan", "grp-house", "other", "Починить протечку в подвале", "В подвале протечка, надо вызвать сантехника"),
  t(50, 9, "ivan", "grp-house", "other", "Протечка в подвале", "Протчека в подвале всё ещё, сантехника вызвали?"),
])

// (b) look alike, and is not one task
S("lookalike", "b.amount", [
  t(6, 14, "petr", "dm-petr", "money", "Вернуть Петру за билеты в кино", "За кино 1 400 ₽ скинь", {
    amount: 1400,
    cur: "RUB",
  }),
])
S("lookalike", "b.person", [
  t(30, 11, "nina", "dm-nina", "personal", "Записать Нину к окулисту", "Запиши меня к окулисту"),
  t(
    31,
    14,
    "olga",
    "dm-olga",
    "personal",
    "Записать Ольгу к стоматологу",
    "Запиши меня к стоматологу, ты же знаешь врача",
  ),
])
S("lookalike", "b.job", [
  t(47, 10, "bob", "dm-bob", "money", "Pay Bob back for the hotel", "hotel was 1.2k USD too, your half please", {
    amount: 1200,
    cur: "USD",
  }),
])
S("lookalike", "b.date", [
  t(50, 12, "olga", "grp-school", "money", "Сдать на питание", "Питание на ноябрь 3 200 руб до 30.10", {
    amount: 3200,
    cur: "RUB",
    due: 59,
  }),
])
S("lookalike", "b.title", [
  t(8, 12, "ivan", "dm-ivan", "money", "Оплатить счёт", "Оплати счёт за интернет, 900 руб", {
    amount: 900,
    cur: "RUB",
  }),
  t(12, 13, "ivan", "dm-ivan", "money", "Оплатить счёт", "Оплати счёт за воду, 1 250 руб", {
    amount: 1250,
    cur: "RUB",
  }),
])
S("lookalike", "b.title", [
  t(15, 18, "maria", "dm-maria", "money", "Перевести Марии за продукты", "Переведи 2 300 за продукты", {
    amount: 2300,
    closed: 16,
  }),
  t(24, 19, "maria", "dm-maria", "money", "Перевести Марии за продукты", "За продукты на этой неделе 1 800 ₽", {
    amount: 1800,
    cur: "RUB",
  }),
])
S("lookalike", "b.job", [
  t(18, 11, "petr", "dm-petr", "access", "Дать доступ Петру к CI", "Дай доступ к CI, не могу запустить сборку"),
  t(19, 15, "petr", "dm-petr", "other", "Посмотреть пулреквест Петра", "Глянь мой пулреквест, пожалуйста"),
  t(23, 12, "petr", "dm-petr", "access", "Дать доступ Петру к Figma", "Дай доступ к фигме, макеты не открываются"),
])
S("lookalike", "b.job", [
  t(
    16,
    9,
    "alice",
    "dm-alice",
    "documents",
    "Send Alice the September invoice",
    "please send me the September invoice",
  ),
  t(
    17,
    14,
    "alice",
    "dm-alice",
    "meeting",
    "Book a meeting room for Alice",
    "please book a meeting room for Thursday",
    { due: "thu" },
  ),
])
S("lookalike", "b.date", [
  t(1, 10, "dmitry", "dm-dmitry", "money", "Оплатить аренду за сентябрь", "Аренда за сентябрь 45 000 ₽ до 5-го", {
    amount: 45000,
    cur: "RUB",
    due: 4,
    closed: 3,
  }),
  t(31, 10, "dmitry", "dm-dmitry", "money", "Оплатить аренду за октябрь", "Аренда за октябрь 45 000 ₽ до 5-го", {
    amount: 45000,
    cur: "RUB",
    due: 34,
  }),
])
S("lookalike", "b.date", [
  t(
    40,
    20,
    "olga",
    "grp-school",
    "money",
    "Сдать деньги на экскурсию в театр",
    "Родители, сдаём по 2 500 руб на театр до 20.10",
    { amount: 2500, cur: "RUB", due: 49 },
  ),
  t(
    41,
    9,
    "olga",
    "grp-school",
    "money",
    "Сдать деньги на экскурсию в зоопарк",
    "И ещё по 2 500 руб на зоопарк до 30.10, это другая поездка",
    { amount: 2500, cur: "RUB", due: 59 },
  ),
])
S("lookalike", "b.amount", [
  t(10, 20, "bob", "dm-bob", "money", "Pay Bob for groceries", "groceries were 45 EUR", {
    amount: 45,
    cur: "EUR",
    closed: 11,
  }),
  t(18, 20, "bob", "dm-bob", "money", "Pay Bob for groceries", "groceries this week 62 EUR", {
    amount: 62,
    cur: "EUR",
  }),
])
S("lookalike", "b.job", [
  t(
    26,
    11,
    "alice",
    "grp-team",
    "other",
    "Fix the login bug on staging",
    "the login page on staging throws 500, can you fix it?",
  ),
  t(
    27,
    10,
    "alice",
    "grp-team",
    "other",
    "Fix the signup bug on staging",
    "signup on staging is broken too, different error",
  ),
])
S("lookalike", "b.person", [
  t(20, 9, "petr", "grp-house", "documents", "Сдать показания счётчиков", "Сдайте показания счётчиков до 25 числа", {
    due: 24,
  }),
  t(
    21,
    18,
    "ivan",
    "dm-ivan",
    "documents",
    "Передать показания счётчиков мамы",
    "Передай показания счётчиков мамы, пожалуйста",
  ),
])
S("lookalike", "b.person", [
  t(5, 16, "bob", "dm-bob", "documents", "Send signed NDA to Bob", "Bob here, please send the signed NDA by Friday", {
    due: "fri",
  }),
  t(
    6,
    18,
    "carol",
    "dm-carol",
    "documents",
    "Send signed NDA to Carol",
    "Carol here, please send the signed NDA by Friday",
    { due: "fri" },
  ),
])
S("lookalike", "b.amount", [
  t(43, 12, "nina", "grp-family", "money", "Скинуться на подарок папе", "Скидываемся на подарок папе по 3000"),
  t(45, 20, "nina", "grp-family", "money", "Скинуться на подарок маме", "А на подарок маме по 3000 к ноябрю"),
])
S("lookalike", "b.date", [
  t(7, 10, "carol", "dm-carol", "meeting", "Weekly sync with Carol", "weekly sync on Thursday?", {
    due: "thu",
    closed: 9,
  }),
  t(14, 10, "carol", "dm-carol", "meeting", "Weekly sync with Carol", "weekly sync on Thursday again?", {
    due: "thu",
    closed: 16,
  }),
  t(21, 10, "carol", "dm-carol", "meeting", "Weekly sync with Carol", "same time Thursday?", { due: "thu" }),
])
S("lookalike", "b.job", [
  t(28, 10, "maria", "dm-maria", "documents", "Отправить Марии договор аренды", "Пришли договор аренды офиса"),
  t(29, 12, "maria", "dm-maria", "documents", "Отправить Марии акт сверки", "Пришли акт сверки за квартал"),
])
S("lookalike", "b.amount", [
  t(33, 18, "dmitry", "dm-dmitry", "money", "Вернуть Дмитрию 3000 за бензин", "Верни 3000 за бензин, ездили на дачу", {
    amount: 3000,
  }),
  t(46, 12, "dmitry", "dm-dmitry", "money", "Вернуть Дмитрию 1500 за бензин", "За бензин в эти выходные 1500 ₽", {
    amount: 1500,
    cur: "RUB",
  }),
])
S("lookalike", "b.job", [
  t(35, 14, "dmitry", "dm-dmitry", "delivery", "Забрать посылку с Озона", "Озон пришёл, забери в пункте у дома"),
  t(
    36,
    14,
    "dmitry",
    "dm-dmitry",
    "delivery",
    "Отправить посылку Дмитрию",
    "Отправь мне посылкой зарядку, забыл у тебя",
  ),
])
S("lookalike", "b.job", [
  t(19, 10, "ivan", "dm-ivan", "money", "Оплатить штраф ГИБДД", "Пришёл штраф 500 руб, оплати со скидкой до 20.09", {
    amount: 500,
    cur: "RUB",
    due: 19,
  }),
  t(24, 15, "ivan", "dm-ivan", "money", "Оплатить налог на имущество", "Налог на имущество 2 100 руб до 1 декабря", {
    amount: 2100,
    cur: "RUB",
    due: 91,
  }),
])
S("lookalike", "b.job", [
  t(32, 10, "bob", "dm-bob", "other", "Review Bob's draft blog post", "can you review my draft blog post?"),
  t(34, 16, "bob", "dm-bob", "other", "Review Bob's pull request", "can you review my pull request?"),
])
S("lookalike", "b.job", [
  t(
    36,
    10,
    "alice",
    "dm-alice",
    "meeting",
    "Call Alice about the job offer",
    "call me about the job offer when you can",
  ),
  t(38, 11, "alice", "dm-alice", "meeting", "Call Alice about the trip", "call me about the trip, need to book hotels"),
])
S("lookalike", "b.job", [
  t(39, 9, "nina", "dm-nina", "personal", "Купить Нине лекарства", "Купи мне лекарства от давления"),
  t(41, 18, "nina", "dm-nina", "personal", "Купить Нине продукты", "Купи мне продукты на неделю"),
])
S("lookalike", "b.amount", [
  t(42, 9, "olga", "grp-school", "money", "Сдать 500 руб на шторы в класс", "Сдаём по 500 руб на шторы в класс", {
    amount: 500,
    cur: "RUB",
  }),
  t(44, 9, "olga", "grp-school", "money", "Сдать 500 руб на подарок учителю", "Ещё по 500 руб на подарок учителю", {
    amount: 500,
    cur: "RUB",
  }),
])
S("lookalike", "b.amount", [
  t(
    48,
    11,
    "carol",
    "dm-carol",
    "money",
    "Pay Carol's design invoice",
    "new invoice for the October design work, 400 EUR",
    { amount: 400, cur: "EUR" },
  ),
])
S("lookalike", "b.person", [
  t(
    37,
    15,
    "anon",
    "grp-house",
    "other",
    "Убрать велосипед из коридора",
    "Чей велосипед в коридоре на 3 этаже? Уберите, пожалуйста",
  ),
  t(43, 15, "anon", "grp-house", "other", "Убрать коляску из коридора", "Чья коляска в коридоре на 5 этаже? Уберите"),
])

// (c) the same request in a group and in a private chat
S("cross", "c.cross", [
  t(
    11,
    10,
    "petr",
    "grp-house",
    "access",
    "Открыть подвал для электрика",
    "Нужен ключ от подвала для электрика в четверг",
    { due: "thu" },
  ),
  t(
    11,
    12,
    "petr",
    "dm-petr",
    "access",
    "Ключ от подвала для электрика",
    "Продублирую: ключ от подвала электрику в четверг",
    { due: "thu" },
  ),
])
S("cross", "c.cross", [
  t(13, 9, "alice", "grp-team", "documents", "Review the Q3 report", "please review the Q3 report by Wednesday", {
    due: "wed",
  }),
  t(
    13,
    15,
    "alice",
    "dm-alice",
    "documents",
    "Q3 report review",
    "hey, just making sure you saw the Q3 report request",
  ),
])
S("cross", "c.cross", [
  t(
    23,
    18,
    "olga",
    "grp-school",
    "documents",
    "Подписать согласие на поездку",
    "Нужно подписать согласие на поездку до понедельника",
    { due: "mon" },
  ),
  t(24, 10, "olga", "dm-olga", "documents", "Согласие на поездку", "Ваше согласие на поездку жду до понедельника", {
    due: "mon",
  }),
])
S("cross", "c.cross", [
  t(
    26,
    14,
    "bob",
    "grp-team",
    "other",
    "Approve Bob's vacation",
    "can someone approve my vacation request for October?",
  ),
  t(27, 9, "bob", "dm-bob", "other", "Vacation approval for Bob", "could you approve my vacation in the HR tool?"),
])
S("cross", "c.cross", [
  t(
    30,
    19,
    "nina",
    "grp-family",
    "personal",
    "Забронировать столик на день рождения",
    "Кто забронирует столик в ресторане на субботу?",
    { due: "sat" },
  ),
  t(31, 9, "nina", "dm-nina", "personal", "Бронь ресторана на субботу", "Ты же забронируешь ресторан на субботу?", {
    due: "sat",
  }),
])
S("cross", "c.cross", [
  t(
    35,
    9,
    "ivan",
    "grp-house",
    "delivery",
    "Передать Ивану ключи от квартиры",
    "Кто-нибудь может передать мне ключи от квартиры 12?",
  ),
  t(35, 11, "ivan", "dm-ivan", "delivery", "Ключи от квартиры для Ивана", "Ключи от 12-й у тебя? Передай, пожалуйста"),
])

// (d) reply chains
S("reply", "d.reply", [
  t(32, 10, "ivan", "dm-ivan", "money", "Оплатить счёт за газ", "Оплати газ, 1 100 руб", { amount: 1100, cur: "RUB" }),
  t(34, 12, "ivan", "dm-ivan", "money", "Напоминание про газ", "Ну что с газом?", { reply: 0 }),
])
S("reply", "d.reply", [
  t(
    38,
    10,
    "maria",
    "dm-maria",
    "documents",
    "Отправить Марии презентацию",
    "Пришли презентацию для клиента до четверга",
    { due: "thu" },
  ),
  t(39, 12, "maria", "dm-maria", "documents", "Презентация для клиента", "Получилось?", { reply: 0 }),
  t(40, 9, "maria", "dm-maria", "documents", "Презентация Марии", "Сегодня край", { reply: 1, due: 40 }),
])
S("reply", "d.newtask", [
  t(40, 15, "alice", "dm-alice", "documents", "Send Alice the updated contract", "can you send the updated contract?", {
    g: "x",
  }),
  t(
    40,
    17,
    "alice",
    "dm-alice",
    "meeting",
    "Book a table for Friday",
    "thanks! also, can you book a table for Friday?",
    { reply: 0, due: "fri", g: "y" },
  ),
])
S("reply", "d.newtask", [
  t(
    41,
    10,
    "petr",
    "grp-house",
    "other",
    "Заменить замок на двери подвала",
    "Замок на подвале сломан, нужно заменить",
    { g: "x" },
  ),
  t(
    41,
    12,
    "petr",
    "grp-house",
    "other",
    "Поменять лампочку на 3 этаже",
    "Да, и ещё — надо поменять лампочку на 3 этаже",
    { reply: 0, g: "y" },
  ),
])
S("reply", "d.reply", [
  t(43, 13, "bob", "grp-team", "money", "Pay for the team lunch", "can you pay for the team lunch? 85 EUR", {
    amount: 85,
    cur: "EUR",
  }),
  t(44, 10, "bob", "grp-team", "money", "Team lunch payment", "did the lunch payment go through?", { reply: 0 }),
])
S("reply", "d.otherperson", [
  t(
    45,
    9,
    "alice",
    "grp-team",
    "access",
    "Give Alice access to staging",
    "can you give me access to the staging server?",
    { g: "x" },
  ),
  t(45, 10, "carol", "grp-team", "access", "Give Carol access to staging", "+1, I need staging access too", {
    reply: 0,
    g: "y",
  }),
])
S("reply", "d.reply", [
  t(46, 18, "olga", "grp-school", "documents", "Сдать фото для пропуска", "Нужно фото ребёнка для пропуска"),
  t(47, 8, "olga", "grp-school", "documents", "Фото на пропуск", "Фото на пропуск до среды!", { reply: 0, due: "wed" }),
])
S("reply", "d.newtask", [
  t(48, 10, "nina", "dm-nina", "personal", "Купить Нине витамины", "Купи мне витамины в аптеке", { g: "x" }),
  t(48, 11, "nina", "dm-nina", "personal", "Купить Нине хлеб", "И хлеба купи", { reply: 0, g: "y" }),
])
S("reply", "d.closed", [
  t(20, 10, "carol", "dm-carol", "access", "Reset Carol's VPN password", "my VPN password expired, can you reset it?", {
    closed: 21,
    g: "x",
  }),
  t(26, 14, "carol", "dm-carol", "access", "VPN still broken for Carol", "VPN is broken again after the reset", {
    reply: 0,
    g: "y",
  }),
])

// busy chats: many legitimate tasks, sharing words, people and categories
const busy = [
  [
    1,
    "alice",
    "grp-team",
    "meeting",
    "Plan the sprint kickoff",
    "can we plan the sprint kickoff for Monday?",
    { due: "mon" },
  ],
  [2, "bob", "grp-team", "other", "Update the onboarding doc", "the onboarding doc is outdated, please update it"],
  [3, "carol", "grp-team", "documents", "Send Carol the logo files", "send me the logo files in SVG please"],
  [3, "anon", "grp-team", "other", "Check the failing nightly build", "nightly build is red again"],
  [4, "alice", "grp-team", "access", "Give Alice access to the billing repo", "need access to the billing repo"],
  [
    5,
    "bob",
    "grp-team",
    "money",
    "Approve Bob's travel expenses",
    "please approve my travel expenses, 340 EUR",
    { amount: 340, cur: "EUR" },
  ],
  [
    6,
    "carol",
    "grp-team",
    "meeting",
    "Schedule design review",
    "let's schedule the design review for Wednesday",
    { due: "wed" },
  ],
  [8, "alice", "grp-team", "documents", "Review the API spec", "please review the API spec draft"],
  [
    9,
    "bob",
    "grp-team",
    "other",
    "Rotate the staging certificates",
    "staging certificates expire on 20.09",
    { due: 19 },
  ],
  [11, "carol", "grp-team", "documents", "Approve the homepage copy", "homepage copy is ready for approval"],
  [
    14,
    "alice",
    "grp-team",
    "meeting",
    "Book a room for the retro",
    "can you book a room for the retro on Friday?",
    { due: "fri" },
  ],
  [
    16,
    "bob",
    "grp-team",
    "money",
    "Pay the hosting invoice",
    "hosting invoice is 89 USD, due on the 25th",
    { amount: 89, cur: "USD", due: 24 },
  ],
  [19, "anon", "grp-team", "access", "Add new contractor to Slack", "please add the new contractor to Slack"],
  [21, "carol", "grp-team", "documents", "Share the brand deck", "share the brand deck with the agency"],
  [23, "alice", "grp-team", "other", "Write release notes", "release notes for 2.4 please"],
  [
    29,
    "bob",
    "grp-team",
    "money",
    "Renew the domain",
    "the domain renewal is 15 USD, expires on 5 October",
    { amount: 15, cur: "USD", due: 34 },
  ],
  [
    33,
    "carol",
    "grp-team",
    "meeting",
    "Prepare agenda for client call",
    "prepare the agenda for Tuesday's client call",
    { due: "tue" },
  ],
  [37, "alice", "grp-team", "other", "Fix the flaky payment test", "the payment test is flaky again"],
  [
    42,
    "bob",
    "grp-team",
    "documents",
    "Review Bob's onboarding checklist",
    "I wrote an onboarding checklist, can you review?",
  ],
  [
    46,
    "anon",
    "grp-team",
    "access",
    "Revoke access for the old contractor",
    "the old contractor still has access to the repo",
  ],
  [2, "petr", "grp-house", "other", "Починить домофон", "Домофон не работает с утра"],
  [4, "anon", "grp-house", "other", "Убрать мусор у подъезда", "У подъезда опять мешки с мусором"],
  [
    6,
    "petr",
    "grp-house",
    "meeting",
    "Прийти на собрание жильцов",
    "Собрание жильцов в субботу в 12:00",
    { due: "sat" },
  ],
  [9, "ivan", "grp-house", "other", "Закрыть окно на лестнице", "На 4 этаже открыто окно, холодно"],
  [
    15,
    "petr",
    "grp-house",
    "money",
    "Сдать на домофон",
    "Сдаём на новый домофон по 1 200 руб",
    { amount: 1200, cur: "RUB" },
  ],
  [18, "anon", "grp-house", "delivery", "Забрать чужую посылку у консьержа", "У консьержа лежит посылка для кв. 7"],
  [
    24,
    "petr",
    "grp-house",
    "documents",
    "Подписать протокол собрания",
    "Протокол собрания нужно подписать до пятницы",
    { due: "fri" },
  ],
  [28, "ivan", "grp-house", "other", "Проверить счётчик воды", "Кажется, течёт счётчик воды в стояке"],
  [
    34,
    "petr",
    "grp-house",
    "money",
    "Оплатить уборку подъезда",
    "За уборку подъезда в октябре по 300 ₽",
    { amount: 300, cur: "RUB" },
  ],
  [
    44,
    "anon",
    "grp-house",
    "other",
    "Отключить воду на время ремонта",
    "Завтра отключат воду с 10 до 14",
    { due: "tomorrow" },
  ],
  [
    3,
    "olga",
    "grp-school",
    "documents",
    "Заполнить анкету для школы",
    "Заполните анкету до пятницы, ссылка в закрепе",
    { due: "fri" },
  ],
  [
    5,
    "olga",
    "grp-school",
    "personal",
    "Купить форму для физкультуры",
    "Нужна форма для физкультуры к понедельнику",
    { due: "mon" },
  ],
  [
    12,
    "anon",
    "grp-school",
    "meeting",
    "Прийти на родительское собрание",
    "Родительское собрание в четверг в 18:00",
    { due: "thu" },
  ],
  [
    17,
    "olga",
    "grp-school",
    "documents",
    "Принести справку от врача",
    "Справку от врача принести до 25.09",
    { due: 24 },
  ],
  [
    21,
    "olga",
    "grp-school",
    "money",
    "Сдать на питание",
    "Питание на октябрь 3 200 руб до 30.09",
    { amount: 3200, cur: "RUB", due: 29 },
  ],
  [
    27,
    "anon",
    "grp-school",
    "personal",
    "Подготовить поделку на конкурс",
    "Поделка на осенний конкурс до 5 октября",
    { due: 34 },
  ],
  [33, "olga", "grp-school", "documents", "Подписать дневник", "Подпишите дневники"],
  [
    39,
    "olga",
    "grp-school",
    "meeting",
    "Записаться на консультацию к учителю",
    "Запись на консультации в среду",
    { due: "wed" },
  ],
  [
    5,
    "nina",
    "grp-family",
    "personal",
    "Забрать бабушку с дачи",
    "Кто заберёт бабушку с дачи в воскресенье?",
    { due: "sun" },
  ],
  [10, "nina", "grp-family", "delivery", "Отвезти коробки на дачу", "Отвези коробки на дачу на выходных"],
  [18, "nina", "grp-family", "personal", "Поздравить тётю", "У тёти завтра юбилей, поздравь", { due: "tomorrow" }],
  [
    25,
    "nina",
    "grp-family",
    "money",
    "Оплатить коммуналку маме",
    "Оплати маме коммуналку, 6 800 руб",
    { amount: 6800, cur: "RUB" },
  ],
  [36, "nina", "grp-family", "personal", "Записать папу к врачу", "Запиши папу к кардиологу"],
  [
    47,
    "nina",
    "grp-family",
    "delivery",
    "Привезти продукты бабушке",
    "Привези бабушке продукты в субботу",
    { due: "sat" },
  ],
  [3, "ivan", "dm-ivan", "meeting", "Встретиться с Иваном на кофе", "Давай на кофе в четверг?", { due: "thu" }],
  [6, "maria", "dm-maria", "documents", "Отправить Марии КП", "Пришли коммерческое предложение для клиента"],
  [
    9,
    "dmitry",
    "dm-dmitry",
    "personal",
    "Помочь Дмитрию с переездом",
    "Поможешь с переездом в субботу?",
    { due: "sat" },
  ],
  [11, "olga", "dm-olga", "personal", "Забрать детей из школы", "Заберёшь детей сегодня? Я задерживаюсь", { due: 11 }],
  [17, "alice", "dm-alice", "meeting", "Lunch with Alice", "lunch on Wednesday?", { due: "wed" }],
  [22, "carol", "dm-carol", "documents", "Send Carol the photos", "send me the photos from the workshop"],
  [
    26,
    "petr",
    "dm-petr",
    "other",
    "Посоветовать Петру ноутбук",
    "Посоветуй ноутбук для работы до 100 000 ₽",
    { amount: 100000, cur: "RUB" },
  ],
  [31, "bob", "dm-bob", "personal", "Recommend a dentist to Bob", "do you know a good dentist?"],
  [
    37,
    "maria",
    "dm-maria",
    "money",
    "Оплатить Марии такси",
    "Оплати такси до офиса, 650 руб",
    { amount: 650, cur: "RUB" },
  ],
  [41, "ivan", "dm-ivan", "documents", "Отправить Ивану фото документов", "Скинь фото документов на машину"],
  [43, "alice", "dm-alice", "access", "Share the Wi-Fi password with Alice", "what's the office Wi-Fi password?"],
  [45, "dmitry", "dm-dmitry", "delivery", "Забрать у Дмитрия дрель", "Забери дрель, когда будешь рядом"],
  [
    48,
    "carol",
    "dm-carol",
    "meeting",
    "Plan the workshop with Carol",
    "let's plan the next workshop, maybe next Tuesday",
    { due: "tue" },
  ],
  [49, "olga", "dm-olga", "money", "Перевести Ольге за кино", "За билеты в кино 900 руб", { amount: 900, cur: "RUB" }],
]
for (const [day, who, chat, category, title, text, extra = {}] of busy) {
  const hour = 8 + Math.floor(random() * 13)
  const closed = random() < 0.7 ? day + 1 + Math.floor(random() * 10) : undefined
  S("busy", "c.busy", [t(day, hour, who, chat, category, title, text, { closed, ...extra })], { dup: false })
}

const tasks = []
let messageNumber = 0
scenarios.forEach((scenario, s) => {
  const scenarioId = `s${String(s + 1).padStart(3, "0")}`
  const messages = []
  scenario.tasks.forEach((task, i) => {
    messageNumber++
    const message = `msg:${task.chat}:${1000 + messageNumber}`
    messages.push(message)
    const label = task.g !== undefined ? `-${task.g}` : scenario.dup ? "" : `-${i}`
    tasks.push({
      id: "",
      title: task.title,
      description: task.text,
      person: people[task.who] ? `person:${task.who}` : null,
      person_name: people[task.who],
      chat: `chat:${task.chat}`,
      chat_type: groups.has(task.chat) ? "group" : "private",
      category: task.category,
      amount: task.amount ?? null,
      currency: task.amount === undefined ? null : (task.cur ?? null),
      due: resolveDue(task.due, task.day),
      created_at: iso(task.day, task.hour, (messageNumber * 7) % 60),
      closed_at: task.closed === undefined ? null : iso(task.closed, 20),
      source_message: message,
      reply_to: task.reply === undefined ? null : messages[task.reply],
      group: `${scenarioId}${label}`,
      scenario: scenarioId,
      kind: scenario.kind,
      subtype: scenario.subtype,
    })
  })
})
tasks.sort((a, b) => a.created_at.localeCompare(b.created_at))
tasks.forEach((task, i) => {
  task.id = `t${String(i + 1).padStart(3, "0")}`
})
for (const task of tasks) process.stdout.write(`${JSON.stringify(task)}\n`)
