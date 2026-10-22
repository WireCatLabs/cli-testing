// Invented meetings and labelled queries. Every name, number and line here is made up.

const RU_PEOPLE = ["Алиса Пример", "Боб Пример", "Вера Образец", "Глеб Тестов"]
const EN_PEOPLE = ["Alice Example", "Bob Sample", "Carol Demo", "Dan Placeholder"]

const BACKGROUND = {
  pricing: [
    "Посмотрел конкурентов, у них цены примерно такие же.",
    "Клиенты пишут, что тариф слишком сложный, надо упростить страницу.",
    "Скидки на годовую оплату пока не трогаем.",
    "Давайте отдельно посчитаем выручку за {month}.",
    "Если поднимем цену, часть клиентов уйдёт, это нормально.",
    "Пробный период оставляем {n} дней.",
    "Нужна табличка, сколько платят старые клиенты.",
    "Страница с ценами всё ещё показывает старые цифры.",
  ],
  hiring: [
    "На вакансию пришло {n} откликов, половина не по профилю.",
    "Тестовое задание надо сделать короче, люди бросают.",
    "Рекрутер просит описание роли до {day}.",
    "Давайте вторым интервьюером будет Глеб.",
    "Зарплатную вилку пока не публикуем.",
    "Кандидаты спрашивают про удалёнку, отвечаем что можно.",
    "Собеседование на позицию дизайнера переносим.",
    "Онбординг новичков надо описать в одном документе.",
  ],
  travel: [
    "Командировку согласовали, осталось оформить документы.",
    "Гостиницу лучше брать рядом с офисом клиента.",
    "Отчёт о расходах сдаём в течение недели после поездки.",
    "Такси из аэропорта компенсируем по чекам.",
    "В {month} поездок больше не планируем.",
    "Визу продлевать не нужно, хватает до конца года.",
    "Билеты покупаем только через корпоративный аккаунт.",
  ],
  release: [
    "На стейджинге ещё {n} открытых багов.",
    "Тесты на оплату опять падают, надо посмотреть логи.",
    "Чейнджлог допишу к {day}.",
    "Фичу с экспортом в эту версию не берём.",
    "Регрессию прогоним завтра утром.",
    "Мониторинг после релиза смотрит дежурный.",
    "Сборка для тестировщиков готова.",
  ],
  lease: [
    "В офисе опять не работает кондиционер, надо писать управляющей компании.",
    "Договор аренды заканчивается в {month}.",
    "Коммунальные платежи выросли на {n} процентов.",
    "Можно поискать офис поменьше, нас всё равно половина на удалёнке.",
    "Уборку оплачиваем отдельно от аренды.",
    "Ключи от переговорки у администратора.",
    "Счёт за аренду пришёл с опозданием.",
  ],
  mortgage: [
    "Банк попросил ещё справку о доходах.",
    "Ставки в этом месяце опять поменялись.",
    "Оценщик приедет в {day}.",
    "Страховку жизни банк требует обязательно.",
    "Сравнил три банка, условия почти одинаковые.",
    "Нотариус свободен только на следующей неделе.",
    "Платёж по кредиту получается около {n} в месяц.",
  ],
  realtor: [
    "Посмотрели ещё одну квартиру, там шумно от дороги.",
    "Хозяин просит показать документы до просмотра.",
    "На сайте объявлений цены выросли с весны.",
    "Нужно три спальни и чтобы школа рядом.",
    "Просмотр назначили на {day} вечером.",
    "В старом доме нет лифта, это минус.",
    "Агентство прислало новую подборку вариантов.",
  ],
  marketing: [
    "Кампания в поиске дала {n} заявок за неделю.",
    "Креативы для баннеров надо обновить.",
    "Отчёт по рекламе пришлю в {day}.",
    "Блогеры просят предоплату, это рискованно.",
    "Рассылка открывается хуже, чем в прошлом квартале.",
    "Посадочную страницу переделаем к весне.",
    "Стоимость заявки выросла, надо разбираться.",
  ],
}

const BACKGROUND_EN = {
  pricing: [
    "Competitors are priced about the same as us.",
    "Customers say the pricing page is confusing.",
    "Let's leave the annual discount alone for now.",
    "Trial stays at {n} days.",
    "Can someone pull revenue numbers for {month}?",
    "Some customers will churn if we raise prices, that's expected.",
  ],
  hiring: [
    "We got {n} applications, half of them off-profile.",
    "The take-home task is too long, people drop out.",
    "The recruiter needs the role description by {day}.",
    "Let's not publish the salary range yet.",
    "Candidates keep asking about remote work.",
    "Onboarding needs one document, not five.",
  ],
  travel: [
    "Expense reports are due a week after the trip.",
    "Book hotels close to the client office.",
    "Airport taxis are reimbursed with receipts.",
    "No more trips planned for {month}.",
    "Use the company account for flights.",
  ],
  release: [
    "Staging still has {n} open bugs.",
    "Payment tests are failing again, check the logs.",
    "I'll finish the changelog by {day}.",
    "The export feature is not in this version.",
    "On-call watches monitoring after the deploy.",
    "QA build is ready.",
  ],
}

const FILLER_RU = [
  "Меня слышно?",
  "Да, слышно, продолжай.",
  "Подожди, у меня связь пропадает.",
  "Давайте я расшарю экран.",
  "Окей, давайте дальше.",
  "Угу.",
  "Запишу это в заметки.",
  "Вернёмся к этому на следующей неделе.",
  "Кто сегодня ведёт протокол?",
  "Секунду, мне звонят.",
  "Да, согласна.",
  "Хорошо, договорились.",
  "Я потом скину ссылку в чат.",
  "Там ещё был вопрос от {name}, но его нет сегодня.",
  "Ладно, это не срочно.",
  "У кого-то эхо, выключите микрофон.",
  "Давайте закругляться, у меня следующая встреча.",
]
const FILLER_EN = [
  "Can you hear me?",
  "Yes, go ahead.",
  "Sorry, my connection dropped.",
  "Let me share my screen.",
  "Okay, moving on.",
  "Right.",
  "I'll put that in the notes.",
  "Let's come back to this next week.",
  "Who is taking notes today?",
  "Someone has an echo, please mute.",
  "Let's wrap up, I have another call.",
]

// Speech recognition errors of the kind seen in Russian transcripts: one or two letters off.
const GARBLE = [
  ["релиз", "релис"],
  ["собеседован", "сабеседован"],
  ["ипотек", "ипатек"],
  ["командировк", "камандировк"],
  ["арендодател", "арендадател"],
  ["риелтор", "реелтор"],
  ["договор", "дагавор"],
  ["бюджет", "бюджэт"],
  ["квартир", "кватир"],
]

// One planted fact per entry. `garbled` marks a fact line whose key word recognition got wrong; the queries spell it
// right. `detected: false` marks a question the question detector is expected to miss.
export const FACTS = [
  {
    id: "pricing-a",
    topic: "pricing",
    lang: "ru",
    line: "Договорились: с марта подписка будет стоить двенадцать евро в месяц.",
    literal: "подписка двенадцать евро",
    paraphrase: "новая месячная плата для клиентов",
    questions: ["сколько будет стоить подписка?"],
  },
  {
    id: "pricing-b",
    topic: "pricing",
    lang: "ru",
    line: "Скидку для студентов поднимаем до тридцати процентов.",
    literal: "скидка студентов",
    paraphrase: "уступка в цене для учащихся",
    questions: ["какую скидку дадим студентам?"],
  },
  {
    id: "hiring-a",
    topic: "hiring",
    lang: "ru",
    line: "Кандидатка из Валенсии прошла техническое сабеседование, делаем ей оффер.",
    garbled: true,
    literal: "собеседование оффер",
    paraphrase: "приём на работу после интервью",
    questions: ["кому решили сделать оффер?"],
  },
  {
    id: "hiring-b",
    topic: "hiring",
    lang: "ru",
    line: "Испытательный срок для джунов сокращаем до двух месяцев.",
    literal: "испытательный срок",
    paraphrase: "проверочный период новых сотрудников",
    questions: ["какой испытательный срок у джунов?"],
  },
  {
    id: "travel-a",
    topic: "travel",
    lang: "ru",
    line: "Билеты в Лиссабон берём на четырнадцатое, гостиницу бронирует Вера.",
    literal: "билеты Лиссабон",
    paraphrase: "поездка в Португалию",
    questions: ["когда летим в Лиссабон?", { text: "is the Lisbon trip booked?", detected: false }],
  },
  {
    id: "travel-b",
    topic: "travel",
    lang: "ru",
    line: "Суточные в камандировке теперь пятьдесят евро.",
    garbled: true,
    literal: "суточные командировка",
    paraphrase: "дневное пособие в поездке",
    questions: ["сколько суточные в командировке?"],
  },
  {
    id: "release-a",
    topic: "release",
    lang: "ru",
    line: "Релис версии три ноль переносим на следующий вторник из-за бага с оплатой.",
    garbled: true,
    literal: "релиз переносим вторник",
    paraphrase: "выпуск новой версии откладывается",
    questions: ["когда выйдет релиз три ноль?", { text: "почему перенесли релиз?", detected: false }],
  },
  {
    id: "release-b",
    topic: "release",
    lang: "ru",
    line: "Мобильное приложение уходит на ревью в эпстор в пятницу.",
    literal: "приложение ревью",
    paraphrase: "отправка программы на проверку в магазин",
    questions: ["когда приложение отправим на ревью?"],
  },
  {
    id: "lease-a",
    topic: "lease",
    lang: "ru",
    line: "Арендадатель согласился снизить аренду офиса на десять процентов, если продлим договор на три года.",
    garbled: true,
    literal: "арендодатель аренда офиса",
    paraphrase: "хозяин помещения уступает по оплате",
    questions: ["что сказал арендодатель про аренду офиса?"],
  },
  {
    id: "lease-b",
    topic: "lease",
    lang: "ru",
    line: "Залог за склад вернут только после осмотра помещения.",
    literal: "залог склад",
    paraphrase: "депозит за хранилище",
    questions: ["когда вернут залог за склад?", { text: "зачем платить залог за склад?", detected: false }],
  },
  {
    id: "mortgage-a",
    topic: "mortgage",
    lang: "ru",
    line: "Банк одобрил ипатеку под шесть с половиной процентов.",
    garbled: true,
    literal: "ипотека одобрил",
    paraphrase: "кредит на жильё согласовали",
    questions: ["под какой процент дали ипотеку?", { text: "одобрили что-то по ипотеке?", detected: false }],
  },
  {
    id: "mortgage-b",
    topic: "mortgage",
    lang: "ru",
    line: "Первоначальный взнос нужен двадцать процентов от стоимости квартиры.",
    literal: "первоначальный взнос",
    paraphrase: "собственные средства при покупке жилья",
    questions: ["какой нужен первоначальный взнос?"],
  },
  {
    id: "realtor-a",
    topic: "realtor",
    lang: "ru",
    line: "Реелтор показал две квартиры на Русафе, вторая с балконом лучше.",
    garbled: true,
    literal: "риелтор балкон",
    paraphrase: "агент по недвижимости нашёл жильё с лоджией",
    questions: ["какие квартиры показал риелтор?"],
  },
  {
    id: "realtor-b",
    topic: "realtor",
    lang: "ru",
    line: "Комиссия агентства один месяц аренды, платим после подписания.",
    literal: "комиссия агентства",
    paraphrase: "вознаграждение посредника за сделку",
    questions: ["кто платит комиссию агентству?"],
  },
  {
    id: "marketing-a",
    topic: "marketing",
    lang: "ru",
    line: "Бюджет на рекламу в инстаграме урезаем вдвое, переносим деньги в контекст.",
    literal: "бюджет реклама инстаграм",
    paraphrase: "тратим меньше на продвижение в соцсетях",
    questions: ["что решили с бюджетом на рекламу?"],
  },
  {
    id: "pricing-en",
    topic: "pricing",
    lang: "en",
    line: "We will raise the enterprise plan to forty dollars per seat in January.",
    literal: "enterprise plan seat",
    paraphrase: "corporate tier cost increase",
    questions: [
      "how much will the enterprise plan cost?",
      { text: "did we agree on the enterprise price?", detected: false },
    ],
  },
  {
    id: "hiring-en",
    topic: "hiring",
    lang: "en",
    line: "The backend role stays open until we find someone with Postgres experience.",
    literal: "backend role postgres",
    paraphrase: "database engineer vacancy",
    questions: ["who are we hiring for the backend?"],
  },
  {
    id: "travel-en",
    topic: "travel",
    lang: "en",
    line: "The offsite moves from Porto to Seville because the venue cancelled.",
    literal: "offsite seville",
    paraphrase: "team retreat location change",
    questions: ["where is the offsite now?"],
  },
  {
    id: "release-en",
    topic: "release",
    lang: "en",
    line: "We freeze the code on Thursday and ship the release candidate Monday.",
    literal: "code freeze thursday",
    paraphrase: "stop merging before launch",
    questions: ["when is the code freeze?"],
  },
]

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь"]
const DAYS = ["понедельник", "среду", "пятницу", "четверг"]
const EN_MONTHS = ["January", "February", "March", "April"]
const EN_DAYS = ["Monday", "Wednesday", "Friday"]

// Mulberry32: the corpus is the same on every run.
const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const garble = (text, rand) =>
  GARBLE.reduce((out, [from, to]) => {
    if (rand() > 0.3) return out
    const cap = (word) => word[0].toUpperCase() + word.slice(1)
    return out.replaceAll(from, to).replaceAll(cap(from), cap(to))
  }, text)

export const buildCorpus = () => {
  const rand = random(20261022)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const fill = (text, lang) =>
    text
      .replaceAll("{n}", String(2 + Math.floor(rand() * 40)))
      .replaceAll("{month}", pick(lang === "ru" ? MONTHS : EN_MONTHS))
      .replaceAll("{day}", pick(lang === "ru" ? DAYS : EN_DAYS))
      .replaceAll("{name}", pick(lang === "ru" ? RU_PEOPLE : EN_PEOPLE))

  const plan = []
  for (const topic of Object.keys(BACKGROUND)) for (let i = 0; i < 5; i++) plan.push({ topic, lang: "ru", i })
  for (const topic of Object.keys(BACKGROUND_EN)) for (let i = 0; i < 2; i++) plan.push({ topic, lang: "en", i })

  const meetings = plan.map(({ topic, lang, i }, index) => {
    const pool = lang === "ru" ? BACKGROUND : BACKGROUND_EN
    const filler = lang === "ru" ? FILLER_RU : FILLER_EN
    const people = lang === "ru" ? RU_PEOPLE : EN_PEOPLE
    const topics = Object.keys(pool)
    const second = rand() < 0.3 ? pick(topics.filter((other) => other !== topic)) : null
    const count = 20 + Math.floor(rand() * 61)
    const lines = []
    for (let n = 0; n < count; n++) {
      const roll = rand()
      const source = roll < 0.45 ? pool[topic] : second && roll < 0.6 ? pool[second] : filler
      const text = fill(pick(source), lang)
      lines.push({ speaker: pick(people), text: lang === "ru" ? garble(text, rand) : text })
    }
    const facts = FACTS.filter((fact) => fact.topic === topic && fact.lang === lang).filter(
      (_, order) => order % (lang === "ru" ? 5 : 2) === i,
    )
    const planted = facts.map((fact) => {
      const position = 3 + Math.floor(rand() * (lines.length - 6))
      lines.splice(position, 0, { speaker: pick(people), text: fact.line })
      return fact
    })
    const positions = Object.fromEntries(
      planted.map((fact) => [fact.id, lines.findIndex((line) => line.text === fact.line)]),
    )
    return {
      key: `m${String(index + 1).padStart(2, "0")}`,
      title: lang === "ru" ? `Встреча ${index + 1}` : `Meeting ${index + 1}`,
      topic,
      lang,
      lines,
      positions,
    }
  })

  const queries = []
  for (const fact of FACTS) {
    const relevant = meetings
      .filter((meeting) => fact.id in meeting.positions)
      .map((meeting) => ({ meeting: meeting.key, line: meeting.positions[fact.id] }))
    if (relevant.length !== 1) throw new Error(`fact ${fact.id} planted ${relevant.length} times`)
    const base = { fact: fact.id, lang: fact.lang, garbled: Boolean(fact.garbled), relevant }
    queries.push({ ...base, kind: "literal", text: fact.literal })
    queries.push({ ...base, kind: "paraphrase", text: fact.paraphrase })
    for (const question of fact.questions) {
      const { text, detected = true } = typeof question === "string" ? { text: question } : question
      queries.push({ ...base, kind: "question", text, detected })
    }
  }
  return { meetings, queries }
}
